import { type ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "border-edge bg-surface text-ink h-10 w-full rounded-md border px-3 text-sm",
        "placeholder:text-ink-subtle",
        "focus-visible:border-brand focus-visible:outline-brand focus-visible:outline-2 focus-visible:outline-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-danger aria-invalid:outline-danger",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "border-edge bg-surface text-ink w-full rounded-md border px-3 py-2 text-sm",
        "placeholder:text-ink-subtle",
        "focus-visible:border-brand focus-visible:outline-brand focus-visible:outline-2 focus-visible:outline-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-danger aria-invalid:outline-danger",
        className,
      )}
      {...props}
    />
  );
}
