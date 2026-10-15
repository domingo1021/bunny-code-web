"use client";

import { Loader2, Swords, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  QUESTION_LEVEL_LABELS,
  type Invitation,
} from "@/core/realtime/protocol";
import { type RealtimeTransport } from "@/core/realtime/transport";

/**
 * Open invitations from other people, wherever the viewer is in the app.
 *
 * Invitations are first come, first served and live for a few seconds, so
 * each shows how long it has left and disappears when that runs out. The
 * viewer's own invitations are broadcast back to them too; those are left to
 * the launch dialog.
 */
export function InvitationInbox({
  transport,
  viewerID,
}: {
  transport: RealtimeTransport;
  viewerID: number;
}) {
  const [invitations, setInvitations] = useState<readonly Invitation[]>([]);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [now, refreshNow] = useNow(invitations.length > 0);

  useEffect(
    () =>
      transport.onInvitation((invitation) => {
        if (invitation.inviterId === viewerID) return;
        refreshNow();
        setInvitations((current) => [
          ...current.filter((i) => i.invitationId !== invitation.invitationId),
          invitation,
        ]);
      }),
    [transport, viewerID, refreshNow],
  );

  /* Accepting either creates the battle (and the provider navigates) or
     fails; either way the invitation is finished with. */
  useEffect(() => {
    if (accepting === null) return;
    const settle = () => {
      setInvitations((current) =>
        current.filter((i) => i.invitationId !== accepting),
      );
      setAccepting(null);
    };
    const offCreated = transport.onBattleCreated(settle);
    const offError = transport.onError(settle);
    return () => {
      offCreated();
      offError();
    };
  }, [transport, accepting]);

  const open = invitations.filter(
    (invitation) =>
      Date.parse(invitation.expiresAt) > now ||
      invitation.invitationId === accepting,
  );
  if (open.length === 0) return null;

  return (
    <section
      aria-label="Battle invitations"
      className="fixed right-4 bottom-4 z-40 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {open.map((invitation) => {
        const secondsLeft = Math.max(
          0,
          Math.ceil((Date.parse(invitation.expiresAt) - now) / 1_000),
        );
        const isAccepting = accepting === invitation.invitationId;
        return (
          <article
            key={invitation.invitationId}
            role="alert"
            className="border-brand/50 bg-surface-raised rounded-card flex flex-col gap-3 border p-3 shadow-lg"
          >
            <header className="flex items-start gap-2">
              <Swords
                aria-hidden="true"
                className="text-brand mt-0.5 size-4 shrink-0"
              />
              <p className="flex-1 text-sm">
                <strong>{invitation.inviterName}</strong> wants to battle in{" "}
                <strong className="break-all">{invitation.battleName}</strong>{" "}
                <span className="text-ink-muted">
                  ({QUESTION_LEVEL_LABELS[invitation.level]})
                </span>
              </p>
              <button
                type="button"
                aria-label="Dismiss invitation"
                className="text-ink-subtle hover:text-ink"
                onClick={() =>
                  setInvitations((current) =>
                    current.filter(
                      (i) => i.invitationId !== invitation.invitationId,
                    ),
                  )
                }
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </header>
            <footer className="flex items-center justify-between gap-2">
              <span className="text-ink-subtle text-xs" aria-live="off">
                {secondsLeft}s left
              </span>
              <Button
                variant="primary"
                size="sm"
                disabled={accepting !== null}
                onClick={() => {
                  setAccepting(invitation.invitationId);
                  transport.acceptInvitation(invitation.invitationId);
                }}
              >
                {isAccepting && (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                )}
                Accept
              </Button>
            </footer>
          </article>
        );
      })}
    </section>
  );
}

/** The current time, ticking once a second while `running`. */
function useNow(running: boolean): [number, () => void] {
  const [now, setNow] = useState(() => Date.now());
  const refresh = useCallback(() => setNow(Date.now()), []);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(refresh, 1_000);
    return () => clearInterval(timer);
  }, [running, refresh]);
  return [now, refresh];
}
