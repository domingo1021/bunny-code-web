import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { EmptyState } from "./empty-state";
import { Skeleton } from "./skeleton";
import { Card, CardBody, CardMeta, CardTitle } from "./card";

describe("Button", () => {
  it("is a button of type button by default", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    // Defaulting to `type="button"` keeps a button inside a form from
    // submitting it by accident.
    expect(button).toHaveAttribute("type", "button");
  });

  it("can be a submit button", () => {
    render(<Button type="submit">Send</Button>);
    expect(screen.getByRole("button", { name: "Send" })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("calls its handler", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not call its handler when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  /*
   * `asChild` renders the caller's element instead of a button, which is how a
   * link gets button styling without becoming a button — a `<button>` that
   * navigates cannot be opened in a new tab and is announced wrongly.
   */
  it("renders as its child element, without forcing a type attribute", () => {
    render(
      <Button asChild>
        <a href="https://example.com">Browse</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Browse" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).not.toHaveAttribute("type");
  });

  it("lets a caller override its own utilities", () => {
    render(<Button className="px-10">Wide</Button>);
    expect(screen.getByRole("button", { name: "Wide" })).toHaveClass("px-10");
  });

  it.each(["primary", "secondary", "ghost", "danger", "link"] as const)(
    "renders the %s variant",
    (variant) => {
      render(<Button variant={variant}>Label</Button>);
      expect(screen.getByRole("button", { name: "Label" })).toBeVisible();
    },
  );

  it.each(["sm", "md", "lg", "icon"] as const)(
    "renders the %s size",
    (size) => {
      render(<Button size={size}>Label</Button>);
      expect(screen.getByRole("button", { name: "Label" })).toBeVisible();
    },
  );
});

describe("EmptyState", () => {
  it("shows a heading and a description", () => {
    render(
      <EmptyState title="No projects yet" description="Create one to start." />,
    );
    expect(
      screen.getByRole("heading", { name: "No projects yet" }),
    ).toBeVisible();
    expect(screen.getByText("Create one to start.")).toBeVisible();
  });

  it("renders an action", () => {
    render(
      <EmptyState title="Nothing here" action={<Button>Try again</Button>} />,
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("works with only a title", () => {
    render(<EmptyState title="Empty" />);
    expect(screen.getByRole("heading", { name: "Empty" })).toBeVisible();
  });

  it("hides a decorative icon from assistive technology", () => {
    render(<EmptyState title="Empty" icon={<svg data-testid="icon" />} />);
    expect(screen.getByTestId("icon").parentElement).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});

describe("Skeleton", () => {
  /* A skeleton is decoration: announcing it would read as meaningless noise.
     The surrounding screens provide the real status message. */
  it("is hidden from assistive technology", () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Card", () => {
  it("composes a title, body and meta", () => {
    render(
      <Card>
        <CardBody>
          <CardTitle>Project</CardTitle>
          <CardMeta>12 stars</CardMeta>
        </CardBody>
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "Project" })).toBeVisible();
    expect(screen.getByText("12 stars")).toBeVisible();
  });
});
