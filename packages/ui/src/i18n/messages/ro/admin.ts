import { plural } from "../../plural";
import type { Messages } from "../en";

export const admin: Messages["admin"] = {
  kicker: "Instrumente de conținut",
  title: "Administrare",
  adminKicker: "Administrare",
  accessRequired: "Este necesar accesul de administrator.",
  intro: "Instrumente de conținut. Fiecare se deschide acolo unde se află conținutul respectiv.",
  tools: {
    library: "Cărți, capitole și lecții",
    libraryDescription:
      "Creează cărți, capitole și subcapitole și încarcă PDF-urile lecțiilor — răsfoiești același arbore pe care îl văd cursanții, cu formularele de administrare incluse.",
    questions: "Importă grile",
    questionsDescription:
      "Import JSON în masă, cu previzualizare de probă. Idempotent după external_id, deci un reimport actualizează în loc să dubleze.",
    flashcards: "Importă cartonașe",
    flashcardsDescription:
      "Import JSON în masă al cartonașelor oficiale, legate de o lecție. Același flux de probă și apoi confirmare ca la grile.",
    daily: "Întrebarea zilei",
    dailyDescription:
      "Plănuiește ce întrebare primește fiecare dintre zilele următoare sau trage alta. Zilele lăsate neatinse trag una la întâmplare când un cursant le deschide prima oară.",
  },
  import: {
    readFailed: "Fișierul nu s-a putut citi",
    dryRun: "Probă — nu s-a scris nimic încă",
    committed: "Import confirmat",
    created: "Create",
    updated: "Actualizate",
    skipped: "Omise",
    somethingWrong: "Ceva n-a mers bine.",
    invalidJson: "JSON invalid",
    invalidJsonDetail: "JSON invalid: {detail}",
    couldNotRead: "Fișierul nu s-a putut citi.",
    uploadJson: "Încarcă un fișier JSON",
    payload: "Conținutul importului (JSON)",
    checking: "Se verifică...",
    preview: "Previzualizare (probă)",
    importing: "Se importă...",
    import: "Importă",
    previewFirst: "Rulează o previzualizare de probă pe conținutul curent înainte de import.",
    flashcardsIntro:
      "Fiecare cartonaș importat este {official} și vizibil pentru toți cei care studiază lecția lui. {externalId} este cheia de actualizare, deci reimportul aceluiași conținut actualizează cartonașele în loc să le dubleze.",
    official: "oficial",
  },
  daily: {
    todayWithDate: "Azi — {date}",
    chosenByAdmin: "Aleasă de un administrator",
    drawnAtRandom: "Trasă la întâmplare",
    notDrawn: "Netrasă",
    answers: plural({
      one: " · {count} răspuns",
      few: " · {count} răspunsuri",
      other: " · {count} de răspunsuri",
    }),
    noQuestionPicked: "Nicio întrebare aleasă încă.",
    locked: plural({
      one: "Cineva a răspuns deja în această zi, așa că nu mai poate fi schimbată.",
      few: "{count} persoane au răspuns deja în această zi, așa că nu mai poate fi schimbată.",
      other: "{count} de persoane au răspuns deja în această zi, așa că nu mai poate fi schimbată.",
    }),
    drawDifferent: "Trage altă întrebare",
    draw: "Trage o întrebare",
    questionId: "ID-ul întrebării",
    questionIdFor: "ID-ul întrebării pentru {date}",
    set: "Setează",
    intro:
      "Azi și următoarele {days} zile. O zi pe care n-a tras-o nimeni primește o întrebare publicată la întâmplare prima dată când un cursant o deschide, deci e în regulă să le lași așa. Zilele trecute nu apar aici: schimbarea uneia ar rescrie istoria la care oamenii au răspuns deja.",
    loadingDays: "Se încarcă zilele...",
    loadFailed: "Programul nu s-a putut încărca.",
  },
};
