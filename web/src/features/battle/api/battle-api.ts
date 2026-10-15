import {
  type BattleStatus,
  type QuestionLevel,
} from "@/core/realtime/protocol";
import { apiRequest } from "@/lib/api-client";
import {
  battleDetailSchema,
  battlePageSchema,
  battleStatsSchema,
  nameAvailabilitySchema,
} from "@/lib/schemas";

export const battleKeys = {
  lobby: (status: string, level: string, keyword: string, page: number) =>
    ["battles", "lobby", status, level, keyword, page] as const,
  detail: (battleID: number) => ["battles", "detail", battleID] as const,
  stats: ["battles", "stats"] as const,
};

export const LOBBY_PAGE_SIZE = 12;

/** The lobby. An empty status or level means "any". */
export function fetchBattles(input: {
  status: BattleStatus | "";
  level: QuestionLevel | "";
  keyword: string;
  page: number;
  signal?: AbortSignal;
}) {
  return apiRequest("/battles", {
    schema: battlePageSchema,
    searchParams: {
      status: input.status,
      level: input.level,
      keyword: input.keyword,
      page: input.page,
      size: LOBBY_PAGE_SIZE,
    },
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
}

/** Whether a battle name is still free; checked before inviting anyone. */
export async function isBattleNameAvailable(name: string): Promise<boolean> {
  const result = await apiRequest("/battles/name-availability", {
    schema: nameAvailabilitySchema,
    searchParams: { name },
  });
  return result.available;
}

/** A battle's question, players and — once finished — its winner. */
export function fetchBattleDetail(battleID: number, signal?: AbortSignal) {
  return apiRequest(`/battles/${battleID}`, {
    schema: battleDetailSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function fetchBattleStats(signal?: AbortSignal) {
  return apiRequest("/stats/battles", {
    schema: battleStatsSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}
