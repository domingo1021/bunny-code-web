"use client";

import { Eye, Loader2, Save, Star } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { type DocState } from "@/core/replay/types";
import { type SandboxResult } from "@/core/sandbox/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/features/auth";
import {
  recordWatch,
  useProjectDetail,
  useToggleStar,
} from "@/features/projects";
import { describeError } from "@/lib/api-client";
import { USING_MOCK_API } from "@/lib/env";
import { type ExecutionOutcome } from "@/lib/schemas";
import { formatCount } from "@/lib/format";
import { SandboxRunner } from "@/lib/sandbox/client";
import { useRecorder } from "../hooks/use-recorder";
import { useReplay } from "../hooks/use-replay";
import { runCode } from "../api/workspace-api";
import { useSaveSession, useVersionContent } from "../hooks/use-workspace";
import { CreateVersionDialog } from "./create-version-dialog";
import { ReplayControls } from "./replay-controls";
import { ShortcutHelp } from "./shortcut-help";
import { type TerminalEntry, Terminal } from "./terminal";
import { VersionSidebar } from "./version-sidebar";

/**
 * CodeMirror is the heaviest dependency in the app and only this screen needs
 * it, so it is split out of the main bundle. `ssr: false` because an editor has
 * nothing to render on the server.
 */
const CodeEditor = dynamic(
  () => import("./code-editor").then((m) => m.CodeEditor),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full min-h-80 w-full" />,
  },
);

/**
 * The workspace: a project version, its recording, and the editor.
 *
 * Only the owner can edit, and only while the version has no recording: a
 * saved session is immutable, and the version becomes replay-only. That is
 * decided from the project detail alone, so the edit affordance never flickers
 * on load.
 */
export function WorkspaceScreen({
  projectName,
  versionNumber,
}: {
  projectName: string;
  versionNumber: number;
}) {
  const { userID, token, isAuthenticated } = useSession();
  const detail = useProjectDetail(projectName);
  const project = detail.data;

  const version = useMemo(() => {
    if (project === undefined) return undefined;
    return (
      project.versions.find((v) => v.number === versionNumber) ??
      project.versions[0]
    );
  }, [project, versionNumber]);

  const file = version?.file ?? undefined;
  const recording = version?.recording ?? null;
  const isOwner =
    project !== undefined && isAuthenticated && project.owner.id === userID;
  // A version with a saved recording is read-only: its log already explains
  // how its file came to be, and further edits would contradict it.
  const canEdit = isOwner && version !== undefined && recording === null;

  const content = useVersionContent(project, version);
  const recorder = useRecorder();
  const [terminal, setTerminal] = useState<readonly TerminalEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);

  /*
   * Replay drives the document when the version is read-only. When the version
   * is editable there is no recording to replay, so the recorder owns it.
   */
  const onReplayDoc = useCallback(
    (doc: DocState) => {
      if (!canEdit) recorder.setDoc(doc);
    },
    [canEdit, recorder],
  );

  /*
   * What replay rewinds to. A version with a saved recording rewinds to the
   * content it started from; one without a recording has nothing to replay, so
   * the file itself is both the start and the end.
   */
  const replayBase = recording === null ? content.content : content.baseText;

  const replay = useReplay({
    baseText: replayBase,
    records: content.records,
    onDocChange: onReplayDoc,
  });

  /*
   * Load the file into the recorder once it arrives, and again whenever the
   * version changes. Keyed on the version id rather than the content so that
   * re-fetching identical content does not wipe unsaved edits.
   *
   * Only for an editable version: on a read-only one the replay owns the
   * document, and loading here would overwrite whatever position the reader
   * had scrubbed to.
   */
  const loadedVersionRef = useRef<number | null>(null);
  useEffect(() => {
    if (!canEdit || version === undefined || content.isPending) return;
    if (loadedVersionRef.current === version.id) return;
    loadedVersionRef.current = version.id;
    recorder.load(content.content);
  }, [version, content.isPending, content.content, canEdit, recorder]);

  const save = useSaveSession({
    projectName,
    versionNumber: version?.number ?? 0,
  });
  const star = useToggleStar(projectName);

  /* Count a view, once, and only for someone else's project. */
  const projectID = project?.id;
  const ownerID = project?.owner.id;
  useEffect(() => {
    if (projectID === undefined || ownerID === userID) return;
    const timer = setTimeout(() => {
      void recordWatch(projectName, token).catch(() => {
        // A view counter is not worth surfacing an error for.
      });
    }, 5_000);
    return () => clearTimeout(timer);
  }, [projectID, ownerID, userID, projectName, token]);

  /* Warn before leaving with unsaved edits. */
  useEffect(() => {
    if (!recorder.isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [recorder.isDirty]);

  const runnerRef = useRef<SandboxRunner | null>(null);
  useEffect(() => {
    runnerRef.current = new SandboxRunner();
    return () => {
      runnerRef.current?.cancel();
      runnerRef.current = null;
    };
  }, []);

  const onRun = useCallback(async () => {
    const source = recorder.text;
    if (source.trim() === "") {
      toast.error("Nothing to run yet — write some code first.");
      return;
    }

    /*
     * With a backend, code runs in its sandbox (Docker: no network, capped CPU
     * and memory) and only signed-in users may run it. In the demo there is
     * no server, so it runs in a Web Worker instead.
     */
    if (!USING_MOCK_API && !isAuthenticated) {
      toast.error("Log in to run code.");
      return;
    }

    setIsRunning(true);
    let result: SandboxResult;
    try {
      if (USING_MOCK_API) {
        const runner = runnerRef.current;
        if (runner === null) return;
        result = await runner.run(source);
      } else {
        const startedAt = performance.now();
        const outcome = await runCode(source, token);
        result = toSandboxResult(outcome, performance.now() - startedAt);
      }
    } catch (error) {
      toast.error(describeError(error));
      return;
    } finally {
      setIsRunning(false);
    }

    setTerminal((entries) => [
      ...entries,
      {
        id: entries.length + 1,
        command: `node ${file?.name ?? "index.js"}`,
        result,
      },
    ]);
  }, [recorder.text, file?.name, isAuthenticated, token]);

  const onSave = useCallback(() => {
    if (!canEdit) return;
    if (recorder.pending.length === 0) {
      toast.info("Nothing to save yet.");
      return;
    }
    save.mutate(
      { records: recorder.pending, content: recorder.text },
      {
        onSuccess: () => {
          recorder.markSaved();
          toast.success("Session saved — replay it to watch it back.");
        },
        onError: (error) => toast.error(describeError(error)),
      },
    );
  }, [canEdit, recorder, save]);

  if (detail.isPending) return <WorkspaceSkeleton />;

  if (detail.isError) {
    return (
      <EmptyState
        className="m-4"
        title="Could not open this project"
        description={describeError(detail.error)}
        action={
          <Button asChild variant="secondary">
            <Link href="/workspace">Back to projects</Link>
          </Button>
        }
      />
    );
  }

  if (project === undefined || version === undefined || file === undefined) {
    return (
      <EmptyState
        className="m-4"
        title="This project has no versions yet"
        description="A project needs a version before there is anything to edit."
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside className="border-edge shrink-0 border-b p-4 lg:w-64 lg:border-r lg:border-b-0">
        <div className="mb-4">
          <h1 className="text-lg font-semibold break-words">{project.name}</h1>
          <p className="text-ink-subtle mt-1 text-xs">
            by{" "}
            <Link
              href={`/user/${project.owner.id}`}
              className="text-ink-muted hover:text-brand hover:underline"
            >
              {project.owner.name}
            </Link>
          </p>
          <p className="text-ink-subtle mt-2 flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1">
              <Eye aria-hidden="true" className="size-3.5" />
              {formatCount(project.watchCount)} views
            </span>
            <button
              type="button"
              aria-pressed={project.starredByViewer}
              disabled={!isAuthenticated || star.isPending}
              title={isAuthenticated ? undefined : "Log in to star projects"}
              onClick={() => star.mutate(!project.starredByViewer)}
              className="hover:text-ink inline-flex items-center gap-1 disabled:cursor-not-allowed"
            >
              <Star
                aria-hidden="true"
                className={
                  project.starredByViewer
                    ? "text-warning size-3.5 fill-current"
                    : "size-3.5"
                }
              />
              {formatCount(project.starCount)}
              <span className="sr-only">
                {project.starredByViewer ? "stars, starred by you" : "stars"}
              </span>
            </button>
          </p>
        </div>

        <VersionSidebar
          project={project}
          currentVersionNumber={version.number}
          canCreateVersion={isOwner}
          onCreateVersion={() => setVersionDialogOpen(true)}
        />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="border-edge flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-ink-muted truncate font-mono text-sm">
              {file.name}
            </span>
            {canEdit ? (
              recorder.isDirty && (
                <span className="bg-warning/15 text-warning rounded px-1.5 py-0.5 text-[0.6875rem]">
                  Unsaved
                </span>
              )
            ) : (
              <span className="border-edge text-ink-subtle rounded border px-1.5 py-0.5 text-[0.6875rem]">
                Read only
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <ShortcutHelp />
            {canEdit && (
              <Button
                variant="primary"
                size="sm"
                onClick={onSave}
                disabled={save.isPending || !recorder.isDirty}
              >
                {save.isPending ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : (
                  <Save aria-hidden="true" />
                )}
                Save session
              </Button>
            )}
          </div>
        </header>

        {content.isError ? (
          <EmptyState
            className="m-4"
            title="Could not load this version"
            description={describeError(content.error)}
          />
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-hidden">
              {content.isPending ? (
                <Skeleton className="h-full min-h-80 w-full rounded-none" />
              ) : (
                <CodeEditor
                  doc={recorder.doc}
                  readOnly={!canEdit}
                  label={`${file.name}, ${canEdit ? "editable" : "read only"}`}
                  onKeystroke={canEdit ? recorder.handleKeystroke : undefined}
                  onPointer={canEdit ? recorder.handlePointer : undefined}
                  onSaveShortcut={onSave}
                  height="100%"
                />
              )}
            </div>

            {!canEdit && (
              <ReplayControls
                replay={replay}
                className="border-edge border-t px-4 py-3"
              />
            )}

            <Terminal
              entries={terminal}
              projectName={project.name}
              isRunning={isRunning}
              canRun={!content.isPending}
              onRun={() => void onRun()}
              onClear={() => setTerminal([])}
            />
          </>
        )}
      </div>

      <CreateVersionDialog
        open={versionDialogOpen}
        onOpenChange={setVersionDialogOpen}
        projectName={project.name}
        nextVersionNumber={project.versions.length + 1}
      />
    </div>
  );
}

/** The server sandbox's verdict, in the shape the terminal renders. */
export function toSandboxResult(
  outcome: ExecutionOutcome,
  durationMs: number,
): SandboxResult {
  const base = {
    logs: [],
    output: outcome.output,
    durationMs,
    truncated: false,
  };
  switch (outcome.status) {
    case "SUCCEEDED":
      return { ...base, status: "ok" };
    case "TIMED_OUT":
      return {
        ...base,
        status: "timeout",
        error: "The program ran past the time limit and was stopped.",
      };
    case "OUT_OF_MEMORY":
      return {
        ...base,
        status: "error",
        error: "The program ran out of memory.",
      };
    case "FAILED":
      return {
        ...base,
        status: "error",
        error: "The program exited with an error.",
      };
  }
}

function WorkspaceSkeleton() {
  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <span className="sr-only" role="status">
        Loading workspace
      </span>
      <aside className="border-edge shrink-0 border-b p-4 lg:w-64 lg:border-r lg:border-b-0">
        <Skeleton className="h-6 w-40" />
        <div className="mt-6 flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      </aside>
      <div className="flex flex-1 flex-col gap-0">
        <Skeleton className="h-10 w-full rounded-none" />
        <Skeleton className="min-h-80 flex-1 rounded-none" />
      </div>
    </div>
  );
}
