import { type Metadata } from "next";
import { BattleReview } from "@/features/battle";

export const metadata: Metadata = { title: "Battle result" };

export default async function BattleReviewPage(
  props: PageProps<"/battle/review/[battleId]">,
) {
  const { battleId } = await props.params;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
      <BattleReview battleID={Number(battleId)} />
    </main>
  );
}
