import { type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * What a screen shows when there is nothing to show.
 *
 * The Vue app rendered `<div v-else></div>` for every one of these cases — an
 * empty workspace, a search with no hits, a project with no versions — so the
 * user saw a blank region and no explanation.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
  ...props
}: ComponentProps<"div"> & {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-card border-edge flex flex-col items-center justify-center gap-3 border border-dashed px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      {icon !== undefined && (
        <div aria-hidden="true" className="text-ink-subtle">
          {icon}
        </div>
      )}
      <h2 className="text-ink text-base font-semibold">{title}</h2>
      {description !== undefined && (
        <p className="text-ink-muted max-w-prose text-sm">{description}</p>
      )}
      {action}
    </div>
  );
}
