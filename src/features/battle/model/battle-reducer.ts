import {
  type BattleEvent,
  type BattleSnapshot,
  type BattleStatus,
  type QuestionView,
  type TestCaseReport,
  type UserSummary,
  type Verdict,
  type ViewerRole,
} from "@/core/realtime/protocol";

/**
 * The battle room, as a state machine.
 *
 * A battle has more moving parts than any other screen: two editors, a ready
 * handshake, a countdown, live code streaming both ways, three submissions
 * each, and two different ways to end. The server describes it with one
 * snapshot on entry and a stream of events after that; this reducer folds both
 * into one `phase` and two players, so a transition that makes no sense simply
 * is not expressible. Because it is pure, the whole flow is tested without
 * rendering anything.
 */

export type BattlePhase =
  /** Waiting for the server to describe the battle. */
  | "connecting"
  /** Battle found; waiting for both players to ready up. */
  | "waiting"
  /** Both ready; the client-side countdown is running. */
  | "countdown"
  /** Editors unlocked, battle in progress. */
  | "battling"
  /** Someone won, or it was terminated. */
  | "over"
  | "not-found";

/** How long the countdown between "both ready" and "go" lasts. */
export const COUNTDOWN_MS = 2_500;

export interface Player {
  readonly user: UserSummary;
  readonly code: string;
  readonly ready: boolean;
  readonly chancesLeft: number;
  readonly isSubmitting: boolean;
  readonly verdict: Verdict | null;
  readonly testCases: readonly TestCaseReport[];
  readonly output: string | null;
}

export interface BattleState {
  readonly phase: BattlePhase;
  readonly id: number;
  readonly name: string;
  readonly status: BattleStatus | null;
  readonly question: QuestionView | null;
  readonly players: readonly [Player, Player];
  readonly viewerID: number;
  readonly role: ViewerRole;
  readonly winner: {
    readonly userId: number;
    readonly name: string;
    readonly reason: string;
  } | null;
  /** Set when the battle ended without a winner. */
  readonly terminatedReason: string | null;
  /** Whether empty editors have been given the question's starter code. */
  readonly starterApplied: boolean;
}

function emptyPlayer(): Player {
  return {
    user: { id: 0, name: "", pictureUrl: "" },
    code: "",
    ready: false,
    chancesLeft: 0,
    isSubmitting: false,
    verdict: null,
    testCases: [],
    output: null,
  };
}

export const initialBattleState: BattleState = {
  phase: "connecting",
  id: 0,
  name: "",
  status: null,
  question: null,
  players: [emptyPlayer(), emptyPlayer()],
  viewerID: 0,
  role: "SPECTATOR",
  winner: null,
  terminatedReason: null,
  starterApplied: false,
};

export type BattleAction =
  | { type: "snapshot"; snapshot: BattleSnapshot; viewerID: number }
  | { type: "event"; event: BattleEvent }
  | { type: "countdown-elapsed" }
  /** The question's starter code has loaded. */
  | { type: "starter-code"; code: string }
  | { type: "local-code"; code: string }
  | { type: "submitting" }
  /** The server refused or could not judge a submission; it was not counted. */
  | { type: "submit-failed" }
  | { type: "not-found" };

export function battleReducer(
  state: BattleState,
  action: BattleAction,
): BattleState {
  switch (action.type) {
    case "snapshot":
      return fromSnapshot(state, action.snapshot, action.viewerID);

    case "event":
      return applyEvent(state, action.event);

    case "countdown-elapsed":
      return state.phase === "countdown"
        ? { ...state, phase: "battling" }
        : state;

    case "starter-code":
      // Once, and only into a running battle: the server's live copy of each
      // player's code starts empty, so until someone types both editors show
      // the starter. After that an empty editor means someone cleared it.
      if (state.starterApplied || state.phase !== "battling") return state;
      return {
        ...state,
        starterApplied: true,
        players: mapPlayers(state.players, (player) =>
          player.code === "" ? { ...player, code: action.code } : player,
        ),
      };

    case "local-code":
      return {
        ...state,
        players: mapPlayers(state.players, (player) =>
          player.user.id === state.viewerID
            ? { ...player, code: action.code }
            : player,
        ),
      };

    case "submitting":
      return {
        ...state,
        players: mapPlayers(state.players, (player) =>
          player.user.id === state.viewerID
            ? { ...player, isSubmitting: true }
            : player,
        ),
      };

    case "submit-failed":
      return {
        ...state,
        players: mapPlayers(state.players, (player) =>
          player.user.id === state.viewerID
            ? { ...player, isSubmitting: false }
            : player,
        ),
      };

    case "not-found":
      return { ...state, phase: "not-found" };
  }
}

/**
 * Enter — or, after a reconnect, resynchronise — the room.
 *
 * A snapshot is the server's whole truth, with two exceptions that keep the
 * screen steady: the viewer's own editor keeps what they have typed (the
 * server's copy may be a keystroke behind, and replacing it would make the
 * cursor jump), and a countdown already on screen is allowed to finish.
 */
function fromSnapshot(
  state: BattleState,
  snapshot: BattleSnapshot,
  viewerID: number,
): BattleState {
  const previous = new Map(state.players.map((p) => [p.user.id, p]));
  const players = snapshot.players.map((view): Player => {
    const before = previous.get(view.user.id);
    const keepLocal =
      view.user.id === viewerID && before !== undefined && before.code !== "";
    return {
      ...(before ?? emptyPlayer()),
      user: view.user,
      ready: view.ready,
      chancesLeft: view.chancesLeft,
      code: keepLocal ? before.code : view.code,
    };
  }) as unknown as [Player, Player];

  const winnerPlayer =
    snapshot.winnerId === null
      ? undefined
      : players.find((p) => p.user.id === snapshot.winnerId);

  return {
    ...state,
    phase: phaseFor(snapshot.status, state.phase),
    id: snapshot.id,
    name: snapshot.name,
    status: snapshot.status,
    question: snapshot.question,
    players,
    viewerID,
    role: snapshot.viewerRole,
    winner:
      state.winner ??
      (winnerPlayer === undefined
        ? null
        : {
            userId: winnerPlayer.user.id,
            name: winnerPlayer.user.name,
            reason: `${winnerPlayer.user.name} passed every test case!`,
          }),
    terminatedReason:
      state.terminatedReason ??
      (snapshot.status === "TERMINATED" ? "This battle was terminated." : null),
  };
}

function phaseFor(status: BattleStatus, current: BattlePhase): BattlePhase {
  switch (status) {
    case "WAITING":
      return "waiting";
    case "RUNNING":
      return current === "countdown" ? "countdown" : "battling";
    case "FINISHED":
    case "TERMINATED":
      return "over";
  }
}

function applyEvent(state: BattleState, event: BattleEvent): BattleState {
  switch (event.type) {
    case "PLAYER_READY":
      return {
        ...state,
        players: mapPlayers(state.players, (player) =>
          player.user.id === event.userId ? { ...player, ready: true } : player,
        ),
      };

    case "STARTED":
      // Only from `waiting`: a repeated start must not restart a battle that
      // is already running.
      return state.phase === "waiting"
        ? {
            ...state,
            phase: "countdown",
            status: "RUNNING",
            players: mapPlayers(state.players, (player) => ({
              ...player,
              ready: true,
            })),
          }
        : state;

    case "CODE_CHANGED":
      return {
        ...state,
        players: mapPlayers(state.players, (player) =>
          // Never overwrite the viewer's own editor from the wire: their
          // keystrokes are the source of truth for their own pane, and a
          // late-arriving echo would make the cursor jump.
          player.user.id === event.userId && event.userId !== state.viewerID
            ? { ...player, code: event.code }
            : player,
        ),
      };

    case "SUBMISSION_JUDGED":
      return {
        ...state,
        players: mapPlayers(state.players, (player) =>
          player.user.id === event.userId
            ? {
                ...player,
                isSubmitting: false,
                chancesLeft: event.chancesLeft,
                verdict: event.verdict,
                testCases: event.testCases,
                output: event.output,
              }
            : player,
        ),
      };

    case "FINISHED":
      // First result wins. A second ending — both submitting at almost the
      // same moment — must not rewrite the outcome.
      if (state.phase === "over") return state;
      return {
        ...settle(state),
        status: "FINISHED",
        winner: {
          userId: event.winnerId,
          name: event.winnerName,
          reason: event.reason,
        },
      };

    case "TERMINATED":
      if (state.phase === "over") return state;
      return {
        ...settle(state),
        status: "TERMINATED",
        terminatedReason: event.reason,
      };
  }
}

function settle(state: BattleState): BattleState {
  return {
    ...state,
    phase: "over",
    players: mapPlayers(state.players, (player) => ({
      ...player,
      isSubmitting: false,
    })),
  };
}

function mapPlayers(
  players: readonly [Player, Player],
  update: (player: Player) => Player,
): [Player, Player] {
  return [update(players[0]), update(players[1])];
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** The player the viewer controls, or `null` for a spectator. */
export function viewerPlayer(state: BattleState): Player | null {
  if (state.role !== "PLAYER") return null;
  return state.players.find((p) => p.user.id === state.viewerID) ?? null;
}

export function isSpectator(state: BattleState): boolean {
  return viewerPlayer(state) === null;
}

/** Whether a given editor accepts input from this viewer right now. */
export function canEdit(state: BattleState, player: Player): boolean {
  return (
    state.phase === "battling" &&
    state.role === "PLAYER" &&
    player.user.id === state.viewerID
  );
}

/** Whether the viewer may submit. */
export function canSubmit(state: BattleState): boolean {
  const mine = viewerPlayer(state);
  return (
    state.phase === "battling" &&
    mine !== null &&
    mine.chancesLeft > 0 &&
    !mine.isSubmitting
  );
}

/** Whether the viewer may press ready. */
export function canReady(state: BattleState): boolean {
  const mine = viewerPlayer(state);
  return state.phase === "waiting" && mine !== null && !mine.ready;
}

/** Leaving now forfeits the battle. */
export function leavingForfeits(state: BattleState): boolean {
  return (
    (state.phase === "battling" || state.phase === "countdown") &&
    !isSpectator(state)
  );
}
