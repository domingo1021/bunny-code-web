"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { useSession } from "@/features/auth";
import { fetchText } from "@/lib/api-client";
import { useRealtime } from "../realtime/realtime-provider";
import {
  battleReducer,
  canReady,
  canSubmit,
  COUNTDOWN_MS,
  initialBattleState,
  leavingForfeits,
  viewerPlayer,
} from "../model/battle-reducer";

/** How long the result stays on screen before the review page. */
const SHOW_RESULT_FOR_MS = 3_500;

/** Errors that mean a submission was refused or not judged — and not counted. */
const SUBMISSION_ERRORS: ReadonlySet<string> = new Set([
  "battle.not-running",
  "battle.no-chances",
  "execution.busy",
  "execution.rate-limited",
  "execution.unavailable",
  "internal",
]);

/**
 * Runs a battle room: the shared realtime connection, one reducer, and the
 * commands between them.
 *
 * Entering the room is one `watchBattle` call — the server answers with a
 * snapshot and then streams events — and leaving it is that call's disposer,
 * so there is no list of unsubscribes to keep in step with the subscribes.
 */
export function useBattle(battleID: number) {
  const router = useRouter();
  const { transport, needsSignIn } = useRealtime();
  const { userID } = useSession();
  const viewerID = userID ?? 0;
  const [state, dispatch] = useReducer(battleReducer, initialBattleState);

  /* The question and its starter code are plain files in object storage. */
  const descriptionUrl = state.question?.descriptionUrl ?? null;
  const starterCodeUrl = state.question?.starterCodeUrl ?? null;

  const question = useQuery({
    queryKey: ["battle", "question", descriptionUrl],
    queryFn: ({ signal }) => fetchText(descriptionUrl ?? "", signal),
    enabled: descriptionUrl !== null,
    staleTime: Infinity,
  });

  const starterCode = useQuery({
    queryKey: ["battle", "starter", starterCodeUrl],
    queryFn: ({ signal }) => fetchText(starterCodeUrl ?? "", signal),
    enabled: starterCodeUrl !== null,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (transport === null || !Number.isFinite(battleID)) return;
    const stopWatching = transport.watchBattle(battleID, {
      onSnapshot: (snapshot) =>
        dispatch({ type: "snapshot", snapshot, viewerID }),
      onEvent: (event) => dispatch({ type: "event", event }),
    });
    const stopErrors = transport.onError((error) => {
      if (error.code === "battle.not-found") dispatch({ type: "not-found" });
      if (SUBMISSION_ERRORS.has(error.code)) {
        dispatch({ type: "submit-failed" });
      }
    });
    return () => {
      stopErrors();
      stopWatching();
    };
  }, [transport, battleID, viewerID]);

  /*
   * The countdown is client-side: the server says "started", and every client
   * runs the same count, so the start is visible rather than a surprise.
   */
  useEffect(() => {
    if (state.phase !== "countdown") return;
    const timer = setTimeout(
      () => dispatch({ type: "countdown-elapsed" }),
      COUNTDOWN_MS,
    );
    return () => clearTimeout(timer);
  }, [state.phase]);

  /* Give empty editors the starter code once the battle is under way. */
  const starter = starterCode.data;
  useEffect(() => {
    if (starter === undefined || state.phase !== "battling") return;
    dispatch({ type: "starter-code", code: starter });
  }, [starter, state.phase]);

  /* Once someone has won and it has been shown, move to the review page. */
  const wasWon = state.phase === "over" && state.winner !== null;
  useEffect(() => {
    if (!wasWon) return;
    const timer = setTimeout(
      () => router.push(`/battle/review/${battleID}`),
      SHOW_RESULT_FOR_MS,
    );
    return () => clearTimeout(timer);
  }, [wasWon, router, battleID]);

  /* A player who closes the tab mid-battle forfeits; warn them first. */
  const forfeits = leavingForfeits(state);
  useEffect(() => {
    if (!forfeits) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [forfeits]);

  /*
   * Navigating elsewhere in the app keeps the connection open, so leaving the
   * room has to be said out loud — the server would otherwise only notice
   * when the tab closes. A ref, so the cleanup sees the phase at unmount.
   */
  const forfeitsRef = useRef(forfeits);
  useEffect(() => {
    forfeitsRef.current = forfeits;
  }, [forfeits]);
  useEffect(() => {
    if (transport === null) return;
    return () => {
      if (forfeitsRef.current) transport.leave(battleID);
    };
  }, [transport, battleID]);

  const setReady = useCallback(() => {
    if (transport === null || !canReady(state)) return;
    transport.ready(battleID);
  }, [transport, state, battleID]);

  const updateCode = useCallback(
    (code: string) => {
      dispatch({ type: "local-code", code });
      if (transport === null || state.phase !== "battling") return;
      if (viewerPlayer(state) === null) return;
      transport.sendCode(battleID, code);
    },
    [transport, state, battleID],
  );

  const submit = useCallback(
    (code: string) => {
      if (transport === null || !canSubmit(state)) return;
      dispatch({ type: "submitting" });
      transport.submit(battleID, code);
    },
    [transport, state, battleID],
  );

  return {
    state,
    questionMarkdown: question.data ?? null,
    needsSignIn,
    isConnecting:
      !needsSignIn && (transport === null || state.phase === "connecting"),
    setReady,
    updateCode,
    submit,
  };
}
