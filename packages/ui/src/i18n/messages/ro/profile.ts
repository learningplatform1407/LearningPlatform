import { plural } from "../../plural";
import type { Messages } from "../en";

export const profile: Messages["profile"] = {
  title: "Profil",
  unnamed: "Fără nume",
  joined: "Membru din {date}",
  editProfile: "Editează profilul",
  loadingStats: "Se încarcă statisticile...",
  streak: "Serie",
  streakDays: plural({
    one: "🔥 {count} zi la rând",
    few: "🔥 {count} zile la rând",
    other: "🔥 {count} de zile la rând",
  }),
  noStreak: "Nicio serie încă",
  lessonsCompleted: "Lecții terminate",
  lessonsOf: "{completed} din {eligible} lecții",
  examsCompleted: "Examene terminate",
  accuracy: "Acuratețe și medii",
  examAverage: "Media la examene",
  questionAccuracy: "Acuratețea la grile",
  noData: "Încă fără date",
  progress: "Progres",
  badgesTitle: "Insigne",
  badgeState: "{badge}: {state}",
  earned: "obținută",
  locked: "blocată",
  badges: {
    joined: { label: "Bun venit", description: "Te-ai alăturat platformei" },
    "first-lesson": { label: "Prima lecție", description: "Termină prima lecție" },
    "first-exam": { label: "Primul examen", description: "Termină primul examen" },
    "three-day-streak": { label: "În formă", description: "Ajungi la o serie de 3 zile" },
  },
};
