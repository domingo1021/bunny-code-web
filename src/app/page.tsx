import { GitBranch, Play, Swords, TerminalSquare } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectGrid } from "@/features/projects";
import { battleCount } from "@/features/battle/server";
import {
  heroRecording,
  projectStats,
  topProjects,
} from "@/features/projects/server";
import { HeroReplay } from "@/features/workspace";
import { USING_MOCK_API } from "@/lib/env";
import { formatCount } from "@/lib/format";

/**
 * The home page is a Server Component.
 *
 * In the demo its data is read from the seeded catalogue on the server (see
 * `seed-catalogue.ts` for why that is separate from the MSW handlers), so the
 * shell, the project grid and the hero's recording all arrive in the
 * prerendered payload. With a backend, the statistics and the project grid are
 * fetched from the API per request. Either way the `Suspense` boundaries let
 * the headline paint while they stream.
 *
 * The hero is the recording itself rather than a headline, two buttons and a
 * row of statistics: what this product does cannot be shown in a screenshot,
 * because the whole point is what happens over time.
 */
export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="border-edge border-b">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-14 lg:py-20">
          <div className="flex flex-col gap-6">
            <h1 className="font-display text-ink text-4xl leading-[1.05] font-bold tracking-tight sm:text-5xl">
              Watch the code
              <br />
              being written.
            </h1>
            <p className="text-ink-muted max-w-[46ch] text-lg">
              Bunny Code records a session keystroke by keystroke and plays it
              back like video. Pause it, slow it down, scrub to the moment
              something clicked — then run the result in your browser.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="primary" size="lg">
                <Link href="/workspace">
                  <Play aria-hidden="true" />
                  Browse recordings
                </Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link href="/battle">
                  <Swords aria-hidden="true" />
                  Battle valleys
                </Link>
              </Button>
            </div>

            <Suspense fallback={<Skeleton className="h-5 w-64" />}>
              <Stats />
            </Suspense>
          </div>

          <Suspense fallback={<Skeleton className="rounded-panel h-80" />}>
            <Hero />
          </Suspense>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Most starred
          </h2>
          <Link
            href="/workspace"
            className="text-brand text-sm hover:underline"
          >
            See all projects
          </Link>
        </div>
        <Suspense fallback={<TopProjectsSkeleton />}>
          <TopProjects />
        </Suspense>
      </section>

      <section className="border-edge bg-surface/40 border-t">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:grid-cols-3">
          <Feature
            icon={<Play aria-hidden="true" className="size-5" />}
            title="Replay, properly"
            body="Play, pause, 0.25x to 2x, and drag the scrubber anywhere. Replay follows the recorded timestamps, so it runs at the speed it was typed."
          />
          <Feature
            icon={<GitBranch aria-hidden="true" className="size-5" />}
            title="Versions you can compare"
            body="Each version starts from the last one's result, so replaying a version shows you what changed and in what order."
          />
          <Feature
            icon={<TerminalSquare aria-hidden="true" className="size-5" />}
            title="Run it safely"
            body={
              USING_MOCK_API
                ? "Code runs in a Web Worker with a hard timeout, so an infinite loop costs you a terminated worker instead of a frozen tab."
                : "Code runs in an isolated sandbox with no network and hard CPU, memory and time limits, so an infinite loop costs nobody anything."
            }
          />
        </div>
      </section>
    </main>
  );
}

async function Hero() {
  const recording = await heroRecording();
  if (recording === null) return null;

  return (
    <HeroReplay
      records={recording.records}
      baseText={recording.baseText}
      finalText={recording.finalText}
      fileName={recording.fileName}
    />
  );
}

async function Stats() {
  const [stats, battles] = await Promise.all([projectStats(), battleCount()]);
  if (stats === null || battles === null) return null;
  return (
    <p className="text-ink-subtle text-sm">
      {formatCount(stats.recordings)} recorded sessions across{" "}
      {formatCount(stats.projects)} public projects, and {formatCount(battles)}{" "}
      battles fought.
    </p>
  );
}

async function TopProjects() {
  const projects = await topProjects();
  if (projects.length === 0) {
    return (
      <p className="text-ink-muted text-sm">
        No public projects yet — be the first to record one.
      </p>
    );
  }
  return <ProjectGrid projects={projects} label="Most starred projects" />;
}

function TopProjectsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-[9.5rem]" />
      ))}
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-brand">{icon}</span>
      <h3 className="text-ink font-semibold">{title}</h3>
      <p className="text-ink-muted max-w-[48ch] text-sm">{body}</p>
    </div>
  );
}
