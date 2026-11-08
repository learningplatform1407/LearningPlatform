import { plural } from "../../plural";
import type { Messages } from "../en";

export const study: Messages["study"] = {
  review: "Recapitulare",
  flashcards: "Cartonașe",
  due: "{count} de recapitulat",
  new: "{count} noi",
  wordsDueToday: plural({
    one: "{count} cuvânt de recapitulat azi în tot cursul.",
    few: "{count} cuvinte de recapitulat azi în tot cursul.",
    other: "{count} de cuvinte de recapitulat azi în tot cursul.",
  }),
  cardsDueToday: plural({
    one: "{count} cartonaș de recapitulat azi · {new} nestudiate încă.",
    few: "{count} cartonașe de recapitulat azi · {new} nestudiate încă.",
    other: "{count} de cartonașe de recapitulat azi · {new} nestudiate încă.",
  }),
  reviewLoadFailed: "Rezumatul recapitulării nu s-a putut încărca.",
  flashcardsLoadFailed: "Rezumatul cartonașelor nu s-a putut încărca.",
};
