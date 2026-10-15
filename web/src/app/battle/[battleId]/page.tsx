import { type Metadata } from "next";
import { BattleRoom } from "@/features/battle";

export const metadata: Metadata = { title: "Battle" };

export default async function BattleRoomPage(
  props: PageProps<"/battle/[battleId]">,
) {
  const { battleId } = await props.params;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <BattleRoom battleID={Number(battleId)} />
    </main>
  );
}
