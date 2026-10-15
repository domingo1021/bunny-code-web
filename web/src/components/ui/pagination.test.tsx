import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pagination, windowAround } from "./pagination";

describe("windowAround", () => {
  it("lists every page when there are few", () => {
    expect(windowAround(1, 3)).toEqual([1, 2, 3]);
  });

  /* The original rendered one control per page, so a 40-page catalogue got 40
     of them. This caps the window and marks the elisions. */
  it("elides the middle of a long range", () => {
    expect(windowAround(10, 40)).toEqual([1, "gap", 9, 10, 11, "gap", 40]);
  });

  it("does not open a gap for a single missing page", () => {
    expect(windowAround(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("always includes the first and last page", () => {
    const window = windowAround(20, 40);
    expect(window[0]).toBe(1);
    expect(window[window.length - 1]).toBe(40);
  });

  it("clamps the window at the ends", () => {
    expect(windowAround(1, 40)).toEqual([1, 2, "gap", 40]);
    expect(windowAround(40, 40)).toEqual([1, "gap", 39, 40]);
  });

  it("never repeats a page", () => {
    for (const current of [1, 2, 3, 20, 39, 40]) {
      const pages = windowAround(current, 40).filter(
        (entry): entry is number => entry !== "gap",
      );
      expect(new Set(pages).size).toBe(pages.length);
    }
  });

  it("handles a single page", () => {
    expect(windowAround(1, 1)).toEqual([1]);
  });
});

describe("Pagination", () => {
  const hrefFor = (page: number) => `/workspace?page=${page}`;

  it("renders nothing when there is only one page", () => {
    const { container } = render(
      <Pagination page={1} pageCount={1} hrefFor={hrefFor} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("marks the current page for assistive technology", () => {
    render(<Pagination page={2} pageCount={5} hrefFor={hrefFor} />);
    expect(screen.getByRole("link", { name: "Page 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Page 3" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("links each page to its own URL", () => {
    render(<Pagination page={1} pageCount={3} hrefFor={hrefFor} />);
    expect(screen.getByRole("link", { name: "Page 3" })).toHaveAttribute(
      "href",
      "/workspace?page=3",
    );
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
      "href",
      "/workspace?page=2",
    );
  });

  /*
   * Disabled controls are real disabled buttons, not `<span aria-disabled>`.
   * `aria-label` is prohibited on a span with no role, which made the span
   * version both an axe violation and nameless to a screen reader.
   */
  it("renders an unavailable control as a disabled button with a name", () => {
    render(<Pagination page={1} pageCount={5} hrefFor={hrefFor} />);

    const previous = screen.getByRole("button", { name: "Previous page" });
    expect(previous).toBeDisabled();
    expect(screen.getByRole("link", { name: "Next page" })).toBeEnabled();
  });

  it("disables next on the last page", () => {
    render(<Pagination page={5} pageCount={5} hrefFor={hrefFor} />);
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("is a labelled navigation landmark", () => {
    render(<Pagination page={1} pageCount={3} hrefFor={hrefFor} />);
    expect(
      screen.getByRole("navigation", { name: "Pagination" }),
    ).toBeVisible();
  });

  it("clamps an out-of-range current page", () => {
    render(<Pagination page={99} pageCount={3} hrefFor={hrefFor} />);
    expect(screen.getByRole("link", { name: "Page 3" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
