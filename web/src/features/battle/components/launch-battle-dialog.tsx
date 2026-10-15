"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Swords } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  QUESTION_LEVEL_LABELS,
  QUESTION_LEVELS,
} from "@/core/realtime/protocol";
import { useSession } from "@/features/auth";
import { describeError } from "@/lib/api-client";
import { resourceName } from "@/lib/validation";
import { isBattleNameAvailable } from "../api/battle-api";
import { useRealtime } from "../realtime/realtime-provider";

/**
 * Launch a battle.
 *
 * Two steps: check the name over HTTP, then broadcast an invitation that
 * anyone online may accept. The dialog stays open while the invitation is
 * live, counting down, and reports every way it can end — a clash, a refusal
 * from the server, or nobody accepting in time. When someone does accept, the
 * realtime provider takes both players to the new battle.
 */
const schema = z.object({
  battleName: resourceName("battle"),
  level: z.enum(QUESTION_LEVELS),
});

type Values = z.infer<typeof schema>;

/** Failures of an invitation, reported in the dialog rather than as a toast. */
const INVITE_ERRORS: ReadonlySet<string> = new Set([
  "battle.name-taken",
  "battle.name-pending",
  "battle.invite-throttled",
  "battle.no-question",
  "request.invalid",
]);

type Launch =
  | { stage: "idle" }
  | { stage: "checking" }
  | { stage: "inviting"; battleName: string; expiresAt: number | null };

export function LaunchBattleDialog() {
  const [open, setOpen] = useState(false);
  const [launch, setLaunch] = useState<Launch>({ stage: "idle" });
  const [failure, setFailure] = useState<string | null>(null);
  const { isAuthenticated, userID } = useSession();
  const { transport } = useRealtime();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { battleName: "", level: "EASY" },
  });

  const inviting = launch.stage === "inviting" ? launch : null;

  /*
   * While the dialog is open: learn when our invitation expires, and how it
   * ends. Subscribed for as long as the dialog is open — not from the moment
   * the invitation is sent — so a fast reply cannot beat the subscription.
   */
  useEffect(() => {
    if (transport === null || !open) return;
    const offInvitation = transport.onInvitation((invitation) => {
      if (invitation.inviterId !== userID) return;
      setLaunch((current) =>
        current.stage === "inviting" &&
        current.battleName === invitation.battleName
          ? { ...current, expiresAt: Date.parse(invitation.expiresAt) }
          : current,
      );
    });
    // Someone accepted; the realtime provider takes us to the battle.
    const offCreated = transport.onBattleCreated(() => {
      setLaunch({ stage: "idle" });
      setOpen(false);
    });
    // Invitation failures can only be answers to our own invitation.
    const offError = transport.onError((error) => {
      if (!INVITE_ERRORS.has(error.code)) return;
      setLaunch({ stage: "idle" });
      setFailure(error.message);
    });
    return () => {
      offInvitation();
      offCreated();
      offError();
    };
  }, [transport, open, userID]);

  async function onSubmit(values: Values) {
    setFailure(null);
    if (transport === null) {
      setFailure("Still connecting — try again in a moment.");
      return;
    }

    setLaunch({ stage: "checking" });
    try {
      // Checked before anyone is invited, so a clash is reported before an
      // invitation goes out rather than after someone accepts it.
      if (!(await isBattleNameAvailable(values.battleName))) {
        setLaunch({ stage: "idle" });
        setFailure("That battle name is already taken.");
        return;
      }
    } catch (error) {
      setLaunch({ stage: "idle" });
      setFailure(describeError(error));
      return;
    }

    setLaunch({
      stage: "inviting",
      battleName: values.battleName,
      expiresAt: null,
    });
    transport.invite({ battleName: values.battleName, level: values.level });
  }

  const busy = launch.stage !== "idle";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          form.reset();
          setFailure(null);
          setLaunch({ stage: "idle" });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="primary">
          <Swords aria-hidden="true" />
          Start a battle
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a battle</DialogTitle>
          <DialogDescription>
            Everyone online is invited; the first to accept is your opponent.
            First correct solution wins, three submissions each.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="battle-name"
              className="text-ink text-sm font-medium"
            >
              Battle name
            </label>
            <Input
              id="battle-name"
              autoComplete="off"
              disabled={busy}
              aria-invalid={form.formState.errors.battleName !== undefined}
              {...form.register("battleName")}
            />
            {form.formState.errors.battleName?.message !== undefined && (
              <p className="text-danger text-xs">
                {form.formState.errors.battleName.message}
              </p>
            )}
          </div>

          <fieldset className="flex flex-col gap-2" disabled={busy}>
            <legend className="text-ink text-sm font-medium">Difficulty</legend>
            <div className="flex gap-2">
              {QUESTION_LEVELS.map((level) => (
                <label
                  key={level}
                  className="border-edge hover:border-edge-strong has-checked:border-brand flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <input
                    type="radio"
                    value={level}
                    className="accent-brand"
                    {...form.register("level")}
                  />
                  {QUESTION_LEVEL_LABELS[level]}
                </label>
              ))}
            </div>
          </fieldset>

          {inviting !== null && (
            <InvitationCountdown
              expiresAt={inviting.expiresAt}
              onExpired={() => {
                setLaunch({ stage: "idle" });
                setFailure("Nobody accepted in time. Try again?");
              }}
            />
          )}

          {failure !== null && (
            <p
              role="alert"
              className="border-danger/40 bg-danger/10 text-danger rounded-md border px-3 py-2 text-sm"
            >
              {failure}
            </p>
          )}

          {!isAuthenticated && (
            <p className="border-edge bg-surface-raised text-ink-muted rounded-md border px-3 py-2 text-sm">
              You need to be logged in to battle.
            </p>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !isAuthenticated}
            >
              {busy && <Loader2 className="animate-spin" />}
              {inviting !== null ? "Waiting for an opponent…" : "Launch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * How long the invitation has left. Mounted only while one is out, so its
 * clock starts fresh each time.
 */
function InvitationCountdown({
  expiresAt,
  onExpired,
}: {
  expiresAt: number | null;
  onExpired: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  const expired = expiresAt !== null && now >= expiresAt;
  useEffect(() => {
    if (expired) onExpired();
  }, [expired, onExpired]);

  return (
    <p
      role="status"
      className="border-brand/40 bg-brand/10 text-ink rounded-md border px-3 py-2 text-sm"
    >
      Invitation sent to everyone online
      {expiresAt !== null &&
        ` — ${Math.max(0, Math.ceil((expiresAt - now) / 1_000))}s left`}
      .
    </p>
  );
}
