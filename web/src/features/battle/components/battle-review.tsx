"use client";

import { useQuery } from "@tanstack/react-query";
import { Crown, Eye } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Markdown } from "@/components/ui/markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { QUESTION_LEVEL_LABELS } from "@/core/realtime/protocol";
import { docFromText } from "@/core/replay/types";
import {
  UserProfile,
  UserProfileSkeleton,
  useUserDetail,
} from "@/features/user";
import { describeError, fetchText } from "@/lib/api-client";
import { formatCount } from "@/lib/format";
import { battleKeys, fetchBattleDetail } from "../api/battle-api";

const CodeEditor = dynamic(
  () =>
    import("@/features/workspace/components/code-editor").then(
      (m) => m.CodeEditor,
    ),
  { ssr: false, loading: () => <Skeleton className="h-full min-h-72" /> },
);

/**
 * A finished battle: the question, the winner, and their solution.
 *
 * Plain REST — a finished battle no longer changes, so there is nothing to
 * stream. The winner's code is a file in object storage, fetched like any
 * other.
 */
export function BattleReview({ battleID }: { battleID: number }) {
  const detail = useQuery({
    queryKey: battleKeys.detail(battleID),
    queryFn: ({ signal }) => fetchBattleDetail(battleID, signal),
    enabled: Number.isFinite(battleID),
  });
  const battle = detail.data;
  const winnerID = battle?.winner?.id ?? Number.NaN;
  const winnerProfile = useUserDetail(winnerID);

  const code = useQuery({
    queryKey: ["battle", "winner-code", battle?.winnerCodeUrl],
    queryFn: ({ signal }) => fetchText(battle?.winnerCodeUrl ?? "", signal),
    enabled: (battle?.winnerCodeUrl ?? null) !== null,
    staleTime: Infinity,
  });

  const question = useQuery({
    queryKey: ["battle", "question", battle?.question.descriptionUrl],
    queryFn: ({ signal }) =>
      fetchText(battle?.question.descriptionUrl ?? "", signal),
    enabled: battle !== undefined,
    staleTime: Infinity,
  });

  if (!Number.isFinite(battleID) || detail.isError) {
    return (
      <EmptyState
        className="m-4"
        title="No such battle"
        description={
          detail.isError
            ? describeError(detail.error)
            : "This battle does not exist."
        }
        action={
          <Button asChild variant="secondary">
            <Link href="/battle">Back to the lobby</Link>
          </Button>
        }
      />
    );
  }

  if (battle === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <span className="sr-only" role="status">
          Loading the result
        </span>
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
          <Skeleton className="h-64" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const winner = battle.winner;
  if (winner === null) {
    return (
      <EmptyState
        className="m-4"
        title={`${battle.name} has no winner`}
        description={
          battle.status === "TERMINATED"
            ? "This battle ended without a winner."
            : "This battle has not finished yet."
        }
        action={
          <Button asChild variant="secondary">
            <Link
              href={
                battle.status === "TERMINATED"
                  ? "/battle"
                  : `/battle/${battle.id}`
              }
            >
              {battle.status === "TERMINATED"
                ? "Back to the lobby"
                : "Go to the battle"}
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {battle.name}
        </h1>
        <p className="text-ink-subtle mt-1 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-warning inline-flex items-center gap-1">
            <Crown aria-hidden="true" className="size-4" />
            {winner.name} won
          </span>
          <span>
            {QUESTION_LEVEL_LABELS[battle.question.level]} ·{" "}
            <span className="font-mono">{battle.question.name}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Eye aria-hidden="true" className="size-3.5" />
            {formatCount(battle.watchCount)} watched
          </span>
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <div className="flex flex-col gap-6">
          {winnerProfile.data === undefined ? (
            <UserProfileSkeleton />
          ) : (
            <UserProfile headingLevel="h2" user={winnerProfile.data} />
          )}
          <section
            aria-label="Question"
            className="rounded-card border-edge bg-surface border p-4"
          >
            {question.data === undefined ? (
              <Skeleton className="h-40" />
            ) : (
              <Markdown>{question.data}</Markdown>
            )}
          </section>
        </div>

        <section
          aria-label="Winning solution"
          className="rounded-card border-edge bg-surface flex min-h-0 flex-col overflow-hidden border"
        >
          <header className="border-edge border-b px-3 py-2">
            <h2 className="text-ink-muted text-xs font-medium">
              {winner.name}&rsquo;s solution
            </h2>
          </header>
          <div className="min-h-72 flex-1">
            {code.data === undefined ? (
              <Skeleton className="h-full min-h-72 rounded-none" />
            ) : (
              <CodeEditor
                mode="plain"
                doc={docFromText(code.data)}
                readOnly
                label={`${winner.name}'s winning solution, read only`}
                height="100%"
              />
            )}
          </div>
        </section>
      </div>

      <div>
        <Button asChild variant="secondary">
          <Link href="/battle">Back to the lobby</Link>
        </Button>
      </div>
    </div>
  );
}
