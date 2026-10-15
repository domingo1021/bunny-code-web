/**
 * The realtime protocol of the Bunny Code API v2, written down.
 *
 * The server speaks STOMP at `/api/v2/ws`. These are the payloads on each
 * destination, mirrored from the backend's contract
 * (`.claude/skills/backend/references/api-surface.md` in the API repo). Both
 * the STOMP transport and the in-browser scripted opponent produce exactly
 * these shapes, so the battle UI cannot tell which one it is talking to.
 */

export const QUESTION_LEVELS = ["EASY", "MEDIUM", "HARD"] as const;
export type QuestionLevel = (typeof QUESTION_LEVELS)[number];

export const QUESTION_LEVEL_LABELS: Readonly<Record<QuestionLevel, string>> = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
};

export const BATTLE_STATUSES = [
  "WAITING",
  "RUNNING",
  "FINISHED",
  "TERMINATED",
] as const;
export type BattleStatus = (typeof BATTLE_STATUSES)[number];

export const VERDICTS = [
  "ACCEPTED",
  "WRONG_ANSWER",
  "RUNTIME_ERROR",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABELS: Readonly<Record<Verdict, string>> = {
  ACCEPTED: "Accepted",
  WRONG_ANSWER: "Wrong answer",
  RUNTIME_ERROR: "Runtime error",
  TIME_LIMIT_EXCEEDED: "Time limit exceeded",
  MEMORY_LIMIT_EXCEEDED: "Memory limit exceeded",
};

/** How the viewer takes part in a battle. */
export type ViewerRole = "PLAYER" | "SPECTATOR";

export interface UserSummary {
  readonly id: number;
  readonly name: string;
  readonly pictureUrl: string;
}

/** Broadcast on `/topic/battle-invitations` to everyone online. */
export interface Invitation {
  readonly invitationId: string;
  readonly battleName: string;
  readonly level: QuestionLevel;
  readonly inviterId: number;
  readonly inviterName: string;
  /** ISO instant after which the invitation can no longer be accepted. */
  readonly expiresAt: string;
}

/** Sent to both players on `/user/queue/battles` once someone accepts. */
export interface BattleCreated {
  readonly battleId: number;
}

/** Every failure, on `/user/queue/errors`. */
export interface RealtimeError {
  readonly code: string;
  readonly message: string;
}

export interface QuestionView {
  readonly name: string;
  readonly level: QuestionLevel;
  readonly descriptionUrl: string;
  readonly starterCodeUrl: string;
}

export interface PlayerView {
  readonly user: UserSummary;
  readonly ready: boolean;
  readonly code: string;
  readonly chancesLeft: number;
}

/** The one-off reply to subscribing to `/app/battles/{id}`. */
export interface BattleSnapshot {
  readonly id: number;
  readonly name: string;
  readonly status: BattleStatus;
  readonly question: QuestionView;
  readonly players: readonly [PlayerView, PlayerView];
  readonly viewerRole: ViewerRole;
  readonly winnerId: number | null;
}

/**
 * One judged test case. Hidden cases disclose only `number`, `hidden` and
 * `passed`, so a failing hidden case cannot be reverse-engineered.
 */
export interface TestCaseReport {
  readonly number: number;
  readonly hidden: boolean;
  readonly passed: boolean;
  readonly arguments?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly error?: string;
}

/** Everything broadcast on `/topic/battles/{id}`. */
export type BattleEvent =
  | { readonly type: "PLAYER_READY"; readonly userId: number }
  | { readonly type: "STARTED"; readonly startedAt: string }
  | {
      readonly type: "CODE_CHANGED";
      readonly userId: number;
      readonly code: string;
    }
  | {
      readonly type: "SUBMISSION_JUDGED";
      readonly userId: number;
      readonly verdict: Verdict;
      readonly testCases: readonly TestCaseReport[];
      readonly output: string;
      readonly chancesLeft: number;
    }
  | {
      readonly type: "FINISHED";
      readonly winnerId: number;
      readonly winnerName: string;
      readonly reason: string;
    }
  | { readonly type: "TERMINATED"; readonly reason: string };

export type BattleEventType = BattleEvent["type"];
