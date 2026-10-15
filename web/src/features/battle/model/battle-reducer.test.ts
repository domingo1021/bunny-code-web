import { describe, expect, it } from "vitest";
import {
  type BattleEvent,
  type BattleSnapshot,
  type BattleStatus,
} from "@/core/realtime/protocol";
import {
  battleReducer,
  canEdit,
  canReady,
  canSubmit,
  initialBattleState,
  isSpectator,
  leavingForfeits,
  viewerPlayer,
  type BattleAction,
  type BattleState,
} from "./battle-reducer";

/**
 * The battle flow, tested without rendering anything.
 *
 * This is the payoff for folding the server's snapshot and event stream into
 * one pure reducer: every transition — including the awkward ones, like two
 * endings arriving at once — is exercised here instead of by opening two
 * browsers and racing yourself.
 */

const ME = 7;
const THEM = 9;
const STARTER = "function twoSum(nums, target) {\n}\n";

function snapshot(
  overrides: {
    status?: BattleStatus;
    ready?: [boolean, boolean];
    code?: [string, string];
    chances?: [number, number];
    viewerRole?: "PLAYER" | "SPECTATOR";
    winnerId?: number | null;
  } = {},
): BattleSnapshot {
  const [readyA, readyB] = overrides.ready ?? [false, false];
  const [codeA, codeB] = overrides.code ?? ["", ""];
  const [chancesA, chancesB] = overrides.chances ?? [3, 3];
  return {
    id: 42,
    name: "friday-night",
    status: overrides.status ?? "WAITING",
    question: {
      name: "two-sum",
      level: "EASY",
      descriptionUrl: "https://cdn.test/two-sum.md",
      starterCodeUrl: "https://cdn.test/two-sum-base.js",
    },
    players: [
      {
        user: { id: ME, name: "me", pictureUrl: "" },
        ready: readyA,
        code: codeA,
        chancesLeft: chancesA,
      },
      {
        user: { id: THEM, name: "them", pictureUrl: "" },
        ready: readyB,
        code: codeB,
        chancesLeft: chancesB,
      },
    ],
    viewerRole: overrides.viewerRole ?? "PLAYER",
    winnerId: overrides.winnerId ?? null,
  };
}

const entered = (
  overrides: Parameters<typeof snapshot>[0] = {},
  viewerID = ME,
): BattleAction => ({
  type: "snapshot",
  snapshot: snapshot(overrides),
  viewerID,
});

const event = (value: BattleEvent): BattleAction => ({
  type: "event",
  event: value,
});

const STARTED = event({ type: "STARTED", startedAt: "2026-10-14T12:00:00Z" });

function run(actions: readonly BattleAction[], from = initialBattleState) {
  return actions.reduce(battleReducer, from);
}

/** A battle that has started and whose countdown has finished. */
function battling(): BattleState {
  return run([
    entered(),
    event({ type: "PLAYER_READY", userId: ME }),
    event({ type: "PLAYER_READY", userId: THEM }),
    STARTED,
    { type: "countdown-elapsed" },
  ]);
}

function player(state: BattleState, id: number) {
  const found = state.players.find((p) => p.user.id === id);
  if (found === undefined) throw new Error(`no player ${id}`);
  return found;
}

describe("entering the room", () => {
  it("connects first, then describes the battle from the snapshot", () => {
    expect(initialBattleState.phase).toBe("connecting");

    const state = run([entered()]);

    expect(state.phase).toBe("waiting");
    expect(state.name).toBe("friday-night");
    expect(state.question?.name).toBe("two-sum");
    expect(state.players.map((p) => p.user.name)).toEqual(["me", "them"]);
    expect(state.role).toBe("PLAYER");
  });

  it.each([
    ["WAITING", "waiting"],
    ["RUNNING", "battling"],
    ["FINISHED", "over"],
    ["TERMINATED", "over"],
  ] as const)("a %s battle opens in the %s phase", (status, phase) => {
    expect(run([entered({ status })]).phase).toBe(phase);
  });

  /* A spectator arriving mid-battle must land in `battling`, not `waiting`. */
  it("drops a late spectator straight into the running battle", () => {
    const state = run([
      entered({ status: "RUNNING", viewerRole: "SPECTATOR" }, 100),
    ]);
    expect(state.phase).toBe("battling");
    expect(isSpectator(state)).toBe(true);
  });

  it("names the winner of a battle that is already over", () => {
    const state = run([entered({ status: "FINISHED", winnerId: THEM })]);
    expect(state.winner).toMatchObject({ userId: THEM, name: "them" });
  });

  it("explains a battle that was already terminated", () => {
    const state = run([entered({ status: "TERMINATED" })]);
    expect(state.winner).toBeNull();
    expect(state.terminatedReason).toMatch(/terminated/i);
  });

  it("can be told the battle does not exist", () => {
    expect(run([{ type: "not-found" }]).phase).toBe("not-found");
  });
});

describe("resynchronising after a reconnect", () => {
  it("keeps what the viewer has typed rather than the server's older copy", () => {
    const typed = run(
      [{ type: "local-code", code: "let mine = 1;" }],
      battling(),
    );

    const state = run(
      [entered({ status: "RUNNING", code: ["let mine", "theirs()"] })],
      typed,
    );

    expect(player(state, ME).code).toBe("let mine = 1;");
    expect(player(state, THEM).code).toBe("theirs()");
  });

  it("lets a countdown already on screen finish", () => {
    const counting = run([entered({ ready: [true, true] }), STARTED]);
    expect(counting.phase).toBe("countdown");

    const state = run([entered({ status: "RUNNING" })], counting);
    expect(state.phase).toBe("countdown");
  });
});

describe("the ready handshake", () => {
  it("marks each player ready as they confirm", () => {
    const state = run([entered(), event({ type: "PLAYER_READY", userId: ME })]);
    expect(player(state, ME).ready).toBe(true);
    expect(player(state, THEM).ready).toBe(false);
  });

  it("starts a countdown when the server says the battle started", () => {
    const state = run([entered(), STARTED]);
    expect(state.phase).toBe("countdown");
    expect(state.players.every((p) => p.ready)).toBe(true);
  });

  it("unlocks the editors when the countdown ends", () => {
    expect(battling().phase).toBe("battling");
  });

  /* A repeated start must not restart a battle already running. */
  it("ignores a second start", () => {
    const before = battling();
    expect(run([STARTED], before)).toBe(before);
  });

  it("ignores a countdown ending when none is running", () => {
    const waiting = run([entered()]);
    expect(run([{ type: "countdown-elapsed" }], waiting)).toBe(waiting);
  });
});

describe("starter code", () => {
  it("fills empty editors once the battle is under way", () => {
    const state = run([{ type: "starter-code", code: STARTER }], battling());
    expect(state.players.map((p) => p.code)).toEqual([STARTER, STARTER]);
    expect(state.starterApplied).toBe(true);
  });

  it("does not touch an editor someone has already typed in", () => {
    const state = run(
      [
        event({ type: "CODE_CHANGED", userId: THEM, code: "theirs()" }),
        { type: "starter-code", code: STARTER },
      ],
      battling(),
    );
    expect(player(state, THEM).code).toBe("theirs()");
    expect(player(state, ME).code).toBe(STARTER);
  });

  /* After that, an empty editor means someone cleared it — on purpose. */
  it("is applied only once", () => {
    const state = run(
      [
        { type: "starter-code", code: STARTER },
        { type: "local-code", code: "" },
        { type: "starter-code", code: STARTER },
      ],
      battling(),
    );
    expect(player(state, ME).code).toBe("");
  });

  it("waits for the battle to start", () => {
    const waiting = run([entered()]);
    expect(run([{ type: "starter-code", code: STARTER }], waiting)).toBe(
      waiting,
    );
  });
});

describe("live code", () => {
  it("shows the opponent's code as it streams in", () => {
    const state = run(
      [event({ type: "CODE_CHANGED", userId: THEM, code: "return 1;" })],
      battling(),
    );
    expect(player(state, THEM).code).toBe("return 1;");
  });

  /* The viewer's own keystrokes are the truth for their pane; a late echo
     would make the cursor jump. */
  it("never overwrites the viewer's own editor from the wire", () => {
    const state = run(
      [
        { type: "local-code", code: "typed locally" },
        event({ type: "CODE_CHANGED", userId: ME, code: "stale echo" }),
      ],
      battling(),
    );
    expect(player(state, ME).code).toBe("typed locally");
  });

  it("streams both players to a spectator", () => {
    const watching = run([
      entered({ status: "RUNNING", viewerRole: "SPECTATOR" }, 100),
      event({ type: "CODE_CHANGED", userId: ME, code: "a" }),
      event({ type: "CODE_CHANGED", userId: THEM, code: "b" }),
    ]);
    expect(watching.players.map((p) => p.code)).toEqual(["a", "b"]);
  });
});

describe("submissions", () => {
  it("marks the viewer's submission in flight, then records the verdict", () => {
    const submitting = run([{ type: "submitting" }], battling());
    expect(player(submitting, ME).isSubmitting).toBe(true);
    expect(canSubmit(submitting)).toBe(false);

    const judged = run(
      [
        event({
          type: "SUBMISSION_JUDGED",
          userId: ME,
          verdict: "WRONG_ANSWER",
          testCases: [
            {
              number: 1,
              hidden: false,
              passed: false,
              arguments: "[1,2], 3",
              expected: "[0,1]",
              actual: "[]",
            },
          ],
          output: "",
          chancesLeft: 2,
        }),
      ],
      submitting,
    );

    const me = player(judged, ME);
    expect(me.isSubmitting).toBe(false);
    expect(me.verdict).toBe("WRONG_ANSWER");
    expect(me.chancesLeft).toBe(2);
    expect(me.testCases).toHaveLength(1);
    expect(canSubmit(judged)).toBe(true);
  });

  it("releases the button when a submission is refused and not counted", () => {
    const state = run(
      [{ type: "submitting" }, { type: "submit-failed" }],
      battling(),
    );
    expect(player(state, ME).isSubmitting).toBe(false);
    expect(player(state, ME).chancesLeft).toBe(3);
  });

  it("allows no submissions once they are used up", () => {
    const spent = run(
      [
        event({
          type: "SUBMISSION_JUDGED",
          userId: ME,
          verdict: "RUNTIME_ERROR",
          testCases: [],
          output: "TypeError",
          chancesLeft: 0,
        }),
      ],
      battling(),
    );
    expect(canSubmit(spent)).toBe(false);
  });
});

describe("the end", () => {
  const finished = event({
    type: "FINISHED",
    winnerId: THEM,
    winnerName: "them",
    reason: "them passed every test case!",
  });

  it("announces the winner", () => {
    const state = run([finished], battling());
    expect(state.phase).toBe("over");
    expect(state.status).toBe("FINISHED");
    expect(state.winner).toEqual({
      userId: THEM,
      name: "them",
      reason: "them passed every test case!",
    });
  });

  /* Both submitting at almost the same moment: the first result stands. */
  it("keeps the first ending when a second arrives", () => {
    const state = run(
      [
        finished,
        event({
          type: "FINISHED",
          winnerId: ME,
          winnerName: "me",
          reason: "me passed every test case!",
        }),
        event({ type: "TERMINATED", reason: "late" }),
      ],
      battling(),
    );
    expect(state.winner?.userId).toBe(THEM);
    expect(state.terminatedReason).toBeNull();
  });

  it("settles a submission still in flight", () => {
    const state = run([{ type: "submitting" }, finished], battling());
    expect(state.players.every((p) => !p.isSubmitting)).toBe(true);
  });

  it("can end without a winner", () => {
    const state = run(
      [event({ type: "TERMINATED", reason: "me left the battle." })],
      battling(),
    );
    expect(state.phase).toBe("over");
    expect(state.winner).toBeNull();
    expect(state.terminatedReason).toBe("me left the battle.");
  });
});

describe("what the viewer may do", () => {
  it("lets a player ready up once, while waiting", () => {
    const waiting = run([entered()]);
    expect(canReady(waiting)).toBe(true);

    const ready = run([event({ type: "PLAYER_READY", userId: ME })], waiting);
    expect(canReady(ready)).toBe(false);
  });

  it("lets a player edit only their own editor, only while battling", () => {
    const state = battling();
    expect(canEdit(state, player(state, ME))).toBe(true);
    expect(canEdit(state, player(state, THEM))).toBe(false);

    const waiting = run([entered()]);
    expect(canEdit(waiting, player(waiting, ME))).toBe(false);
  });

  it("gives a spectator nothing to press", () => {
    const watching = run([
      entered({ status: "RUNNING", viewerRole: "SPECTATOR" }, ME),
    ]);
    // Even with the same id as a player, the server's role decides.
    expect(viewerPlayer(watching)).toBeNull();
    expect(canSubmit(watching)).toBe(false);
    expect(canEdit(watching, player(watching, ME))).toBe(false);
    expect(leavingForfeits(watching)).toBe(false);
  });

  it("warns that leaving forfeits only while the battle is live", () => {
    expect(leavingForfeits(run([entered()]))).toBe(false);
    expect(leavingForfeits(run([entered(), STARTED]))).toBe(true);
    expect(leavingForfeits(battling())).toBe(true);
    expect(
      leavingForfeits(
        run([event({ type: "TERMINATED", reason: "x" })], battling()),
      ),
    ).toBe(false);
  });
});
