import { type Metadata } from "next";
import { AuthForm } from "@/features/auth";
import { USING_MOCK_API } from "@/lib/env";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to Bunny Code to record projects and join battles.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const { redirect } = await props.searchParams;
  const target = typeof redirect === "string" ? redirect : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-10 px-4 py-12 lg:flex-row lg:items-start lg:gap-16 lg:py-20">
      <div className="max-w-md lg:pt-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome to Bunny Code
        </h1>
        <p className="text-ink-muted mt-3">
          Record a coding session and replay it like a video, keep versions of
          your work, and settle an argument with a live 1v1 battle.
        </p>
        <ul className="text-ink-muted mt-6 flex list-disc flex-col gap-2 pl-5 text-sm">
          <li>Replay any session at 0.25x to 2x, and scrub to any point</li>
          <li>
            {USING_MOCK_API
              ? "Run your code in the browser, no server needed"
              : "Run your code in an isolated sandbox"}
          </li>
          <li>Watch a live battle, then read the winner&rsquo;s solution</li>
        </ul>
      </div>
      <AuthForm redirect={target} />
    </main>
  );
}
