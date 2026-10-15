import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { UserPage } from "@/features/user";

export const metadata: Metadata = {
  title: "Profile",
};

export default async function UserRoute(props: PageProps<"/user/[userId]">) {
  const { userId } = await props.params;
  const search = await props.searchParams;

  const parsed = Number(userId);
  // A non-numeric id can never match a user, so this is a 404 rather than a
  // request that fails later and renders an error inside a valid page.
  if (!Number.isInteger(parsed) || parsed <= 0) notFound();

  const page = Number(search.page) > 0 ? Number(search.page) : 1;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
      <UserPage userID={parsed} page={page} />
    </main>
  );
}
