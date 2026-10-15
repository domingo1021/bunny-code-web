import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type ComponentProps } from "react";
import { cn } from "@/lib/cn";

/*
 * Every interactive control goes through here, which is how the app gets one
 * focus ring, one disabled treatment and one hit-area rule. The Vue original
 * styled buttons ad hoc per component (`.tool-btn`, `.confirm-btn`, inline
 * `style=`) and removed focus outlines without replacing them.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-md font-medium",
    "whitespace-nowrap transition-colors select-none",
    // 44px minimum touch target on small screens, per WCAG 2.5.5.
    "min-h-11 sm:min-h-0",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-ink hover:bg-brand-strong",
        secondary:
          "bg-surface-raised text-ink border border-edge hover:border-edge-strong hover:bg-surface-overlay",
        ghost: "text-ink-muted hover:bg-surface-raised hover:text-ink",
        danger: "bg-danger text-canvas hover:opacity-90",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-2.5 text-sm [&_svg]:size-4",
        md: "h-9 px-3.5 text-sm [&_svg]:size-4",
        lg: "h-11 px-5 text-base [&_svg]:size-5",
        icon: "size-9 p-0 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  /** Render as the child element instead of a `<button>` (e.g. a `Link`). */
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = "button",
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      // `asChild` forwards to whatever element the caller rendered, which may
      // not accept `type`.
      {...(asChild ? {} : { type })}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
