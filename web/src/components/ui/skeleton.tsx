import { type ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * A loading placeholder.
 *
 * The Vue app rendered `<div v-else></div>` while data was in flight, so every
 * screen flashed blank and nothing told a screen reader anything was happening.
 */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("bg-surface-raised animate-pulse rounded-md", className)}
      {...props}
    />
  );
}
