import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <p className="text-brand font-mono text-6xl font-bold">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        This page ran away
      </h1>
      <p className="text-ink-muted">
        The page you asked for does not exist. It may have been renamed, or the
        link that brought you here may be out of date.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button asChild variant="primary">
          <Link href="/">Back to home</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/workspace">Browse projects</Link>
        </Button>
      </div>
    </main>
  );
}
