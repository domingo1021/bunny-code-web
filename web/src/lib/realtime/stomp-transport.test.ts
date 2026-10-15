import { type IFrame, type IMessage } from "@stomp/stompjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type BattleEvent,
  type BattleSnapshot,
} from "@/core/realtime/protocol";
import { StompTransport, type StompClientLike } from "./stomp-transport";

/**
 * The STOMP transport against a fake client: what it subscribes to, what it
 * publishes, and how it behaves across a reconnect — without a broker.
 */

class FakeClient implements StompClientLike {
  connected = false;
  onConnect: (frame: IFrame) => void = () => {};
  onStompError: (frame: IFrame) => void = () => {};
  readonly subscriptions = new Map<string, (message: IMessage) => void>();
  readonly published: { destination: string; body: unknown }[] = [];
  readonly unsubscribed: string[] = [];
  activated = 0;
  deactivated = 0;

  activate(): void {
    this.activated += 1;
  }

  deactivate(): void {
    this.deactivated += 1;
    this.connected = false;
  }

  subscribe(destination: string, callback: (message: IMessage) => void) {
    this.subscriptions.set(destination, callback);
    return {
      unsubscribe: () => {
        this.unsubscribed.push(destination);
        this.subscriptions.delete(destination);
      },
    };
  }

  publish(params: { destination: string; body: string }): void {
    this.published.push({
      destination: params.destination,
      body: JSON.parse(params.body) as unknown,
    });
  }

  /** Simulate the broker accepting the connection. */
  connect(): void {
    this.connected = true;
    this.subscriptions.clear();
    this.onConnect({} as IFrame);
  }

  /** Simulate the connection dropping. */
  drop(): void {
    this.connected = false;
  }

  deliver(destination: string, payload: unknown): void {
    const callback = this.subscriptions.get(destination);
    if (callback === undefined)
      throw new Error(`not subscribed: ${destination}`);
    callback({ body: JSON.stringify(payload) } as IMessage);
  }
}

const SNAPSHOT: BattleSnapshot = {
  id: 7,
  name: "duel",
  status: "WAITING",
  question: {
    name: "two-sum",
    level: "EASY",
    descriptionUrl: "http://s3/q.md",
    starterCodeUrl: "http://s3/q.js",
  },
  players: [
    {
      user: { id: 1, name: "a", pictureUrl: "" },
      ready: false,
      code: "",
      chancesLeft: 3,
    },
    {
      user: { id: 2, name: "b", pictureUrl: "" },
      ready: false,
      code: "",
      chancesLeft: 3,
    },
  ],
  viewerRole: "PLAYER",
  winnerId: null,
};

let transport: StompTransport | null = null;

afterEach(() => {
  transport?.disconnect();
  transport = null;
  vi.restoreAllMocks();
});

function connected() {
  const client = new FakeClient();
  transport = new StompTransport("ws://test/ws", "token", client);
  client.connect();
  return { client, transport };
}

describe("connecting", () => {
  it("activates once and holds the standing subscriptions", () => {
    const { client } = connected();
    expect(client.activated).toBe(1);
    expect([...client.subscriptions.keys()].toSorted()).toEqual([
      "/topic/battle-invitations",
      "/user/queue/battles",
      "/user/queue/errors",
    ]);
  });

  it("reports a refused connection as an error", () => {
    const client = new FakeClient();
    transport = new StompTransport("ws://test/ws", null, client);
    const errors: string[] = [];
    transport.onError((e) => errors.push(e.code));

    client.onStompError({
      headers: { message: "Invalid access token" },
    } as unknown as IFrame);
    expect(errors).toEqual(["realtime.refused"]);
  });
});

describe("standing channels", () => {
  it("delivers invitations, created battles and errors, parsed", () => {
    const { client, transport } = connected();
    const seen: unknown[] = [];
    transport.onInvitation((i) => seen.push(i.battleName));
    transport.onBattleCreated((c) => seen.push(c.battleId));
    transport.onError((e) => seen.push(e.code));

    client.deliver("/topic/battle-invitations", {
      invitationId: "abc",
      battleName: "duel",
      level: "HARD",
      inviterId: 2,
      inviterName: "b",
      expiresAt: "2026-10-14T12:00:30Z",
    });
    client.deliver("/user/queue/battles", { battleId: 7 });
    client.deliver("/user/queue/errors", {
      code: "battle.name-taken",
      message: "taken",
    });

    expect(seen).toEqual(["duel", 7, "battle.name-taken"]);
  });

  it("drops a frame that does not match its schema", () => {
    const { client, transport } = connected();
    const created = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    transport.onBattleCreated(created);

    client.deliver("/user/queue/battles", { battleId: "seven" });

    expect(created).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
  });
});

describe("watching a battle", () => {
  it("subscribes to the room's topic before asking for the snapshot", () => {
    const { client, transport } = connected();
    const order: string[] = [];
    const subscribe = client.subscribe.bind(client);
    client.subscribe = (destination, callback) => {
      order.push(destination);
      return subscribe(destination, callback);
    };

    transport.watchBattle(7, { onSnapshot: () => {}, onEvent: () => {} });

    expect(order).toEqual(["/topic/battles/7", "/app/battles/7"]);
  });

  it("delivers the snapshot and then each event", () => {
    const { client, transport } = connected();
    const snapshots: BattleSnapshot[] = [];
    const events: BattleEvent[] = [];
    transport.watchBattle(7, {
      onSnapshot: (s) => snapshots.push(s),
      onEvent: (e) => events.push(e),
    });

    client.deliver("/app/battles/7", SNAPSHOT);
    client.deliver("/topic/battles/7", { type: "PLAYER_READY", userId: 2 });
    client.deliver("/topic/battles/7", {
      type: "SUBMISSION_JUDGED",
      userId: 2,
      verdict: "WRONG_ANSWER",
      testCases: [
        {
          number: 4,
          hidden: true,
          passed: false,
          arguments: null,
          expected: null,
        },
      ],
      output: "",
      chancesLeft: 2,
    });

    expect(snapshots).toEqual([SNAPSHOT]);
    expect(events.map((e) => e.type)).toEqual([
      "PLAYER_READY",
      "SUBMISSION_JUDGED",
    ]);
    // Hidden cases arrive with nulls; they reach the UI as absent fields.
    const judged = events[1];
    expect(judged?.type === "SUBMISSION_JUDGED" && judged.testCases[0]).toEqual(
      { number: 4, hidden: true, passed: false },
    );
  });

  it("resubscribes after a reconnect, which re-requests the snapshot", () => {
    const { client, transport } = connected();
    const snapshots: BattleSnapshot[] = [];
    transport.watchBattle(7, {
      onSnapshot: (s) => snapshots.push(s),
      onEvent: () => {},
    });

    client.drop();
    client.connect();
    client.deliver("/app/battles/7", SNAPSHOT);

    expect(client.subscriptions.has("/topic/battles/7")).toBe(true);
    expect(snapshots).toHaveLength(1);
  });

  it("unsubscribes when the room is left, and not again on reconnect", () => {
    const { client, transport } = connected();
    const stop = transport.watchBattle(7, {
      onSnapshot: () => {},
      onEvent: () => {},
    });

    stop();
    expect(client.unsubscribed).toEqual(["/app/battles/7", "/topic/battles/7"]);

    client.connect();
    expect(client.subscriptions.has("/topic/battles/7")).toBe(false);
  });
});

describe("commands", () => {
  it("publishes each command to its destination", () => {
    const { client, transport } = connected();

    transport.invite({ battleName: "duel", level: "EASY" });
    transport.acceptInvitation("a/b");
    transport.ready(7);
    transport.sendCode(7, "x");
    transport.submit(7, "y");
    transport.leave(7);

    expect(client.published).toEqual([
      {
        destination: "/app/battle-invitations",
        body: { battleName: "duel", level: "EASY" },
      },
      { destination: "/app/battle-invitations/a%2Fb/accept", body: {} },
      { destination: "/app/battles/7/ready", body: {} },
      { destination: "/app/battles/7/code", body: { code: "x" } },
      { destination: "/app/battles/7/submissions", body: { code: "y" } },
      { destination: "/app/battles/7/leave", body: {} },
    ]);
  });

  it("queues commands sent before the connection is up", () => {
    const client = new FakeClient();
    transport = new StompTransport("ws://test/ws", "token", client);

    transport.ready(7);
    expect(client.published).toEqual([]);

    client.connect();
    expect(client.published).toEqual([
      { destination: "/app/battles/7/ready", body: {} },
    ]);
  });

  it("goes quiet after disconnecting", () => {
    const { client, transport } = connected();
    const created = vi.fn();
    transport.onBattleCreated(created);

    transport.disconnect();
    transport.ready(7);

    expect(client.deactivated).toBe(1);
    expect(client.published).toEqual([]);
  });
});
