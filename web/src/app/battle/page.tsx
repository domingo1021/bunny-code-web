import { type Metadata } from "next";
import { Suspense } from "react";
import { BattleLobby, parseLobbyFilters } from "@/features/battle";

export const metadata: Metadata = {
  title: "Battle valleys",
  description: "Watch live coding battles, or start one of your own.",
};

export default async function BattlePage(props: PageProps<"/battle">) {
  const params = await props.searchParams;
  const asString = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : "";

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Battle valleys
        </h1>
        <p className="text-ink-muted mt-2">
          Two people, one question, three attempts each. Watch a live battle, or
          start one and we will find you an opponent.
        </p>
      </div>

      <Suspense fallback={null}>
        <BattleLobby
          filters={parseLobbyFilters({
            status: asString(params.status),
            level: asString(params.level),
            keyword: asString(params.keyword),
            page: asString(params.page),
          })}
        />
      </Suspense>
    </main>
  );
}
