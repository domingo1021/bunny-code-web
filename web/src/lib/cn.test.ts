import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });

  /*
   * The reason twMerge is here rather than plain clsx: without it a caller's
   * `className` cannot override a component's own utility and people resort to
   * `!important`.
   */
  it("lets a later Tailwind utility win over an earlier one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-ink", "text-brand")).toBe("text-brand");
  });

  it("keeps utilities that do not conflict", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4");
  });

  it("handles conditional objects and arrays", () => {
    expect(cn(["a", "b"], { c: true, d: false })).toBe("a b c");
  });

  it("is empty for no input", () => {
    expect(cn()).toBe("");
  });
});
