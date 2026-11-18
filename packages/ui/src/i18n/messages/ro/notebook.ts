import type { Messages } from "../en";

export const notebook: Messages["notebook"] = {
  title: "Carnet",
  notes: "Notițe",
  contents: "Cuprinsul carnetului",
  loadFailed: "Carnetul nu s-a putut încărca.",
  notFound: "Notița nu a fost găsită.",
  allNotes: "‹ Toate notițele",
  selectPrompt: "Alege o notiță din stânga sau creează una nouă.",
  untitled: "Notiță fără titlu",
  empty: "Nicio notiță deocamdată.",
  drawing: "Desen",
  newText: "+ Text",
  newDrawing: "+ Desen",
  noteTitle: "Titlu",
  noteBody: "Notiță",
  placeholder: "Scrie aici notița ta…",
  drawingTools: "Unelte de desen",
  penColor: "Culoarea pixului — {color}",
  penSize: "Grosimea pixului — {size}",
  penSizes: "Grosimea pixului",
  tool: "Unealtă",
  pen: "Pix",
  eraser: "Gumă",
  undo: "Anulează",
  clear: "Golește",
  canvas: "Pânză de desen",
  preview: "Previzualizarea desenului",
};

export const colors: Messages["colors"] = {
  graphite: "grafit",
  yellow: "galben",
  blue: "albastru",
  purple: "mov",
  red: "roșu",
  green: "verde",
};

/** Pen nib sizes, by their PEN_SIZES name. */
export const penSizes: Messages["penSizes"] = {
  thin: "subțire",
  medium: "medie",
  thick: "groasă",
};
