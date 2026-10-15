import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BattleEvent,
  type BattleSnapshot,
  type Invitation,
  type RealtimeError,
} from "@/core/realtime/protocol";
import { battleById, battleByName, resetDatabase } from "@/mocks/db";
import {
  judged,
  MockRealtimeTransport,
  VISIBLE_TEST_CASES,
  type BotProfile,
} from "./mock-transport";

/**
 * The scripted opponent.
 *
 * Everything runs on fake timers, so a battle that takes twenty seconds in the
 * browser takes microseconds to verify. Judging the reader's own submission is
 * the one exception: it spawns a Web Worker, which jsdom does not implement,
 * so it is covered by the Playwright suite (`battle.spec.ts` submits a real
 * solution and wins).
 */

const WINNING_BOT: BotProfile = {
  readyAfterMs: 10,
  thinkForMs: 10,
  keystrokeEveryMs: 1,
  completeness: 1,
};
const LOSING_BOT: BotProfile = { ...WINNING_BOT, completeness: 0.5 };

/** Users 3 and 4 play the seeded live battle, id 4; battle 1 is finished. */
const LIVE_BATTLE = 4;
const FINISHED_BATTLE = 1;
const ME = 1;

let transport: MockRealtimeTransport;

beforeEach(() => {
  resetDatabase();
  vi.useFakeTimers();
});

afterEach(() => {
  transport.disconnect();
  vi.useRealTimers();
});

/** Collect everything the transport says, for assertions. */
function record(instance: MockRealtimeTransport) {
  const seen = {
    invitations: [] as Invitation[],
    created: [] as number[],
    errors: [] as RealtimeError[],
  };
  instance.onInvitation((i) => seen.invitations.push(i));
  instance.onBattleCreated((c) => seen.created.push(c.battleId));
  instance.onError((e) => seen.errors.push(e));
  return seen;
}

function enter(instance: MockRealtimeTransport, battleId: number) {
  const room = {
    snapshots: [] as BattleSnapshot[],
    events: [] as BattleEvent[],
    leave: () => {},
  };
  room.leave = instance.watchBattle(battleId, {
    onSnapshot: (s) => room.snapshots.push(s),
    onEvent: (e) => room.events.push(e),
  });
  return room;
}

const types = (events: readonly BattleEvent[]) => events.map((e) => e.type);

/** Invite, get paired with the bot, and enter the new battle. */
async function newBattle(bot: BotProfile) {
  transport = new MockRealtimeTransport(ME, bot);
  const seen = record(transport);
  transport.invite({ battleName: "my-battle", level: "EASY" });
  await vi.advanceTimersByTimeAsync(600);
  const battleId = seen.created[0]!;
  const room = enter(transport, battleId);
  await vi.advanceTimersByTimeAsync(1);
  return { seen, room, battleId };
}

describe("inviting", () => {
  it("broadcasts the invitation, then pairs the reader with the bot", async () => {
    transport = new MockRealtimeTransport(ME, WINNING_BOT);
    const seen = record(transport);

    transport.invite({ battleName: "my-battle", level: "MEDIUM" });
    await vi.advanceTimersByTimeAsync(0);

    expect(seen.invitations).toHaveLength(1);
    expect(seen.invitations[0]).toMatchObject({
      battleName: "my-battle",
      level: "MEDIUM",
      inviterId: ME,
    });
    expect(Date.parse(seen.invitations[0]!.expiresAt)).toBeGreaterThan(
      Date.now(),
    );

    await vi.advanceTimersByTimeAsync(500);
    const battle = battleByName("my-battle");
    expect(seen.created).toEqual([battle?.battleID]);
    expect(battle).toMatchObject({ status: "WAITING", level: "MEDIUM" });
  });

  it("refuses a name that is already taken", async () => {
    transport = new MockRealtimeTransport(ME, WINNING_BOT);
    const seen = record(transport);

    transport.invite({ battleName: "bracket-brawl", level: "EASY" });
    await vi.advanceTimersByTimeAsync(0);

    expect(seen.errors.map((e) => e.code)).toEqual(["battle.name-taken"]);
    expect(seen.created).toEqual([]);
  });

  it("has no one else's invitation to accept", async () => {
    transport = new MockRealtimeTransport(ME, WINNING_BOT);
    const seen = record(transport);

    transport.acceptInvitation("someone-elses");
    await vi.advanceTimersByTimeAsync(0);

    expect(seen.errors.map((e) => e.code)).toEqual([
      "battle.invitation-expired",
    ]);
  });
});

describe("entering a room", () => {
  it("answers with a snapshot on a later tick, never synchronously", async () => {
    transport = new MockRealtimeTransport(ME, WINNING_BOT);
    const room = enter(transport, FINISHED_BATTLE);
    expect(room.snapshots).toEqual([]);

    await vi.advanceTimersByTimeAsync(0);
    expect(room.snapshots).toHaveLength(1);
  });

  it("describes a finished battle with its winner", async () => {
    transport = new MockRealtimeTransport(ME, WINNING_BOT);
    const room = enter(transport, FINISHED_BATTLE);
    await vi.advanceTimersByTimeAsync(0);

    const snapshot = room.snapshots[0]!;
    expect(snapshot.status).toBe("FINISHED");
    expect(snapshot.winnerId).toBe(battleById(FINISHED_BATTLE)?.winnerID);
    expect(snapshot.question.descriptionUrl).toMatch(/two-sum\.md$/);
  });

  it("reports a battle that does not exist", async () => {
    transport = new MockRealtimeTransport(ME, WINNING_BOT);
    const seen = record(transport);
    enter(transport, 999);
    await vi.advanceTimersByTimeAsync(0);
    expect(seen.errors.map((e) => e.code)).toEqual(["battle.not-found"]);
  });

  it("lets a spectator watch the live battle play out", async () => {
    transport = new MockRealtimeTransport(ME, WINNING_BOT);
    const room = enter(transport, LIVE_BATTLE);
    await vi.advanceTimersByTimeAsync(0);
    expect(room.snapshots[0]?.viewerRole).toBe("SPECTATOR");

    await vi.advanceTimersByTimeAsync(20_000);
    expect(types(room.events)).toContain("STARTED");
    expect(types(room.events)).toContain("CODE_CHANGED");
    expect(types(room.events).at(-1)).toBe("FINISHED");
  });

  it("stops the script when the room is left", async () => {
    transport = new MockRealtimeTransport(ME, WINNING_BOT);
    const room = enter(transport, LIVE_BATTLE);
    await vi.advanceTimersByTimeAsync(1_000);
    room.leave();
    const count = room.events.length;

    await vi.advanceTimersByTimeAsync(20_000);
    expect(room.events).toHaveLength(count);
  });
});

describe("a battle against the bot", () => {
  it("readies up after the reader, then starts", async () => {
    const { room } = await newBattle(WINNING_BOT);
    expect(room.snapshots[0]).toMatchObject({
      status: "WAITING",
      viewerRole: "PLAYER",
    });

    transport.ready(room.snapshots[0]!.id);
    await vi.advanceTimersByTimeAsync(20);

    expect(types(room.events)).toEqual([
      "PLAYER_READY",
      "PLAYER_READY",
      "STARTED",
    ]);
    expect(room.events[0]).toEqual({ type: "PLAYER_READY", userId: ME });
  });

  it("types, submits and wins when the reader is too slow", async () => {
    const { room, battleId } = await newBattle(WINNING_BOT);
    transport.ready(battleId);
    await vi.advanceTimersByTimeAsync(30_000);

    const judgement = room.events.find((e) => e.type === "SUBMISSION_JUDGED");
    expect(judgement).toMatchObject({ verdict: "ACCEPTED", chancesLeft: 2 });
    expect(room.events.at(-1)).toMatchObject({ type: "FINISHED" });
    expect(battleById(battleId)).toMatchObject({ status: "FINISHED" });
    expect(battleById(battleId)?.winnerID).not.toBe(ME);
  });

  it("runs out of submissions with an incomplete solution", async () => {
    const { room, battleId } = await newBattle(LOSING_BOT);
    transport.ready(battleId);
    await vi.advanceTimersByTimeAsync(60_000);

    const verdicts = room.events
      .filter((e) => e.type === "SUBMISSION_JUDGED")
      .map((e) => (e.type === "SUBMISSION_JUDGED" ? e.verdict : null));
    expect(verdicts).toEqual(["WRONG_ANSWER", "WRONG_ANSWER", "WRONG_ANSWER"]);
    expect(room.events.at(-1)).toMatchObject({
      type: "TERMINATED",
      reason: expect.stringMatching(/ran out of submissions/),
    });
  });

  it("refuses a submission before the battle starts", async () => {
    const { seen, battleId } = await newBattle(WINNING_BOT);
    transport.submit(battleId, "return 1;");
    await vi.advanceTimersByTimeAsync(0);
    expect(seen.errors.map((e) => e.code)).toEqual(["battle.not-running"]);
  });

  it("forfeits when the reader leaves mid-battle", async () => {
    const { room, battleId } = await newBattle(WINNING_BOT);
    transport.ready(battleId);
    await vi.advanceTimersByTimeAsync(20);

    transport.leave(battleId);

    expect(room.events.at(-1)).toMatchObject({ type: "TERMINATED" });
    expect(battleById(battleId)?.status).toBe("TERMINATED");
  });

  it("forfeits even after the room has stopped being watched", async () => {
    const { room, battleId } = await newBattle(WINNING_BOT);
    transport.ready(battleId);
    await vi.advanceTimersByTimeAsync(20);

    room.leave();
    transport.leave(battleId);
    expect(battleById(battleId)?.status).toBe("TERMINATED");
  });

  it("does not forfeit a battle that has not started", async () => {
    const { battleId } = await newBattle(WINNING_BOT);
    transport.leave(battleId);
    expect(battleById(battleId)?.status).toBe("WAITING");
  });

  it("starts a second room from a clean slate", async () => {
    const { room, battleId } = await newBattle(WINNING_BOT);
    transport.ready(battleId);
    await vi.advanceTimersByTimeAsync(30_000);
    room.leave();

    const seen = record(transport);
    transport.invite({ battleName: "rematch", level: "EASY" });
    await vi.advanceTimersByTimeAsync(600);
    const rematch = enter(transport, seen.created[0]!);
    await vi.advanceTimersByTimeAsync(1);
    transport.ready(seen.created[0]!);
    await vi.advanceTimersByTimeAsync(20);

    expect(types(rematch.events)).toEqual([
      "PLAYER_READY",
      "PLAYER_READY",
      "STARTED",
    ]);
  });
});

describe("disconnect", () => {
  it("silences everything, including pending replies", async () => {
    transport = new MockRealtimeTransport(ME, WINNING_BOT);
    const seen = record(transport);
    const room = enter(transport, LIVE_BATTLE);
    transport.invite({ battleName: "never", level: "EASY" });

    transport.disconnect();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(room.snapshots).toEqual([]);
    expect(seen.invitations).toEqual([]);
    expect(transport.connected).toBe(false);
  });
});

describe("judged", () => {
  const pass = (n: number) => ({
    name: `case ${n}`,
    expected: "1",
    actual: "1",
    passed: true,
  });

  it("accepts when every case passes, hiding all but the first few", () => {
    const event = judged(ME, [1, 2, 3, 4, 5].map(pass), "", 2);
    expect(event.verdict).toBe("ACCEPTED");
    expect(event.testCases).toHaveLength(5);
    expect(event.testCases.filter((c) => c.hidden)).toHaveLength(
      5 - VISIBLE_TEST_CASES,
    );
    expect(event.testCases[VISIBLE_TEST_CASES]).toEqual({
      number: VISIBLE_TEST_CASES + 1,
      hidden: true,
      passed: true,
    });
  });

  it("stops at the first failure", () => {
    const event = judged(
      ME,
      [pass(1), { ...pass(2), actual: "2", passed: false }, pass(3)],
      "",
      1,
    );
    expect(event.verdict).toBe("WRONG_ANSWER");
    expect(event.testCases.map((c) => c.passed)).toEqual([true, false]);
  });
});
