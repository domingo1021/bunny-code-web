import {
  BATTLE_STATUSES,
  QUESTION_LEVELS,
  type BattleStatus,
  type QuestionLevel,
} from "@/core/realtime/protocol";

/**
 * The lobby's filters, as they live in the URL.
 *
 * Plain functions in a plain module, so the server page can parse the search
 * parameters and the client lobby can build links from the same rules.
 */

export interface LobbyFilters {
  readonly status: BattleStatus | "";
  readonly level: QuestionLevel | "";
  readonly keyword: string;
  /** One-based, as in the URL. */
  readonly page: number;
}

/** Read the lobby's filters from URL parameters, ignoring anything unknown. */
export function parseLobbyFilters(params: {
  status: string;
  level: string;
  keyword: string;
  page: string;
}): LobbyFilters {
  const page = Number.parseInt(params.page, 10);
  return {
    status: (BATTLE_STATUSES as readonly string[]).includes(params.status)
      ? (params.status as BattleStatus)
      : "",
    level: (QUESTION_LEVELS as readonly string[]).includes(params.level)
      ? (params.level as QuestionLevel)
      : "",
    keyword: params.keyword.slice(0, 50),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function lobbyHref(filters: Partial<LobbyFilters>): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.level) params.set("level", filters.level);
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.page !== undefined && filters.page > 1) {
    params.set("page", String(filters.page));
  }
  const query = params.toString();
  return query === "" ? "/battle" : `/battle?${query}`;
}
