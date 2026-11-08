import { plural } from "../../plural";

export const study = {
  review: "Review",
  flashcards: "Flashcards",
  due: "{count} due",
  new: "{count} new",
  wordsDueToday: plural({
    one: "{count} word due today across your course.",
    other: "{count} words due today across your course.",
  }),
  cardsDueToday: plural({
    one: "{count} card due today · {new} not studied yet.",
    other: "{count} cards due today · {new} not studied yet.",
  }),
  reviewLoadFailed: "Failed to load your review summary.",
  flashcardsLoadFailed: "Failed to load your flashcard summary.",
};
