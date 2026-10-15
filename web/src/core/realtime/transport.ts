import {
  type BattleCreated,
  type BattleEvent,
  type BattleSnapshot,
  type Invitation,
  type QuestionLevel,
  type RealtimeError,
} from "./protocol";
import { type Disposer } from "./registry";

/**
 * The realtime boundary.
 *
 * One method per server destination or command, rather than a generic
 * `emit(name, payload)`: the v2 protocol is small, and naming each operation
 * means the UI never handles destination strings or wire framing. Two
 * implementations exist — STOMP against the real API, and an in-browser
 * scripted opponent for the demo — and tests can drive a third.
 */
export interface RealtimeTransport {
  readonly connected: boolean;

  /** Invitations broadcast to everyone online, including your own. */
  onInvitation(handler: (invitation: Invitation) => void): Disposer;

  /** "Your battle is ready" — for the inviter and the person who accepted. */
  onBattleCreated(handler: (created: BattleCreated) => void): Disposer;

  /** Failures of anything this session sent. */
  onError(handler: (error: RealtimeError) => void): Disposer;

  /**
   * Enter a battle room: delivers one snapshot, then every event. Disposing
   * leaves the room's channel (it does not forfeit — see {@link leave}).
   */
  watchBattle(
    battleId: number,
    handlers: {
      onSnapshot: (snapshot: BattleSnapshot) => void;
      onEvent: (event: BattleEvent) => void;
    },
  ): Disposer;

  invite(input: { battleName: string; level: QuestionLevel }): void;
  acceptInvitation(invitationId: string): void;
  ready(battleId: number): void;
  sendCode(battleId: number, code: string): void;
  submit(battleId: number, code: string): void;
  /** Leave a battle; leaving a running battle forfeits it. */
  leave(battleId: number): void;

  /** Close the connection and drop every handler. */
  disconnect(): void;
}
