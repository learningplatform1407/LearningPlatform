import { plural } from "../../plural";

export const admin = {
  kicker: "Content tools",
  title: "Admin",
  adminKicker: "Admin",
  accessRequired: "Admin access required.",
  intro: "Content tools. Each one opens where that content actually lives.",
  tools: {
    library: "Books, chapters and lectures",
    libraryDescription:
      "Create books, chapters and sub-chapters, and upload lecture PDFs — browse the same tree learners see, with the admin forms included.",
    questions: "Import questions",
    questionsDescription:
      "Bulk JSON import with a dry-run preview. Idempotent on external_id, so re-importing updates rather than duplicating.",
    flashcards: "Import flashcards",
    flashcardsDescription:
      "Bulk JSON import of official cards, bound to a lesson. Same dry-run-then-commit flow as questions.",
    daily: "Question of the day",
    dailyDescription:
      "Plan which question each of the coming days gets, or redraw one. Days left alone draw at random when a learner first opens them.",
  },
  import: {
    readFailed: "Failed to read file",
    dryRun: "Dry run — nothing written yet",
    committed: "Import committed",
    created: "Created",
    updated: "Updated",
    skipped: "Skipped",
    somethingWrong: "Something went wrong.",
    invalidJson: "Invalid JSON",
    invalidJsonDetail: "Invalid JSON: {detail}",
    couldNotRead: "Could not read that file.",
    uploadJson: "Upload a JSON file",
    payload: "Import payload (JSON)",
    checking: "Checking...",
    preview: "Preview (dry run)",
    importing: "Importing...",
    import: "Import",
    previewFirst: "Run a dry-run preview on the current payload before importing.",
    flashcardsIntro:
      "Every imported card is {official} and visible to everyone studying its lesson. {externalId} is the upsert key, so re-importing the same payload updates those cards rather than duplicating them.",
    official: "official",
  },
  daily: {
    todayWithDate: "Today — {date}",
    chosenByAdmin: "Chosen by an admin",
    drawnAtRandom: "Drawn at random",
    notDrawn: "Not drawn",
    answers: plural({ one: " · {count} answer", other: " · {count} answers" }),
    noQuestionPicked: "No question picked yet.",
    locked: plural({
      one: "Someone has already answered this day, so it can no longer be changed.",
      other: "{count} people have already answered this day, so it can no longer be changed.",
    }),
    drawDifferent: "Draw a different question",
    draw: "Draw a question",
    questionId: "Question id",
    questionIdFor: "Question id for {date}",
    set: "Set",
    intro:
      "Today and the next {days} days. A day nobody has drawn yet gets a random published question the first time a learner opens it, so leaving these alone is a valid plan. Past days never appear here: changing one would rewrite history people have already answered.",
    loadingDays: "Loading days...",
    loadFailed: "Failed to load the schedule.",
  },
};
