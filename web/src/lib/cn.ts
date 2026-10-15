import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Compose class names, letting later Tailwind utilities win over earlier ones.
 * Without the merge, a `className` prop cannot override a component's own
 * padding or colour and callers resort to `!important`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
