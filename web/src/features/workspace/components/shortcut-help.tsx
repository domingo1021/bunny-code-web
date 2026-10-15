"use client";

import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * The editor's keyboard shortcuts.
 *
 * The original showed this automatically on first visit, remembered the
 * dismissal in `localStorage` under the key `stopIntro`, and rendered it as a
 * Bootstrap modal whose element id — `exampleModal` — was shared with two other
 * components, so whichever mounted last won. It is opt-in here: an unrequested
 * modal in front of the thing someone came to look at is an interruption, and
 * the button is always available.
 */
const SHORTCUTS: readonly { keys: string; action: string }[] = [
  { keys: "← → ↑ ↓", action: "Move the cursor" },
  { keys: "⌥ + ← / →", action: "Move by word" },
  { keys: "⌃ + A", action: "Jump to start of line" },
  { keys: "⌃ + E", action: "Jump to end of line" },
  { keys: "Enter", action: "New line, keeping the indent" },
  { keys: "Backspace", action: "Delete backwards (joins lines at column 0)" },
  { keys: "Tab", action: "Indent two spaces" },
  { keys: "⌘ + X", action: "Delete the current line" },
  { keys: "⇧ + ⌥ + ↓", action: "Duplicate the current line" },
  { keys: "⌘ + S", action: "Save the session" },
];

export function ShortcutHelp() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Keyboard aria-hidden="true" />
          Shortcuts
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editor shortcuts</DialogTitle>
          <DialogDescription>
            Every keystroke you make is recorded, so the replay reproduces
            exactly what you typed — including the cursor moves.
          </DialogDescription>
        </DialogHeader>

        <dl className="divide-edge divide-y">
          {SHORTCUTS.map(({ keys, action }) => (
            <div
              key={keys}
              className="flex items-baseline justify-between gap-4 py-2"
            >
              <dt className="text-ink-muted text-sm">{action}</dt>
              <dd>
                <kbd className="border-edge bg-surface-raised text-ink rounded border px-2 py-1 font-mono text-xs">
                  {keys}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>

        <p className="text-ink-subtle mt-4 text-xs">
          Copy, paste and multiple cursors are disabled: they would change the
          document without producing a record, and the replay would no longer
          match the file.
        </p>
      </DialogContent>
    </Dialog>
  );
}
