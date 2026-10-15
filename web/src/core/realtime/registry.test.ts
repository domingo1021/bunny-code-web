import { describe, expect, it, vi } from "vitest";
import { EventRegistry } from "./registry";

interface Channels extends Record<string, unknown> {
  greeting: string;
  count: number;
}

describe("EventRegistry", () => {
  it("delivers a payload to every handler on its channel only", () => {
    const registry = new EventRegistry<Channels>();
    const a = vi.fn();
    const b = vi.fn();
    const other = vi.fn();
    registry.add("greeting", a);
    registry.add("greeting", b);
    registry.add("count", other);

    registry.emit("greeting", "hi");

    expect(a).toHaveBeenCalledWith("hi");
    expect(b).toHaveBeenCalledWith("hi");
    expect(other).not.toHaveBeenCalled();
  });

  it("ignores a channel nobody listens to", () => {
    const registry = new EventRegistry<Channels>();
    expect(() => registry.emit("count", 1)).not.toThrow();
  });

  /* One component unsubscribing must never tear down another's listener. */
  it("removes only the disposed handler", () => {
    const registry = new EventRegistry<Channels>();
    const kept = vi.fn();
    const removed = vi.fn();
    registry.add("greeting", kept);
    const dispose = registry.add("greeting", removed);

    dispose();
    registry.emit("greeting", "hi");

    expect(kept).toHaveBeenCalledOnce();
    expect(removed).not.toHaveBeenCalled();
    expect(registry.count("greeting")).toBe(1);
  });

  it("is safe to dispose twice, as Strict Mode does", () => {
    const registry = new EventRegistry<Channels>();
    const dispose = registry.add("greeting", vi.fn());
    registry.add("greeting", vi.fn());

    dispose();
    dispose();

    expect(registry.count("greeting")).toBe(1);
  });

  it("forgets a channel once its last handler goes", () => {
    const registry = new EventRegistry<Channels>();
    const dispose = registry.add("count", vi.fn());
    dispose();
    expect(registry.count("count")).toBe(0);
    expect(registry.size).toBe(0);
  });

  it("survives a handler that unsubscribes itself mid-emit", () => {
    const registry = new EventRegistry<Channels>();
    const after = vi.fn();
    const dispose = registry.add("count", () => dispose());
    registry.add("count", after);

    registry.emit("count", 1);

    expect(after).toHaveBeenCalledOnce();
    expect(registry.count("count")).toBe(1);
  });

  it("keeps going when a handler throws, and reports it", () => {
    const registry = new EventRegistry<Channels>();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const after = vi.fn();
    registry.add("count", () => {
      throw new Error("boom");
    });
    registry.add("count", after);

    registry.emit("count", 1);

    expect(after).toHaveBeenCalledWith(1);
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });

  it("counts every handler and clears them all", () => {
    const registry = new EventRegistry<Channels>();
    registry.add("greeting", vi.fn());
    registry.add("count", vi.fn());
    registry.add("count", vi.fn());
    expect(registry.size).toBe(3);

    registry.clear();

    expect(registry.size).toBe(0);
  });
});
