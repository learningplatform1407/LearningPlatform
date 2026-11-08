import type { Messages } from "../en";

export const auth: Messages["auth"] = {
  email: "Email",
  password: "Parolă",
  logIn: "Conectare",
  loggingIn: "Se conectează...",
  signUp: "Creează cont",
  signingUp: "Se creează contul...",
  forgotPassword: "Ți-ai uitat parola?",
  noAccount: "Nu ai cont?",
  haveAccount: "Ai deja cont?",
  checkEmail: "Verifică-ți emailul",
  confirmationSent:
    "Ți-am trimis un link de confirmare. Deschide-l ca să termini crearea contului.",
  passwordChanged:
    "Parola a fost schimbată. Ai fost deconectat de peste tot — conectează-te cu parola nouă.",
  resetTitle: "Resetează parola",
  resetIntro: "Introdu adresa de email cu care ți-ai creat contul.",
  resetExpired:
    "Linkul a expirat sau a fost deja folosit. Introdu adresa de email și îți trimitem altul.",
  resetSent:
    "Dacă adresa are un cont, i-am trimis un link pentru a seta o parolă nouă. Linkul poate fi folosit o singură dată.",
  backToLogIn: "Înapoi la conectare",
  sending: "Se trimite...",
  sendResetLink: "Trimite linkul de resetare",
  remembered: "Ți-ai amintit-o?",
  enterEmail: "Introdu adresa de email.",
  newPasswordTitle: "Setează o parolă nouă",
  newPasswordIntro:
    "Vei fi deconectat de pe toate dispozitivele, inclusiv de pe acesta, și te poți conecta din nou cu parola nouă.",
  enterNewPassword: "Introdu o parolă nouă.",
  saveNewPassword: "Salvează parola nouă",
  errors: {
    invalid_credentials: "Email sau parolă greșită.",
    email_not_confirmed: "Confirmă mai întâi adresa de email — caută linkul în căsuța de mesaje.",
    user_already_exists: "Există deja un cont cu acest email.",
    weak_password: "Parola este prea slabă. Folosește cel puțin 6 caractere.",
    same_password: "Aceasta este deja parola ta.",
    over_email_send_rate_limit:
      "Prea multe emailuri trimise. Așteaptă câteva minute și încearcă din nou.",
    over_request_rate_limit: "Prea multe încercări. Așteaptă câteva minute și încearcă din nou.",
  },
};
