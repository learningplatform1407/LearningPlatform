import type { ActivityEvent } from "@lp/contracts";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { I18nProvider } from "@/lib/i18n";

import { ActivityList } from "./activity-list";

const base = {
  created_at: "2026-10-09T12:00:00Z",
  user: { id: "u2", display_name: "Bea", avatar_url: null },
  document_id: null,
  document_title: null,
  score_percent: null,
  question_count: null,
  streak_days: null,
};

const events: ActivityEvent[] = [
  {
    ...base,
    id: "e1",
    kind: "lesson_completed",
    document_id: "d1",
    document_title: "Cardiology 2",
  },
  { ...base, id: "e2", kind: "exam_completed", score_percent: 87.5, question_count: 20 },
  { ...base, id: "e3", kind: "streak_milestone", streak_days: 7 },
];

test("each kind reads as a sentence, with the name and lesson as links", () => {
  render(<ActivityList events={events} />);

  const items = screen.getAllByRole("listitem");
  expect(items[0]).toHaveTextContent("Bea completed Cardiology 2");
  expect(screen.getByRole("link", { name: "Cardiology 2" })).toHaveAttribute("href", "/learn/d1");
  expect(screen.getAllByRole("link", { name: "Bea" })[0]).toHaveAttribute("href", "/profile/u2");
  expect(items[1]).toHaveTextContent("Bea finished an exam with 87.5%");
  expect(items[2]).toHaveTextContent("Bea is on a 7-day streak");
});

test("in Romanian, with Romanian numbers and plurals", () => {
  render(
    <I18nProvider initialLanguage="ro">
      <ActivityList events={events} />
    </I18nProvider>,
  );

  const items = screen.getAllByRole("listitem");
  expect(items[0]).toHaveTextContent("Bea a terminat lecția Cardiology 2");
  expect(items[1]).toHaveTextContent("Bea a terminat un examen cu 87,5%");
  expect(items[2]).toHaveTextContent("Bea are o serie de 7 zile la rând");
});
