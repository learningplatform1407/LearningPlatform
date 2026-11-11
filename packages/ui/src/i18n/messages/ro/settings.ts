import type { Messages } from "../en";

export const settings: Messages["settings"] = {
  title: "Setări",
  sectionsLabel: "Secțiuni de setări",
  sections: {
    account: "Cont",
    privacy: "Confidențialitate",
    billing: "Abonament și plată",
    notifications: "Notificări",
    languages: "Limbi",
    appearance: "Aspect",
    profile: "Setări profil",
  },
  account: {
    failedToLoad: "Contul nu s-a putut încărca: {message}",
    signOut: "Deconectare",
    deleteAccount: "Șterge contul",
    deleteWarning:
      "Contul tău și toate datele tale vor fi șterse definitiv — progresul la lecții, cartonașele, notițele din carnet, tot. Acțiunea nu poate fi anulată.",
    deleteFailed: "Contul nu s-a putut șterge: {message}",
    deleteConfirm: "Șterge-mi contul",
  },
  password: {
    title: "Schimbă parola",
    intro: "Vei fi deconectat de pe toate dispozitivele, inclusiv de pe acesta. Ai uitat-o?",
    resetByEmail: "Reseteaz-o prin email",
    current: "Parola actuală",
    new: "Parola nouă",
    confirm: "Confirmă parola nouă",
    submit: "Schimbă parola",
    fillEveryField: "Completează toate câmpurile.",
    mismatch: "Parolele nu se potrivesc.",
    sameAsCurrent: "Aceasta este deja parola ta.",
    notSignedIn: "Nu ești conectat.",
    wrongCurrent: "Aceasta nu este parola ta actuală.",
  },
  privacy: {
    publicProfile: "Profil public",
    publicHint:
      "Când este activat, ceilalți cursanți te pot găsi după nume, te pot urmări și îți pot vedea profilul: numele, fotografia, universitatea, data înscrierii și statisticile de studiu. Notițele, evidențierile și răspunsurile tale nu sunt niciodată partajate.",
    needsName:
      "Adaugă mai întâi un nume afișat în setările profilului: persoanele sunt căutate după nume.",
  },
  notifications: {
    enable: "Activează notificările",
  },
  languages: {
    label: "Limba",
    hint: "Interfața se schimbă imediat după salvare. Conținutul lecțiilor rămâne în limba în care a fost scris.",
  },
  appearance: {
    theme: "Temă",
    light: "Luminoasă",
    dark: "Întunecată",
    system: "Sistem",
    hintWeb:
      "Sistem urmează setarea dispozitivului. Butonul cu lună din bara laterală o schimbă și el.",
    hintMobile: "Sistem urmează setarea dispozitivului. Salvarea o aplică aici și pe web.",
  },
  profile: {
    email: "Email",
    displayName: "Nume afișat",
    university: "Universitate",
    changePicture: "Schimbă poza de profil",
    clickToChange: "Dă clic pe poză ca să o schimbi.",
    tapToChange: "Atinge poza ca să o schimbi.",
    chooseImage: "Alege un fișier imagine.",
    imageTooLarge: "Imaginea trebuie să aibă sub 5 MB.",
    uploadFailed: "Imaginea nu s-a putut încărca.",
    photoPermission: "Ca să schimbi poza, aplicația are nevoie de acces la galeria foto.",
  },
};
