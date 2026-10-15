import { z } from "zod";
import {
  BATTLE_STATUSES,
  QUESTION_LEVELS,
  VERDICTS,
} from "@/core/realtime/protocol";
import {
  EDIT_ACTIONS,
  type EditAction,
  type EditRecord,
} from "@/core/replay/types";

/**
 * Schemas for everything that crosses the network boundary — REST bodies of
 * the Bunny Code API v2 and the STOMP frames of its realtime channel.
 *
 * Beyond validation, recordings are converted here so the rest of the app only
 * ever sees one representation:
 *
 * - **Timestamps.** The API sends epoch milliseconds; the replay engine works
 *   in nanosecond epoch strings (see `core/replay/types.ts`). Converting once,
 *   at the boundary, is lossless — recordings are made at millisecond
 *   precision.
 * - **Sessions recorded by v1.** The API flags them `format: "LEGACY"`. Their
 *   actions used other spellings (`front`, `CopyLine`, …), a lone `"` was
 *   stored as `""`, and line breaks come back as `\r\n`. All of that is undone
 *   here, so old recordings replay through the same engine as new ones.
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export const userSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  pictureUrl: z.string(),
});

export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    content: z.array(item),
    page: z.number(),
    size: z.number(),
    totalElements: z.number(),
    totalPages: z.number(),
  });

/** For endpoints that answer 204 No Content. */
export const noContentSchema = z.null();

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const userProfileSchema = z.object({
  id: z.number(),
  name: z.string(),
  /** Present only on your own profile. */
  email: z.string().optional(),
  pictureUrl: z.string(),
  profile: z.string().nullable().default(null),
  level: z.number(),
});

export const authResultSchema = z.object({
  accessToken: z.string(),
  tokenType: z.string(),
  expiresAt: z.string(),
  user: userProfileSchema,
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const visibilitySchema = z.enum(["PUBLIC", "PRIVATE"]);

export const projectSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  visibility: visibilitySchema,
  watchCount: z.number(),
  starCount: z.number(),
  createdAt: z.string().nullable(),
  latestVersionName: z.string().nullable(),
  owner: userSummarySchema,
});

export const projectPageSchema = pageOf(projectSummarySchema);

export const projectFileSchema = z.object({
  id: z.number(),
  name: z.string(),
  url: z.string(),
  revision: z.string(),
});

export const recordingSummarySchema = z.object({
  id: z.number(),
  baseFileUrl: z.string(),
  startedAt: z.string(),
  endedAt: z.string(),
});

export const projectVersionSchema = z.object({
  id: z.number(),
  name: z.string(),
  number: z.number(),
  file: projectFileSchema.nullable(),
  /** A version with a recording is replay-only. */
  recording: recordingSummarySchema.nullable(),
});

export const projectDetailSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  visibility: visibilitySchema,
  watchCount: z.number(),
  starCount: z.number(),
  createdAt: z.string().nullable(),
  owner: userSummarySchema,
  starredByViewer: z.boolean(),
  versions: z.array(projectVersionSchema),
});

export const projectReferenceSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const projectStatsSchema = z.object({
  projects: z.number(),
  recordings: z.number(),
});

// ---------------------------------------------------------------------------
// Recordings
// ---------------------------------------------------------------------------

/** Old action spellings to canonical ones. */
export const LEGACY_EDIT_ACTIONS: Readonly<Record<string, EditAction>> = {
  front: "line-start",
  end: "line-end",
  CopyLine: "duplicate-line",
  DeleteLine: "delete-line",
  copyLine: "duplicate-line",
  deleteLine: "delete-line",
};

const editAction = z.preprocess(
  (value) =>
    typeof value === "string" ? (LEGACY_EDIT_ACTIONS[value] ?? value) : value,
  z.enum(EDIT_ACTIONS as readonly [EditAction, ...EditAction[]]),
);

const NANOS_PER_MILLI = BigInt(1_000_000);

/** Epoch milliseconds → the replay engine's nanosecond string. */
export function millisToNanos(millis: number): string {
  return (BigInt(Math.trunc(millis)) * NANOS_PER_MILLI).toString();
}

/** The replay engine's nanosecond string → epoch milliseconds. */
export function nanosToMillis(nanos: string): number {
  try {
    return Number(BigInt(nanos) / NANOS_PER_MILLI);
  } catch {
    return Date.now();
  }
}

/** Undo v1's line-protocol encoding of a code payload. */
export function decodeLegacyCode(code: string): string {
  if (code === '""') return '"';
  if (code === '""""') return '""';
  return code.replace(/\r\n/g, "\n");
}

const recordedEventSchema = z.object({
  action: editAction,
  line: z.number().int().nonnegative().catch(0),
  index: z.number().int().nonnegative().catch(0),
  code: z.string().catch(""),
  timestamp: z.number(),
});

export const recordingSchema = z
  .object({
    id: z.number(),
    baseFileUrl: z.string(),
    startedAt: z.string(),
    endedAt: z.string(),
    format: z.enum(["V2", "LEGACY"]),
    events: z.array(recordedEventSchema),
  })
  .transform(({ events, format, ...recording }) => ({
    ...recording,
    format,
    records: events.map((event): EditRecord => ({
      action: event.action,
      line: event.line,
      index: event.index,
      code: format === "LEGACY" ? decodeLegacyCode(event.code) : event.code,
      timestamp: millisToNanos(event.timestamp),
    })),
  }));

/** An edit record as the API accepts it. */
export function toWireEvent(record: EditRecord) {
  return {
    action: record.action,
    line: record.line,
    index: record.index,
    code: record.code,
    timestamp: nanosToMillis(record.timestamp),
  };
}

export const savedRecordingSchema = z.object({
  recording: recordingSummarySchema,
  file: projectFileSchema,
});

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export const executionOutcomeSchema = z.object({
  status: z.enum(["SUCCEEDED", "FAILED", "TIMED_OUT", "OUT_OF_MEMORY"]),
  output: z.string(),
});

// ---------------------------------------------------------------------------
// Battles (REST)
// ---------------------------------------------------------------------------

export const questionLevelSchema = z.enum(QUESTION_LEVELS);
export const battleStatusSchema = z.enum(BATTLE_STATUSES);

export const battleSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  status: battleStatusSchema,
  watchCount: z.number(),
  questionName: z.string(),
  questionLevel: questionLevelSchema,
  players: z.tuple([userSummarySchema, userSummarySchema]),
  winnerId: z.number().nullable(),
});

export const battlePageSchema = pageOf(battleSummarySchema);

export const questionViewSchema = z.object({
  name: z.string(),
  level: questionLevelSchema,
  descriptionUrl: z.string(),
  starterCodeUrl: z.string(),
});

export const battleDetailSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: battleStatusSchema,
  watchCount: z.number(),
  question: questionViewSchema,
  players: z.tuple([userSummarySchema, userSummarySchema]),
  winner: userSummarySchema.nullable(),
  winnerCodeUrl: z.string().nullable(),
});

export const nameAvailabilitySchema = z.object({
  name: z.string(),
  available: z.boolean(),
});

export const battleStatsSchema = z.object({ battles: z.number() });

// ---------------------------------------------------------------------------
// Realtime frames
// ---------------------------------------------------------------------------

export const invitationSchema = z.object({
  invitationId: z.string(),
  battleName: z.string(),
  level: questionLevelSchema,
  inviterId: z.number(),
  inviterName: z.string(),
  expiresAt: z.string(),
});

export const battleCreatedSchema = z.object({ battleId: z.number() });

export const realtimeErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const playerViewSchema = z.object({
  user: userSummarySchema,
  ready: z.boolean(),
  code: z.string(),
  chancesLeft: z.number(),
});

export const battleSnapshotSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: battleStatusSchema,
  question: questionViewSchema,
  players: z.tuple([playerViewSchema, playerViewSchema]),
  viewerRole: z.enum(["PLAYER", "SPECTATOR"]),
  winnerId: z.number().nullable(),
});

const testCaseReportSchema = z.object({
  number: z.number(),
  hidden: z.boolean(),
  passed: z.boolean(),
  // Absent (or null) on hidden cases, and `error` only when the case threw.
  arguments: z.string().nullish().transform(orUndefined),
  expected: z.string().nullish().transform(orUndefined),
  actual: z.string().nullish().transform(orUndefined),
  error: z.string().nullish().transform(orUndefined),
});

function orUndefined<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

export const battleEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PLAYER_READY"), userId: z.number() }),
  z.object({ type: z.literal("STARTED"), startedAt: z.string() }),
  z.object({
    type: z.literal("CODE_CHANGED"),
    userId: z.number(),
    code: z.string(),
  }),
  z.object({
    type: z.literal("SUBMISSION_JUDGED"),
    userId: z.number(),
    verdict: z.enum(VERDICTS),
    testCases: z.array(testCaseReportSchema),
    output: z.string(),
    chancesLeft: z.number(),
  }),
  z.object({
    type: z.literal("FINISHED"),
    winnerId: z.number(),
    winnerName: z.string(),
    reason: z.string(),
  }),
  z.object({ type: z.literal("TERMINATED"), reason: z.string() }),
]);

// ---------------------------------------------------------------------------

export type UserSummary = z.infer<typeof userSummarySchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type AuthResult = z.infer<typeof authResultSchema>;
export type Visibility = z.infer<typeof visibilitySchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ProjectPage = z.infer<typeof projectPageSchema>;
export type ProjectDetail = z.infer<typeof projectDetailSchema>;
export type ProjectVersion = z.infer<typeof projectVersionSchema>;
export type ProjectFile = z.infer<typeof projectFileSchema>;
export type RecordingSummary = z.infer<typeof recordingSummarySchema>;
export type Recording = z.output<typeof recordingSchema>;
export type ProjectStats = z.infer<typeof projectStatsSchema>;
export type ExecutionOutcome = z.infer<typeof executionOutcomeSchema>;
export type BattleSummary = z.infer<typeof battleSummarySchema>;
export type BattlePage = z.infer<typeof battlePageSchema>;
export type BattleDetail = z.infer<typeof battleDetailSchema>;
