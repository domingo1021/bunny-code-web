"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Modal dialogs on Radix.
 *
 * Replaces two separate mechanisms in the original: Bootstrap's imperative
 * `new Modal(el).show()` and SweetAlert2's `Swal.fire()`. Both had problems
 * Radix solves by default — focus was never trapped or restored, Escape did
 * not close, nothing was labelled for assistive technology, and three
 * components each rendered an element with the literal id `exampleModal`, so
 * whichever mounted last won.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-black/70",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0",
        )}
      />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg",
          "-translate-x-1/2 -translate-y-1/2",
          "max-h-[calc(100vh-2rem)] overflow-y-auto",
          "rounded-card border-edge bg-surface border p-5 shadow-2xl",
          "focus:outline-none",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className={cn(
            "text-ink-subtle absolute top-3.5 right-3.5 rounded-md p-1.5",
            "hover:bg-surface-raised hover:text-ink",
            "focus-visible:outline-brand focus-visible:outline-2 focus-visible:outline-offset-2",
          )}
        >
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mb-4 pr-8", className)} {...props} />;
}

export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-ink text-lg font-semibold", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-ink-muted mt-1 text-sm", className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}
