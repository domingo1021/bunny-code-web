"use client";

import { Check, EyeOff, Loader2, Send, Swords, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Markdown } from "@/components/ui/markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { VERDICT_LABELS } from "@/core/realtime/protocol";
import { docFromText } from "@/core/replay/types";
import { cn } from "@/lib/cn";
import { useBattle } from "../hooks/use-battle";
import {
  canEdit,
  canReady,
  canSubmit,
  isSpectator,
  viewerPlayer,
  type BattleState,
  type Player,
} from "../model/battle-reducer";
import { BATTLE_WELCOME } from "../model/rules";

const CodeEditor = dynamic(
  () =>
    import("@/features/workspace/components/code-editor").then(
      (m) => m.CodeEditor,
    ),
  { ssr: false, loading: () => <Skeleton className="h-full min-h-56" /> },
);

/**
 * The battle room.
 *
 * Two editors side by side, a question board, and per-player results. The
 * whole screen is driven by one reducer, so what is interactive at any moment
 * follows from `phase` rather than from a handful of booleans that could
 * disagree.
 */
export function BattleRoom({ battleID }: { battleID: number }) {
  const battle = useBattle(battleID);
  const { state } = battle;

  if (state.phase === "not-found" || !Number.isFinite(battleID)) {
    return (
      <EmptyState
        className="m-4"
        title="No such battle"
        description="This battle does not exist, or it has been cleaned up."
        action={
          <Button asChild variant="secondary">
            <Link href="/battle">Back to the lobby</Link>
          </Button>
        }
      />
    );
  }

  if (battle.needsSignIn) {
    return (
      <EmptyState
        className="m-4"
        title="Log in to join the battle"
        description="Battles are live, and only signed-in players and spectators can connect."
        action={
          <Button asChild variant="primary">
            <Link href={`/login?redirect=/battle/${battleID}`}>Log in</Link>
          </Button>
        }
      />
    );
  }

  if (battle.isConnecting) {
    return (
      <div className="m-4 flex flex-col gap-4">
        <span className="sr-only" role="status">
          Joining the battle
        </span>
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  // The question is withheld until the battle starts, so neither player can
  // plan ahead of the other.
  const board =
    state.phase === "battling" || state.phase === "over"
      ? battle.questionMarkdown
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display flex items-center gap-2 text-xl font-semibold">
            <Swords aria-hidden="true" className="text-brand size-5" />
            {state.name}
          </h1>
          <p className="text-ink-subtle mt-1 text-xs">
            {isSpectator(state)
              ? "You are watching this battle."
              : "First correct solution wins. Three submissions each."}
          </p>
        </div>
        <PhaseBanner
          state={state}
          battleID={battleID}
          onReady={battle.setReady}
        />
      </header>

      <div className="grid min-h-0 gap-4 lg:grid-cols-[22rem_1fr]">
        <section
          aria-label="Question"
          className="rounded-card border-edge bg-surface max-h-[22rem] overflow-y-auto border p-4 lg:max-h-none"
        >
          <Markdown>{board ?? BATTLE_WELCOME}</Markdown>
        </section>

        <div className="grid min-h-0 gap-4 md:grid-cols-2">
          {state.players.map((player, index) => (
            <PlayerPane
              key={player.user.id === 0 ? index : player.user.id}
              state={state}
              player={player}
              onCodeChange={battle.updateCode}
              onSubmit={battle.submit}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * A visible countdown, so the start is not a surprise.
 *
 * Its own component, mounted only while counting, so the initial value comes
 * from `useState` rather than being reset inside an effect.
 */
function Countdown() {
  const [remaining, setRemaining] = useState(3);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((current) => (current > 1 ? current - 1 : 1));
    }, 800);
    return () => clearInterval(timer);
  }, []);

  return (
    <p
      aria-live="assertive"
      className="bg-brand/15 text-brand rounded-md px-3 py-2 text-sm font-semibold"
    >
      Starting in {remaining}…
    </p>
  );
}

function PhaseBanner({
  state,
  battleID,
  onReady,
}: {
  state: BattleState;
  battleID: number;
  onReady: () => void;
}) {
  if (state.phase === "countdown") return <Countdown />;

  if (state.phase === "over") {
    return (
      <div
        aria-live="assertive"
        className="border-edge bg-surface-raised flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm"
      >
        {state.winner !== null ? (
          <>
            <p>
              <strong className="text-brand">{state.winner.name}</strong> won —{" "}
              {state.winner.reason}
            </p>
            <Link
              href={`/battle/review/${battleID}`}
              className="text-brand font-medium hover:underline"
            >
              See the winning code
            </Link>
          </>
        ) : (
          <p>Battle terminated — {state.terminatedReason}</p>
        )}
      </div>
    );
  }

  if (state.phase === "waiting") {
    const mine = viewerPlayer(state);
    return canReady(state) ? (
      <Button variant="primary" onClick={onReady}>
        I&rsquo;m ready
      </Button>
    ) : (
      <p
        aria-live="polite"
        className="border-edge text-ink-muted rounded-md border px-3 py-2 text-sm"
      >
        {mine?.ready === true
          ? "Waiting for your opponent…"
          : "Waiting for both players…"}
      </p>
    );
  }

  return null;
}

function PlayerPane({
  state,
  player,
  onCodeChange,
  onSubmit,
}: {
  state: BattleState;
  player: Player;
  onCodeChange: (code: string) => void;
  onSubmit: (code: string) => void;
}) {
  const editable = canEdit(state, player);
  const isMine = state.role === "PLAYER" && player.user.id === state.viewerID;
  const won = state.winner?.userId === player.user.id;
  const name = player.user.name || "—";
  const code = player.code;

  return (
    <section
      aria-label={`${name}'s code`}
      className={cn(
        "rounded-card bg-surface flex min-h-0 flex-col overflow-hidden border",
        won ? "border-brand" : "border-edge",
      )}
    >
      <header className="border-edge flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="min-w-0 truncate text-sm font-medium">
          <Link href={`/user/${player.user.id}`} className="hover:underline">
            {name}
          </Link>
          {isMine && <span className="text-brand ml-1 text-xs">(you)</span>}
        </h2>
        <div className="flex items-center gap-2">
          {state.phase !== "over" && (
            <span
              className="text-ink-subtle text-xs"
              aria-label={`${player.chancesLeft} submissions remaining`}
            >
              {player.chancesLeft} left
            </span>
          )}
          {player.ready && state.phase === "waiting" && (
            <span className="bg-success/15 text-success rounded px-1.5 py-0.5 text-[0.6875rem]">
              Ready
            </span>
          )}
        </div>
      </header>

      <div className="min-h-56 flex-1">
        {/*
         * Plain mode: a battle is not a recorded session. Only the resulting
         * text is streamed to the opponent, so CodeMirror does the editing and
         * reports the document — there is no edit log to keep faithful.
         */}
        <CodeEditor
          mode="plain"
          doc={docFromText(code)}
          readOnly={!editable}
          label={`${name}'s editor${editable ? "" : ", read only"}`}
          onChange={editable ? onCodeChange : undefined}
          height="100%"
        />
      </div>

      {isMine && (
        <div className="border-edge border-t px-3 py-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => onSubmit(code)}
            disabled={!canSubmit(state)}
          >
            {player.isSubmitting ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Send aria-hidden="true" />
            )}
            Submit
          </Button>
        </div>
      )}

      <Judgement player={player} />
    </section>
  );
}

function Judgement({ player }: { player: Player }) {
  if (player.verdict === null) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-edge max-h-48 overflow-y-auto border-t px-3 py-2"
    >
      <p
        className={cn(
          "mb-2 text-xs font-semibold",
          player.verdict === "ACCEPTED" ? "text-success" : "text-danger",
        )}
      >
        {VERDICT_LABELS[player.verdict]}
      </p>
      {player.output !== null && player.output !== "" && (
        <pre className="text-ink-muted mb-2 font-mono text-xs break-all whitespace-pre-wrap">
          {player.output}
        </pre>
      )}
      {player.testCases.length > 0 && (
        <table className="w-full border-collapse text-left text-xs">
          <caption className="sr-only">Test case results</caption>
          <thead>
            <tr className="text-ink-subtle">
              <th scope="col" className="py-1 pr-2 font-medium">
                Case
              </th>
              <th scope="col" className="py-1 pr-2 font-medium">
                Expected
              </th>
              <th scope="col" className="py-1 font-medium">
                Got
              </th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {player.testCases.map((testCase) => (
              <tr key={testCase.number} className="align-top">
                <td className="py-1 pr-2">
                  <span className="flex items-start gap-1">
                    {testCase.passed ? (
                      <Check
                        aria-label="passed"
                        className="text-success size-3.5 shrink-0"
                      />
                    ) : (
                      <X
                        aria-label="failed"
                        className="text-danger size-3.5 shrink-0"
                      />
                    )}
                    <span className="break-all">
                      {testCase.hidden
                        ? `#${testCase.number}`
                        : (testCase.arguments ?? `#${testCase.number}`)}
                    </span>
                  </span>
                </td>
                {testCase.hidden ? (
                  <td colSpan={2} className="text-ink-subtle py-1">
                    <span className="inline-flex items-center gap-1">
                      <EyeOff aria-hidden="true" className="size-3" />
                      Hidden test case
                    </span>
                  </td>
                ) : (
                  <>
                    <td className="text-ink-muted py-1 pr-2 break-all">
                      {testCase.expected}
                    </td>
                    <td
                      className={cn(
                        "py-1 break-all",
                        testCase.passed ? "text-ink-muted" : "text-danger",
                      )}
                    >
                      {testCase.error ?? (testCase.actual || "—")}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
