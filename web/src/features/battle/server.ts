/**
 * Server-only surface of the battle feature (see `projects/server.ts` for why
 * this is separate from the barrel, and why the demo reads the seed directly).
 */
import { cacheLife } from "next/cache";
import { USING_MOCK_API } from "@/lib/env";
import { db } from "@/mocks/db";
import { fetchBattleStats } from "./api/battle-api";

/** How many battles have been fought, or `null` if the API is unreachable. */
export async function battleCount(): Promise<number | null> {
  if (USING_MOCK_API) return seededBattleCount();
  try {
    return (await fetchBattleStats()).battles;
  } catch {
    return null;
  }
}

async function seededBattleCount(): Promise<number> {
  "use cache";
  cacheLife("max");
  return db().battles.length;
}
