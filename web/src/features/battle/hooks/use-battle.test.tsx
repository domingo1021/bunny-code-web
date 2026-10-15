import { act, renderHook, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth";
import { createBattle, issueToken, resetDatabase } from "@/mocks/db";
import { Providers } from "@/test/render";
import { RealtimeProvider } from "../realtime/realtime-provider";
import { useBattle } from "./use-battle";

/**
 * The battle room's hook against the real provider and the scripted opponent,
 * on fake timers: entering, the ready handshake, the countdown, and losing to
 * a bot that is faster than the test.
 */

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

/* The opponent, made fast and certain to win. */
vi.mock("@/lib/realtime/create-transport", async () => {
  const { MockRealtimeTransport } =
    await import("@/mocks/realtime/mock-transport");
  return {
    createTransport: ({ userID }: { userID: number }) =>
      Promise.resolve(
        new MockRealtimeTransport(userID, {
          readyAfterMs: 10,
          thinkForMs: 10,
          keystrokeEveryMs: 1,
          completeness: 1,
        }),
      ),
  };
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <RealtimeProvider>{children}</RealtimeProvider>
    </Providers>
  );
}

beforeEach(() => {
  resetDatabase();
  push.mockClear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  useAuthStore.setState({
    token: issueToken(1),
    userID: 1,
    status: "authenticated",
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function newBattle() {
  return createBattle({
    battleName: "hook-test",
    level: "EASY",
    firstUserID: 1,
    secondUserID: 2,
  }).battleID;
}

describe("useBattle", () => {
  it("enters the room as a player and waits for both to be ready", async () => {
    const { result } = renderHook(() => useBattle(newBattle()), { wrapper });

    await waitFor(() => expect(result.current.state.phase).toBe("waiting"));
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.state.role).toBe("PLAYER");
    expect(result.current.state.players[1].user.id).toBe(2);
  });

  it("plays a whole battle through to the review page", async () => {
    const battleID = newBattle();
    const { result } = renderHook(() => useBattle(battleID), { wrapper });
    await waitFor(() => expect(result.current.state.phase).toBe("waiting"));

    act(() => result.current.setReady());
    await waitFor(() => expect(result.current.state.phase).toBe("countdown"));

    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(result.current.state.phase).toBe("battling");
    // The question is loaded for the board, and the editors got the starter.
    await waitFor(() =>
      expect(result.current.questionMarkdown).toMatch(/^# Two Sum/),
    );
    await waitFor(() =>
      expect(result.current.state.players[0].code).toMatch(/function twoSum/),
    );

    act(() => result.current.updateCode("// my attempt"));
    expect(result.current.state.players[0].code).toBe("// my attempt");

    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(result.current.state.phase).toBe("over");
    expect(result.current.state.winner?.userId).toBe(2);

    await act(() => vi.advanceTimersByTimeAsync(4_000));
    expect(push).toHaveBeenCalledWith(`/battle/review/${battleID}`);
  });

  it("reports a battle that does not exist", async () => {
    const { result } = renderHook(() => useBattle(999), { wrapper });
    await waitFor(() => expect(result.current.state.phase).toBe("not-found"));
  });

  it("forfeits a running battle when the room is left", async () => {
    const battleID = newBattle();
    const { result, unmount } = renderHook(() => useBattle(battleID), {
      wrapper,
    });
    await waitFor(() => expect(result.current.state.phase).toBe("waiting"));
    act(() => result.current.setReady());
    await waitFor(() => expect(result.current.state.phase).toBe("countdown"));

    unmount();

    const { battleById } = await import("@/mocks/db");
    expect(battleById(battleID)?.status).toBe("TERMINATED");
  });
});
