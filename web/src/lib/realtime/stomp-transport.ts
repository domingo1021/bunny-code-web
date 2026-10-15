import {
  Client,
  type IFrame,
  type IMessage,
  type StompSubscription,
} from "@stomp/stompjs";
import { type z } from "zod";
import {
  type BattleCreated,
  type BattleEvent,
  type BattleSnapshot,
  type Invitation,
  type QuestionLevel,
  type RealtimeError,
} from "@/core/realtime/protocol";
import { EventRegistry, type Disposer } from "@/core/realtime/registry";
import { type RealtimeTransport } from "@/core/realtime/transport";
import {
  battleCreatedSchema,
  battleEventSchema,
  battleSnapshotSchema,
  invitationSchema,
  realtimeErrorSchema,
} from "@/lib/schemas";

/** The parts of a STOMP client this transport uses — narrow, so tests can fake it. */
export interface StompClientLike {
  readonly connected: boolean;
  onConnect: (frame: IFrame) => void;
  onStompError: (frame: IFrame) => void;
  activate(): void;
  deactivate(): Promise<void> | void;
  subscribe(
    destination: string,
    callback: (message: IMessage) => void,
  ): Pick<StompSubscription, "unsubscribe">;
  publish(params: { destination: string; body: string }): void;
}

interface Channels extends Record<string, unknown> {
  invitation: Invitation;
  battleCreated: BattleCreated;
  error: RealtimeError;
}

interface WantedSubscription {
  readonly destination: string;
  readonly onMessage: (message: IMessage) => void;
  active: Pick<StompSubscription, "unsubscribe"> | null;
}

/**
 * The Bunny Code realtime API over STOMP.
 *
 * - Subscriptions are *wanted* rather than made: they are (re)established on
 *   every connect, so a dropped connection that reconnects resubscribes by
 *   itself — and re-requests the battle snapshot, which resynchronises a room
 *   instead of letting it drift.
 * - Commands sent before the connection is up are queued and flushed on
 *   connect, so the UI never has to wait for "connected" before acting.
 * - Every frame is parsed with its Zod schema; a frame that does not match is
 *   reported and dropped rather than fed to a reducer half-formed.
 */
export class StompTransport implements RealtimeTransport {
  readonly #client: StompClientLike;
  readonly #registry = new EventRegistry<Channels>();
  readonly #wanted = new Map<string, WantedSubscription>();
  readonly #outbox: { destination: string; body: string }[] = [];
  #disposed = false;

  constructor(url: string, token: string | null, client?: StompClientLike) {
    this.#client =
      client ??
      new Client({
        brokerURL: url,
        connectHeaders:
          token === null ? {} : { Authorization: `Bearer ${token}` },
        reconnectDelay: 2_000,
        heartbeatIncoming: 10_000,
        heartbeatOutgoing: 10_000,
      });

    this.#client.onConnect = () => this.#onConnect();
    this.#client.onStompError = (frame) => {
      this.#registry.emit("error", {
        code: "realtime.refused",
        message:
          frame.headers.message ?? "The realtime connection was refused.",
      });
    };

    // Standing subscriptions: every screen may need them, and they are cheap.
    this.#want("errors", "/user/queue/errors", realtimeErrorSchema, (error) =>
      this.#registry.emit("error", error),
    );
    this.#want(
      "battles",
      "/user/queue/battles",
      battleCreatedSchema,
      (created) => this.#registry.emit("battleCreated", created),
    );
    this.#want(
      "invitations",
      "/topic/battle-invitations",
      invitationSchema,
      (invitation) => this.#registry.emit("invitation", invitation),
    );

    this.#client.activate();
  }

  get connected(): boolean {
    return this.#client.connected;
  }

  onInvitation(handler: (invitation: Invitation) => void): Disposer {
    return this.#registry.add("invitation", handler);
  }

  onBattleCreated(handler: (created: BattleCreated) => void): Disposer {
    return this.#registry.add("battleCreated", handler);
  }

  onError(handler: (error: RealtimeError) => void): Disposer {
    return this.#registry.add("error", handler);
  }

  watchBattle(
    battleId: number,
    handlers: {
      onSnapshot: (snapshot: BattleSnapshot) => void;
      onEvent: (event: BattleEvent) => void;
    },
  ): Disposer {
    // Order matters: the room's topic first, then the snapshot request, so no
    // event can fall between the snapshot and the subscription.
    const events = this.#want(
      `battle-events:${battleId}`,
      `/topic/battles/${battleId}`,
      battleEventSchema,
      (event) => handlers.onEvent(event as BattleEvent),
    );
    const snapshot = this.#want(
      `battle-snapshot:${battleId}`,
      `/app/battles/${battleId}`,
      battleSnapshotSchema,
      (value) => handlers.onSnapshot(value as BattleSnapshot),
    );
    return () => {
      snapshot();
      events();
    };
  }

  invite(input: { battleName: string; level: QuestionLevel }): void {
    this.#send("/app/battle-invitations", input);
  }

  acceptInvitation(invitationId: string): void {
    this.#send(
      `/app/battle-invitations/${encodeURIComponent(invitationId)}/accept`,
      {},
    );
  }

  ready(battleId: number): void {
    this.#send(`/app/battles/${battleId}/ready`, {});
  }

  sendCode(battleId: number, code: string): void {
    this.#send(`/app/battles/${battleId}/code`, { code });
  }

  submit(battleId: number, code: string): void {
    this.#send(`/app/battles/${battleId}/submissions`, { code });
  }

  leave(battleId: number): void {
    this.#send(`/app/battles/${battleId}/leave`, {});
  }

  disconnect(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#registry.clear();
    this.#wanted.clear();
    this.#outbox.length = 0;
    void this.#client.deactivate();
  }

  // -------------------------------------------------------------------------

  #onConnect(): void {
    for (const wanted of this.#wanted.values()) {
      wanted.active = this.#client.subscribe(
        wanted.destination,
        wanted.onMessage,
      );
    }
    for (const frame of this.#outbox.splice(0)) {
      this.#client.publish(frame);
    }
  }

  #want<T>(
    key: string,
    destination: string,
    schema: z.ZodType<T>,
    deliver: (payload: T) => void,
  ): Disposer {
    const wanted: WantedSubscription = {
      destination,
      onMessage: (message) => {
        const parsed = schema.safeParse(parseJson(message.body));
        if (parsed.success) {
          deliver(parsed.data);
        } else {
          console.error(
            `[realtime] unexpected frame on ${destination}`,
            parsed.error.issues,
          );
        }
      },
      active: null,
    };
    this.#wanted.get(key)?.active?.unsubscribe();
    this.#wanted.set(key, wanted);
    if (this.#client.connected) {
      wanted.active = this.#client.subscribe(destination, wanted.onMessage);
    }
    return () => {
      if (this.#wanted.get(key) !== wanted) return;
      this.#wanted.delete(key);
      if (this.#client.connected) wanted.active?.unsubscribe();
    };
  }

  #send(destination: string, payload: unknown): void {
    if (this.#disposed) return;
    const frame = { destination, body: JSON.stringify(payload) };
    if (this.#client.connected) {
      this.#client.publish(frame);
    } else {
      this.#outbox.push(frame);
    }
  }
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}
