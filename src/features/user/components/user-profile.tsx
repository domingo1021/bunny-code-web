import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type UserProfile as UserProfileData } from "@/lib/schemas";

/**
 * A user's profile card.
 *
 * Two fixes over the original: the level badge is readable text rather than an
 * absolutely positioned pill at `top: 10px; right: 20px` that overlapped the
 * name on narrow screens, and the avatar has a real `alt` describing *whose*
 * picture it is rather than the literal string "User picture".
 */
export function UserProfile({
  user,
  /**
   * Heading level for the user's name. A user page makes this its `h1`; the
   * battle review page shows the winner's card below its own `h1`, where an
   * `h1` here would break the document outline.
   */
  headingLevel = "h2",
}: {
  user: UserProfileData;
  headingLevel?: "h1" | "h2" | "h3";
}) {
  const Heading = headingLevel;
  return (
    <Card className="flex flex-col items-center gap-3 p-6 text-center">
      <Image
        src={user.pictureUrl}
        alt={`${user.name}'s avatar`}
        width={80}
        height={80}
        // Avatars come from object storage (or, in the demo, inline SVG data
        // URIs); neither goes through the image optimiser.
        unoptimized
        className="size-20 rounded-xl"
      />
      <div>
        <Heading className="text-ink text-xl font-semibold">
          {user.name}
        </Heading>
        <p className="text-ink-subtle mt-0.5 text-xs">Level {user.level}</p>
      </div>
      <p className="text-ink-muted max-w-prose text-sm">
        {user.profile ?? "No bio yet."}
      </p>
    </Card>
  );
}

export function UserProfileSkeleton() {
  return (
    <Card className="flex flex-col items-center gap-3 p-6">
      <span className="sr-only" role="status">
        Loading profile
      </span>
      <Skeleton className="size-20 rounded-xl" />
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-4 w-48" />
    </Card>
  );
}
