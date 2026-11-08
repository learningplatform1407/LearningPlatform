import { plural } from "../../plural";

export const learn = {
  // No `kicker`: the Learn hub is the root of the Library -> Chapter ->
  // Sub-chapter -> Lesson nesting, so it has no parent section to name, and
  // there is no course entity for one to name either. It used to render
  // "Your course" above the title, i.e. "Your course: Learn".
  title: "Learn",
  loadRecentFailed: "Failed to load your recent lessons.",
  continue: "Continue where you left off",
  resume: "Resume reading →",
  recentlyOpened: "Recently opened",
  studyTools: "Study tools",
  status: {
    processing: "Processing...",
    ready: "Ready",
    failed: "Failed",
  },
  tools: {
    library: "Library",
    libraryDescription: "Browse books, chapters, and lessons.",
    review: "Review",
    reviewDescription: "See how many words are due today, across every lesson.",
    questionBank: "Question Bank",
    questionBankDescription: "Browse and answer questions, with stats on your progress.",
    flashcards: "Flashcards",
    flashcardsDescription: "Spaced-repetition cards per lesson, official and your own.",
    notebook: "Notebook",
    notebookDescription: "All your notes and drawings in one place.",
  },
};

export const library = {
  title: "Library",
  loadFailed: "Failed to load the library: {message}",
  empty: "No books yet.",
  uncategorized: "Uncategorized",
  chapters: plural({ one: "{count} chapter", other: "{count} chapters" }),
  subChapters: plural({ one: "{count} sub-chapter", other: "{count} sub-chapters" }),
  lessons: plural({ one: "{count} lesson", other: "{count} lessons" }),
  newBook: "New book",
  bookTitle: "Title",
  createBook: "Create book",
  creating: "Creating...",
  createFailed: "Failed to create book.",
};
