import { type Metadata } from "next";
import { Suspense } from "react";
import { ProjectCatalogue, ProjectSearch } from "@/features/projects";

export const metadata: Metadata = {
  title: "Workspace",
  description: "Browse recorded coding sessions and replay them.",
};

export default async function WorkspacePage(props: PageProps<"/workspace">) {
  const params = await props.searchParams;
  const keywords = typeof params.keywords === "string" ? params.keywords : "";
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
      <div className="mb-8 flex flex-col gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {keywords === "" ? "Projects" : `Results for “${keywords}”`}
          </h1>
          <p className="text-ink-muted mt-2">
            {keywords === ""
              ? "Open a project to replay how it was written."
              : "Projects matching your search."}
          </p>
        </div>
        {/* Keyed on the term so a back navigation resets the field. */}
        <ProjectSearch key={keywords} keywords={keywords} />
      </div>

      {/* Keyed on the query so a search or page change gets a fresh boundary
          rather than reusing the previous one's suspended state. */}
      <Suspense key={`${keywords}:${page}`} fallback={null}>
        <ProjectCatalogue keywords={keywords} page={page} />
      </Suspense>
    </main>
  );
}
