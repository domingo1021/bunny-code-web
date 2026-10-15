import { type Metadata } from "next";
import { WorkspaceScreen } from "@/features/workspace";

/*
 * Static metadata rather than `generateMetadata`.
 *
 * Under `cacheComponents`, reading `params` in `generateMetadata` is runtime
 * data, which blocks the route's prerender and fails the build. A per-project
 * `<title>` is not worth making this whole screen dynamic — the project name is
 * the page's `h1`, where it matters more anyway.
 */
export const metadata: Metadata = { title: "Workspace" };

/**
 * A project version's workspace.
 *
 * The version is an optional catch-all so `/workspace/name` and
 * `/workspace/name/2` are the same route — the original declared
 * `:versionNumber?` and then had to cope with `versionNumber` being the empty
 * string, which it compared against `""` before calling `Number()` on it.
 */
export default async function WorkspaceVersionPage(
  props: PageProps<"/workspace/[projectName]/[[...version]]">,
) {
  const { projectName, version } = await props.params;

  const requested = Number(version?.[0]);
  const versionNumber =
    Number.isInteger(requested) && requested > 0 ? requested : 1;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <WorkspaceScreen
        projectName={decodeURIComponent(projectName)}
        versionNumber={versionNumber}
      />
    </main>
  );
}
