import { describe, expect, it } from "vitest";
import { resourceName, versionName } from "./validation";

describe("resourceName", () => {
  const rule = resourceName("battle");

  it.each(["a", "two-sum_2.js", "A".repeat(20)])("accepts %s", (name) => {
    expect(rule.safeParse(name).success).toBe(true);
  });

  it.each(["", "has space", "slash/name", "A".repeat(21), "ünïcode"])(
    "rejects %j",
    (name) => {
      expect(rule.safeParse(name).success).toBe(false);
    },
  );
});

describe("versionName", () => {
  it("trims, and accepts spaces inside", () => {
    expect(versionName.parse("  second take ")).toBe("second take");
  });

  it.each(["", "   ", "x".repeat(31), "tab\there"])("rejects %j", (name) => {
    expect(versionName.safeParse(name).success).toBe(false);
  });
});
