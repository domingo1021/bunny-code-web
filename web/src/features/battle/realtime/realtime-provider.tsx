"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { type RealtimeTransport } from "@/core/realtime/transport";
import { useSession } from "@/features/auth";
import { USING_MOCK_REALTIME } from "@/lib/env";
import { createTransport } from "@/lib/realtime/create-transport";
import { InvitationInbox } from "../components/invitation-inbox";

/**
 * One realtime connection for the whole app.
 *
 * Invitations are broadcast to everyone online, so the connection has to
 * outlive any one screen: someone browsing projects must still see "alice
 * wants to battle" and be able to accept. It is opened when there is someone
 * to connect as and closed on sign-out.
 *
 * The real server authenticates the STOMP `CONNECT` frame, so with a backend
 * there is no connection for an anonymous visitor. The in-browser opponent has
 * no such rule, and anonymous visitors can still watch its battles.
 */

interface RealtimeContextValue {
  readonly transport: RealtimeTransport | null;
  /** True when realtime is unavailable only because nobody is signed in. */
  readonly needsSignIn: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  transport: null,
  needsSignIn: false,
});

/** Errors a screen reports in place; everything else becomes a toast. */
const REPORTED_IN_PLACE: ReadonlySet<string> = new Set([
  "battle.not-found",
  "battle.name-taken",
  "battle.name-pending",
  "battle.invite-throttled",
  "battle.no-question",
]);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { userID, token, isAuthenticated, isPending } = useSession();
  const [transport, setTransport] = useState<RealtimeTransport | null>(null);
  const router = useRouter();

  const enabled = !isPending && (USING_MOCK_REALTIME || isAuthenticated);
  const connectAs = isAuthenticated ? userID : null;

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let created: RealtimeTransport | null = null;

    void createTransport({ userID: connectAs ?? 0, token }).then((instance) => {
      if (!active) {
        // Signed out (or unmounted) while connecting: drop it rather than
        // leaking a live connection with no owner.
        instance.disconnect();
        return;
      }
      created = instance;
      setTransport(instance);
    });

    return () => {
      active = false;
      created?.disconnect();
      setTransport(null);
    };
  }, [enabled, connectAs, token]);

  /* "Your battle is ready" can arrive on any screen; go there. */
  useEffect(() => {
    if (transport === null) return;
    const offCreated = transport.onBattleCreated(({ battleId }) => {
      router.push(`/battle/${battleId}`);
    });
    const offError = transport.onError((error) => {
      if (!REPORTED_IN_PLACE.has(error.code)) toast.error(error.message);
    });
    return () => {
      offCreated();
      offError();
    };
  }, [transport, router]);

  return (
    <RealtimeContext
      value={{
        transport,
        needsSignIn: !USING_MOCK_REALTIME && !isPending && !isAuthenticated,
      }}
    >
      {children}
      {transport !== null && connectAs !== null && (
        <InvitationInbox transport={transport} viewerID={connectAs} />
      )}
    </RealtimeContext>
  );
}

export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext);
}
