import { applyEdits } from "@/core/replay/applyEdit";
import { docFromText, docToText, type EditRecord } from "@/core/replay/types";
import {
  type BattleCreated,
  type BattleEvent,
  type BattleSnapshot,
  type Invitation,
  type QuestionLevel,
  type RealtimeError,
  type TestCaseReport,
  type Verdict,
} from "@/core/realtime/protocol";
import { EventRegistry, type Disposer } from "@/core/realtime/registry";
import { type RealtimeTransport } from "@/core/realtime/transport";
import { judge, type TestCaseResult } from "@/core/sandbox/testCases";
import {
  battleById,
  battleByName,
  CDN,
  createBattle,
  finishBattle,
  userById,
  type DbBattle,
} from "@/mocks/db";
import { questionByName } from "@/mocks/seed/questions";
import { typeSource } from "@/mocks/seed/typeSource";

/**
 * A scripted opponent, standing in for the realtime server.
 *
 * A battle needs two participants and the demo has one reader, so this plays
 * the other: it readies up, types a real solution keystroke by keystroke
 * (through the same session generator the seeded recordings use), submits,
 * and wins if the reader does not get there first.
 *
 * It implements the same {@link RealtimeTransport} as the STOMP client and
 * emits exactly the v2 snapshots and events the server would, so the battle UI
 * is identical either way. That also makes the whole battle flow deterministic
 * enough to test end to end, which a real opponent never is.
 *
 * One instance lives as long as the app (as the STOMP connection does), so
 * each room starts from a clean slate: entering a room resets the script, and
 * leaving it cancels every timer, so a battle cannot keep running after the
 * reader leaves the page.
 */

/** How the bot behaves. Tunable so tests can make it fast and predictable. */
export interface BotProfile {
  /** Delay before the bot presses ready. */
  readyAfterMs: number;
  /** Delay after the battle starts before the bot begins typing. */
  thinkForMs: number;
  /** Interval between the bot's keystrokes. */
  keystrokeEveryMs: number;
  /**
   * How far through its solution the bot gets before submitting. Below 1 it
   * submits incomplete code and loses, which is what makes the demo winnable.
   */
  completeness: number;
}

export const DEFAULT_BOT: BotProfile = {
  readyAfterMs: 1_200,
  thinkForMs: 1_500,
  keystrokeEveryMs: 55,
  completeness: 0.82,
};

/** The server shows the first three test cases and hides the rest. */
export const VISIBLE_TEST_CASES = 3;
const CHANCES = 3;
/** How long an invitation stays open, as on the server. */
const INVITATION_TTL_MS = 10_000;

interface Channels extends Record<string, unknown> {
  invitation: Invitation;
  battleCreated: BattleCreated;
  error: RealtimeError;
}

interface Room {
  readonly battle: DbBattle;
  readonly onSnapshot: (snapshot: BattleSnapshot) => void;
  readonly onEvent: (event: BattleEvent) => void;
}

export class MockRealtimeTransport implements RealtimeTransport {
  readonly #registry = new EventRegistry<Channels>();
  readonly #timers = new Set<ReturnType<typeof setTimeout>>();
  readonly #userID: number;
  readonly #bot: BotProfile;

  #room: Room | null = null;
  #botRecords: readonly EditRecord[] = [];
  #botTyped = 0;
  #started = false;
  #over = false;
  #humanReady = false;
  #botReady = false;
  #disposed = false;
  #humanChances = CHANCES;
  #botChances = CHANCES;
  #lastHumanCode: string | null = null;

  constructor(userID: number, bot: BotProfile = DEFAULT_BOT) {
    this.#userID = userID;
    this.#bot = bot;
  }

  get connected(): boolean {
    return !this.#disposed;
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
    // A real server cannot answer inside the caller's own stack frame; replying
    // on a later tick keeps the mock honest about that.
    this.#resetRoom();
    this.#later(() => this.#enter(battleId, handlers), 0);
    return () => {
      if (this.#room === null || this.#room.battle.battleID === battleId) {
        this.#resetRoom();
      }
    };
  }

  invite(input: { battleName: string; level: QuestionLevel }): void {
    this.#later(() => this.#onInvite(input), 0);
  }

  acceptInvitation(_invitationId: string): void {
    // Nobody else is online in the demo, so there is never someone else's
    // invitation to accept.
    this.#later(
      () =>
        this.#fail(
          "battle.invitation-expired",
          "This invitation has expired or someone else accepted it first.",
        ),
      0,
    );
  }

  ready(_battleId: number): void {
    this.#later(() => this.#onReady(), 0);
  }

  sendCode(_battleId: number, code: string): void {
    // The opponent is scripted and does not read the reader's code, but a win
    // publishes it.
    this.#lastHumanCode = code;
  }

  submit(_battleId: number, code: string): void {
    this.#lastHumanCode = code;
    void this.#onSubmit(code);
  }

  leave(battleId: number): void {
    // As on the server: leaving a running battle as a player forfeits it,
    // whether or not this client is still watching the room.
    const battle = battleById(battleId);
    const isPlayer =
      battle?.firstUserID === this.#userID ||
      battle?.secondUserID === this.#userID;
    if (battle === undefined || !isPlayer || battle.status !== "RUNNING") {
      return;
    }
    const me = userById(this.#userID)?.userName ?? "You";
    if (this.#room?.battle.battleID === battleId) {
      this.#terminate(`${me} left the battle.`);
    } else {
      battle.status = "TERMINATED";
    }
  }

  disconnect(): void {
    this.#disposed = true;
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers.clear();
    this.#registry.clear();
    this.#room = null;
  }

  // -------------------------------------------------------------------------

  /** Forget the current room: its script, its scores and its timers. */
  #resetRoom(): void {
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers.clear();
    this.#room = null;
    this.#botRecords = [];
    this.#botTyped = 0;
    this.#started = false;
    this.#over = false;
    this.#humanReady = false;
    this.#botReady = false;
    this.#humanChances = CHANCES;
    this.#botChances = CHANCES;
    this.#lastHumanCode = null;
  }

  /** `setTimeout` that is cancelled on disconnect. */
  #later(callback: () => void, ms: number): void {
    const timer = setTimeout(() => {
      this.#timers.delete(timer);
      if (!this.#disposed) callback();
    }, ms);
    this.#timers.add(timer);
  }

  #fail(code: string, message: string): void {
    this.#registry.emit("error", { code, message });
  }

  #publish(event: BattleEvent): void {
    if (!this.#disposed) this.#room?.onEvent(event);
  }

  #enter(
    battleId: number,
    handlers: {
      onSnapshot: (snapshot: BattleSnapshot) => void;
      onEvent: (event: BattleEvent) => void;
    },
  ): void {
    const battle = battleById(battleId);
    if (battle === undefined) {
      this.#fail("battle.not-found", "That battle does not exist.");
      return;
    }

    this.#room = { battle, ...handlers };
    const question = questionByName(battle.questionName);
    const isPlayer =
      battle.firstUserID === this.#userID ||
      battle.secondUserID === this.#userID;

    if (question !== undefined && battle.status !== "FINISHED") {
      this.#botRecords = typeSource(question.solution, {
        keystrokeMs: this.#bot.keystrokeEveryMs,
        seed: battle.battleID || 1,
      }).records;
    }

    handlers.onSnapshot({
      id: battle.battleID,
      name: battle.battleName,
      status: battle.status,
      question: {
        name: battle.questionName,
        level: battle.level,
        descriptionUrl: `${CDN}/questions/${battle.questionName}.md`,
        starterCodeUrl: `${CDN}/questions/${battle.questionName}-base.js`,
      },
      players: [
        this.#player(battle.firstUserID),
        this.#player(battle.secondUserID),
      ],
      viewerRole: isPlayer ? "PLAYER" : "SPECTATOR",
      winnerId: battle.winnerID,
    });

    // A spectator joins a battle already in progress rather than waiting for
    // two people who are not coming.
    if (!isPlayer && battle.status !== "FINISHED") {
      this.#later(() => this.#beginBattle(), 600);
    }
  }

  #player(userID: number) {
    const user = userById(userID);
    return {
      user: {
        id: userID,
        name: user?.userName ?? "unknown",
        pictureUrl: user?.picture ?? "",
      },
      ready: false,
      code: "",
      chancesLeft: CHANCES,
    };
  }

  #onReady(): void {
    if (this.#room === null || this.#started) return;

    this.#humanReady = true;
    this.#publish({ type: "PLAYER_READY", userId: this.#userID });

    this.#later(() => {
      if (this.#botReady) return;
      this.#botReady = true;
      this.#publish({ type: "PLAYER_READY", userId: this.#opponentID() });
      if (this.#humanReady) this.#beginBattle();
    }, this.#bot.readyAfterMs);
  }

  #opponentID(): number {
    const battle = this.#room?.battle;
    if (battle === undefined) return 0;
    return battle.firstUserID === this.#userID
      ? battle.secondUserID
      : battle.firstUserID;
  }

  #beginBattle(): void {
    if (this.#started || this.#room === null) return;
    this.#started = true;
    this.#room.battle.status = "RUNNING";
    this.#publish({ type: "STARTED", startedAt: new Date().toISOString() });

    // The countdown the UI shows runs client-side; typing starts after it.
    this.#later(() => this.#typeNext(), 2_500 + this.#bot.thinkForMs);
  }

  /** Stream the bot's code the way a person would produce it, a few keys at a time. */
  #typeNext(): void {
    if (this.#over || this.#room === null) return;

    const limit = Math.floor(this.#botRecords.length * this.#bot.completeness);
    if (this.#botTyped >= limit) {
      this.#later(() => this.#botSubmit(), 900);
      return;
    }

    this.#botTyped = Math.min(this.#botTyped + 3, limit);
    const doc = applyEdits(
      docFromText(""),
      this.#botRecords.slice(0, this.#botTyped),
    );
    this.#publish({
      type: "CODE_CHANGED",
      userId: this.#opponentID(),
      code: docToText(doc),
    });

    this.#later(() => this.#typeNext(), this.#bot.keystrokeEveryMs * 3);
  }

  /** The bot runs its (possibly incomplete) code and wins only if it passes. */
  #botSubmit(): void {
    if (this.#over || this.#room === null) return;

    const question = questionByName(this.#room.battle.questionName);
    const complete = this.#bot.completeness >= 1;
    this.#botChances = Math.max(this.#botChances - 1, 0);

    const results: TestCaseResult[] = (question?.testCases ?? []).map(
      (testCase, i) => ({
        name: testCase.name,
        expected: testCase.expected,
        actual: complete || i === 0 ? testCase.expected : "undefined",
        passed: complete || i === 0,
      }),
    );
    this.#publish(judged(this.#opponentID(), results, "", this.#botChances));

    if (complete) {
      this.#declareWinner(this.#opponentID(), "passed every test case first.");
      return;
    }

    // Out of submissions and still wrong ends the battle, as on the server.
    if (this.#botChances <= 0) {
      const name = userById(this.#opponentID())?.userName ?? "Your opponent";
      this.#later(
        () => this.#terminate(`${name} ran out of submissions.`),
        1_200,
      );
      return;
    }

    this.#later(() => this.#botSubmit(), 2_500);
  }

  /** Run the reader's submission for real, in a Web Worker, and judge it. */
  async #onSubmit(code: string): Promise<void> {
    const room = this.#room;
    if (room === null || !this.#started || this.#over) {
      this.#fail(
        "battle.not-running",
        "Submissions open once both players are ready.",
      );
      return;
    }
    if (this.#humanChances <= 0) {
      this.#fail("battle.no-chances", "You have no submissions left.");
      return;
    }
    const question = questionByName(room.battle.questionName);
    if (question === undefined) return;

    this.#humanChances -= 1;

    // Imported lazily: the sandbox pulls in a worker, and the lobby should not
    // pay for it just by connecting.
    const { SandboxRunner, programFor } = await import("@/lib/sandbox/client");
    const runner = new SandboxRunner();
    const result = await runner.run(programFor(code, question.testCases));
    runner.cancel();
    if (this.#disposed || this.#room !== room) return;

    const verdict = judge(question.testCases, result.output.split("\n"));
    const event =
      result.status === "ok"
        ? judged(this.#userID, verdict.results, "", this.#humanChances)
        : ({
            type: "SUBMISSION_JUDGED",
            userId: this.#userID,
            verdict:
              result.status === "timeout"
                ? "TIME_LIMIT_EXCEEDED"
                : "RUNTIME_ERROR",
            testCases: [],
            output: result.error ?? "Your code did not run.",
            chancesLeft: this.#humanChances,
          } satisfies BattleEvent);
    this.#publish(event);

    if (result.status === "ok" && verdict.allPassed) {
      const me = userById(this.#userID)?.userName ?? "You";
      this.#declareWinner(this.#userID, `${me} passed every test case!`);
      return;
    }

    if (this.#humanChances <= 0) {
      const me = userById(this.#userID)?.userName ?? "You";
      this.#later(
        () => this.#terminate(`${me} ran out of submissions.`),
        1_200,
      );
    }
  }

  #declareWinner(winnerID: number, reason: string): void {
    const room = this.#room;
    if (this.#over || room === null) return;
    this.#over = true;

    const question = questionByName(room.battle.questionName);
    const winnerCode =
      winnerID === this.#userID
        ? (this.#lastHumanCode ?? "")
        : (question?.solution ?? "");
    finishBattle(room.battle.battleID, winnerID, winnerCode);

    const winnerName = userById(winnerID)?.userName ?? "unknown";
    this.#publish({
      type: "FINISHED",
      winnerId: winnerID,
      winnerName,
      reason: reason.startsWith(winnerName)
        ? reason
        : `${winnerName} ${reason}`,
    });
  }

  #terminate(reason: string): void {
    const room = this.#room;
    if (this.#over || room === null) return;
    this.#over = true;
    room.battle.status = "TERMINATED";
    this.#publish({ type: "TERMINATED", reason });
  }

  #onInvite(input: { battleName: string; level: QuestionLevel }): void {
    if (battleByName(input.battleName) !== undefined) {
      this.#fail("battle.name-taken", "That battle name is already taken.");
      return;
    }
    const opponent = this.#pickOpponent();
    if (opponent === null) {
      this.#fail(
        "battle.no-opponent",
        "No one is available to battle right now.",
      );
      return;
    }

    // Everyone online sees an invitation — the inviter included, as on the
    // server — and the scripted opponent accepts it straight away.
    this.#registry.emit("invitation", {
      invitationId: `mock-${Date.now()}`,
      battleName: input.battleName,
      level: input.level,
      inviterId: this.#userID,
      inviterName: userById(this.#userID)?.userName ?? "you",
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS).toISOString(),
    });

    const battle = createBattle({
      battleName: input.battleName,
      level: input.level,
      firstUserID: this.#userID,
      secondUserID: opponent,
    });
    this.#later(
      () => this.#registry.emit("battleCreated", { battleId: battle.battleID }),
      500,
    );
  }

  /** Any seeded user other than the reader. */
  #pickOpponent(): number | null {
    for (let id = 1; id <= 8; id += 1) {
      if (id !== this.#userID && userById(id) !== undefined) return id;
    }
    return null;
  }
}

/**
 * A judgement as the server reports it: results up to and including the first
 * failure, with only the first {@link VISIBLE_TEST_CASES} shown in full.
 */
export function judged(
  userId: number,
  results: readonly TestCaseResult[],
  output: string,
  chancesLeft: number,
): Extract<BattleEvent, { type: "SUBMISSION_JUDGED" }> {
  const reports: TestCaseReport[] = [];
  let verdict: Verdict = "ACCEPTED";
  for (const [i, result] of results.entries()) {
    const number = i + 1;
    reports.push(
      number > VISIBLE_TEST_CASES
        ? { number, hidden: true, passed: result.passed }
        : {
            number,
            hidden: false,
            passed: result.passed,
            arguments: result.name,
            expected: result.expected,
            actual: result.actual,
          },
    );
    if (!result.passed) {
      verdict = "WRONG_ANSWER";
      break;
    }
  }
  return {
    type: "SUBMISSION_JUDGED",
    userId,
    verdict,
    testCases: reports,
    output,
    chancesLeft,
  };
}
