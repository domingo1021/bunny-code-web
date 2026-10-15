import { Crown, Eye } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import {
  QUESTION_LEVEL_LABELS,
  type BattleStatus,
} from "@/core/realtime/protocol";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import { type BattleSummary } from "@/lib/schemas";

const STATUS_LABEL: Record<BattleStatus, string> = {
  WAITING: "Waiting",
  RUNNING: "Live now",
  FINISHED: "Finished",
  TERMINATED: "Terminated",
};

/**
 * One battle in the lobby.
 *
 * The whole card is a single link to the right destination — a finished battle
 * goes to its review, a live one to the room. The original decided that in a
 * `renderPath(index)` click handler on a `<div>`, reading the currently
 * selected status filter to choose, so the same card led somewhere different
 * depending on a dropdown elsewhere on the page.
 *
 * The winner marker was an absolutely positioned `左: 93%` badge that sat
 * outside the card on narrow screens; here it is next to the name it belongs
 * to.
 */
export function BattleCard({ battle }: { battle: BattleSummary }) {
  const href =
    battle.status === "FINISHED"
      ? `/battle/review/${battle.id}`
      : `/battle/${battle.id}`;
  const [first, second] = battle.players;

  return (
    <Card className="hover:border-edge-strong focus-within:border-brand h-full transition-colors">
      <CardBody className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 text-sm font-semibold">
            <Link
              href={href}
              className="text-ink hover:text-brand focus-visible:outline-brand block truncate focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {battle.name}
            </Link>
          </h3>
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-[0.6875rem]",
              battle.status === "RUNNING"
                ? "bg-live/15 text-live"
                : battle.status === "WAITING"
                  ? "bg-warning/15 text-warning"
                  : "border-edge text-ink-subtle border",
            )}
          >
            {STATUS_LABEL[battle.status]}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Fighter
            name={first.name}
            picture={first.pictureUrl}
            won={battle.winnerId === first.id}
          />
          <span aria-hidden="true" className="text-ink-subtle shrink-0 text-xs">
            vs
          </span>
          <Fighter
            name={second.name}
            picture={second.pictureUrl}
            won={battle.winnerId === second.id}
            alignRight
          />
        </div>

        <p className="text-ink-subtle mt-auto flex items-center gap-3 text-xs">
          <span>{QUESTION_LEVEL_LABELS[battle.questionLevel]}</span>
          <span className="truncate font-mono">{battle.questionName}</span>
          <span className="ml-auto inline-flex items-center gap-1">
            <Eye aria-hidden="true" className="size-3.5" />
            {formatCount(battle.watchCount)}
          </span>
        </p>
      </CardBody>
    </Card>
  );
}

function Fighter({
  name,
  picture,
  won,
  alignRight = false,
}: {
  name: string;
  picture: string;
  won: boolean;
  alignRight?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex min-w-0 flex-1 items-center gap-1.5",
        alignRight && "flex-row-reverse",
      )}
    >
      <Image
        src={picture}
        alt=""
        width={28}
        height={28}
        unoptimized
        className="size-7 shrink-0 rounded-md"
      />
      <span className="text-ink-muted min-w-0 truncate text-xs">{name}</span>
      {won && (
        <Crown
          aria-label={`${name} won`}
          className="text-warning size-3.5 shrink-0"
        />
      )}
    </span>
  );
}
