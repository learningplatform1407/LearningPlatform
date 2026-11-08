import { plural } from "../../plural";
import type { Messages } from "../en";

export const common: Messages["common"] = {
  appName: "LearningPlatform",
  appDescription: "Aplicație de învățare și studiu pentru web și mobil.",
  loading: "Se încarcă...",
  save: "Salvează",
  saving: "Se salvează...",
  saved: "Salvat.",
  cancel: "Anulează",
  close: "Închide",
  delete: "Șterge",
  deleting: "Se șterge...",
  back: "Înapoi",
  closeNamed: "Închide {name}",
  comingSoonKicker: "În curând",
  comingSoon: "În curând.",
  failedToSave: "Salvarea a eșuat: {message}",
  failedToLoadSettings: "Setările nu s-au putut încărca: {message}",
  days: plural({ one: "{count} zi", few: "{count} zile", other: "{count} de zile" }),
  failedToLoadProfile: "Profilul nu s-a putut încărca: {message}",
};
