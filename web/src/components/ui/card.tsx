import { type ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-card border-edge bg-surface border",
        "transition-colors",
        className,
      )}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      className={cn(
        "text-ink text-base leading-tight font-semibold",
        className,
      )}
      {...props}
    />
  );
}

export function CardMeta({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-ink-subtle text-xs", className)} {...props} />;
}
