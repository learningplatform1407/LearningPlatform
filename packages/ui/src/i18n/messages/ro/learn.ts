import { plural } from "../../plural";
import type { Messages } from "../en";

export const learn: Messages["learn"] = {
  kicker: "Cursul tău",
  title: "Învață",
  loadRecentFailed: "Lecțiile recente nu s-au putut încărca.",
  continue: "Continuă de unde ai rămas",
  resume: "Reia lectura →",
  recentlyOpened: "Deschise recent",
  studyTools: "Instrumente de studiu",
  status: {
    processing: "Se procesează...",
    ready: "Gata",
    failed: "Eșuat",
  },
  tools: {
    library: "Bibliotecă",
    libraryDescription: "Răsfoiește cărți, capitole și lecții.",
    review: "Recapitulare",
    reviewDescription: "Vezi câte cuvinte ai de recapitulat azi, din toate lecțiile.",
    questionBank: "Banca de grile",
    questionBankDescription: "Răsfoiește și rezolvă grile, cu statistici despre progresul tău.",
    flashcards: "Cartonașe",
    flashcardsDescription:
      "Cartonașe cu repetiție spațiată pentru fiecare lecție, oficiale și ale tale.",
    notebook: "Carnet",
    notebookDescription: "Toate notițele și desenele tale într-un singur loc.",
  },
};

export const library: Messages["library"] = {
  title: "Bibliotecă",
  loadFailed: "Biblioteca nu s-a putut încărca: {message}",
  empty: "Nicio carte deocamdată.",
  uncategorized: "Necategorisite",
  chapters: plural({
    one: "{count} capitol",
    few: "{count} capitole",
    other: "{count} de capitole",
  }),
  subChapters: plural({
    one: "{count} subcapitol",
    few: "{count} subcapitole",
    other: "{count} de subcapitole",
  }),
  lessons: plural({ one: "{count} lecție", few: "{count} lecții", other: "{count} de lecții" }),
  newBook: "Carte nouă",
  bookTitle: "Titlu",
  createBook: "Creează cartea",
  creating: "Se creează...",
  createFailed: "Cartea nu s-a putut crea.",
};
