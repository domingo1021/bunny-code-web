"use client";

import { useQuery } from "@tanstack/react-query";
import { Swords } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
  QUESTION_LEVEL_LABELS,
  QUESTION_LEVELS,
  type BattleStatus,
  type QuestionLevel,
} from "@/core/realtime/protocol";
import { describeError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { battleKeys, fetchBattles } from "../api/battle-api";
import { lobbyHref, type LobbyFilters } from "../model/lobby-filters";
import { BattleCard } from "./battle-card";
import { LaunchBattleDialog } from "./launch-battle-dialog";

/**
 * The battle lobby: browse battles, filter them, and start one.
 *
 * Filters live in the URL so a filtered view is shareable and the back button
 * works, and one query key covers all of them, so changing a filter can never
 * race an earlier request for the previous one.
 */
const STATUS_FILTERS: readonly { label: string; value: BattleStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Live", value: "RUNNING" },
  { label: "Waiting", value: "WAITING" },
  { label: "Finished", value: "FINISHED" },
];

const LEVEL_FILTERS: readonly { label: string; value: QuestionLevel | "" }[] = [
  { label: "Any level", value: "" },
  ...QUESTION_LEVELS.map((level) => ({
    label: QUESTION_LEVEL_LABELS[level],
    value: level,
  })),
];

export function BattleLobby({ filters }: { filters: LobbyFilters }) {
  const { status, level, keyword, page } = filters;
  const battles = useQuery({
    queryKey: battleKeys.lobby(status, level, keyword, page - 1),
    queryFn: ({ signal }) =>
      fetchBattles({ status, level, keyword, page: page - 1, signal }),
    placeholderData: (previous) => previous,
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <FilterRow
            label="Status"
            options={STATUS_FILTERS}
            current={status}
            hrefFor={(value) =>
              lobbyHref({
                ...filters,
                status: value as BattleStatus | "",
                page: 1,
              })
            }
          />
          <FilterRow
            label="Difficulty"
            options={LEVEL_FILTERS}
            current={level}
            hrefFor={(value) =>
              lobbyHref({
                ...filters,
                level: value as QuestionLevel | "",
                page: 1,
              })
            }
          />
        </div>
        <LaunchBattleDialog />
      </div>

      {battles.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <span className="sr-only" role="status">
            Loading battles
          </span>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : battles.isError ? (
        <EmptyState
          title="Could not load battles"
          description={describeError(battles.error)}
        />
      ) : battles.data.content.length === 0 ? (
        <EmptyState
          icon={<Swords className="size-8" />}
          title="No battles match"
          description="Try a different filter, or start one yourself."
          action={
            <Button asChild variant="secondary">
              <Link href="/battle">Clear filters</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          <ul
            aria-label="Battles"
            aria-busy={battles.isPlaceholderData}
            className={cn(
              "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
              battles.isPlaceholderData && "opacity-60 transition-opacity",
            )}
          >
            {battles.data.content.map((battle) => (
              <li key={battle.id}>
                <BattleCard battle={battle} />
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            pageCount={battles.data.totalPages}
            hrefFor={(target) => lobbyHref({ ...filters, page: target })}
          />
        </div>
      )}
    </div>
  );
}

function FilterRow({
  label,
  options,
  current,
  hrefFor,
}: {
  label: string;
  options: readonly { label: string; value: string }[];
  current: string;
  hrefFor: (value: string) => string;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1">
      <span className="text-ink-subtle mr-1 text-xs">{label}</span>
      {options.map((option) => {
        const active = option.value === current;
        return (
          <Link
            key={option.value}
            href={hrefFor(option.value)}
            aria-current={active ? "true" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1 text-sm",
              "focus-visible:outline-brand focus-visible:outline-2 focus-visible:outline-offset-2",
              active
                ? "bg-brand text-brand-ink font-medium"
                : "text-ink-muted hover:bg-surface-raised hover:text-ink",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
