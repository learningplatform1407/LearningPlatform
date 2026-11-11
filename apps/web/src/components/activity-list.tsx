"use client";

import type { ActivityEvent } from "@lp/contracts";
import { formatPostDate } from "@lp/ui";
import Link from "next/link";

import { UserAvatar } from "@/components/user-avatar";
import { rich, useI18n } from "@/lib/i18n";

/** One feed line: who, what, when. The sentence comes from the catalogue
 * with the name and lesson spliced in as links, so a translation can put
 * them in any order. */
function ActivityItem({ event }: { event: ActivityEvent }) {
  const { t, language } = useI18n();
  const name = (
    <Link href={`/profile/${event.user.id}`} className="font-bold text-foreground hover:underline">
      {event.user.display_name ?? t("profile.unnamed")}
    </Link>
  );

  let sentence: React.ReactNode;
  if (event.kind === "lesson_completed" && event.document_id) {
    sentence = rich(t("social.activity.lessonCompleted"), {
      name,
      lesson: (
        <Link
          href={`/learn/${event.document_id}`}
          className="font-bold text-accent hover:underline"
        >
          {event.document_title}
        </Link>
      ),
    });
  } else if (event.kind === "exam_completed") {
    sentence = rich(
      event.score_percent === null
        ? t("social.activity.examFinished")
        : t("social.activity.examCompleted", { score: event.score_percent }),
      { name },
    );
  } else {
    sentence = rich(t("social.activity.streak", { count: event.streak_days ?? 0 }), { name });
  }

  return (
    <li className="flex items-start gap-sm border-t border-border py-sm">
      <UserAvatar url={event.user.avatar_url} name={event.user.display_name} size="sm" />
      <div className="flex min-w-0 flex-col">
        <p className="m-0 text-ui text-foreground">{sentence}</p>
        <time dateTime={event.created_at} className="text-caption text-muted-foreground">
          {formatPostDate(event.created_at, language)}
        </time>
      </div>
    </li>
  );
}

export function ActivityList({ events }: { events: ActivityEvent[] }) {
  return (
    <ul className="m-0 list-none border-b border-border p-0">
      {events.map((event) => (
        <ActivityItem key={event.id} event={event} />
      ))}
    </ul>
  );
}
