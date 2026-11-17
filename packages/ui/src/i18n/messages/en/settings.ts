export const settings = {
  title: "Settings",
  sectionsLabel: "Settings sections",
  /** Said once per section that has no Save button, because every control in
   * it writes on change. Sections with text fields (Account, Profile) keep
   * their Save and do not show this. */
  autosaveHint: "Changes are saved as you make them.",
  sections: {
    account: "Account",
    privacy: "Privacy",
    billing: "Subscription & Billing",
    notifications: "Notifications",
    languages: "Languages",
    appearance: "Appearance",
    profile: "Profile Settings",
  },
  account: {
    failedToLoad: "Failed to load account: {message}",
    signOut: "Sign out",
    deleteAccount: "Delete Account",
    deleteWarning:
      "This will permanently delete your account and all of your data — lessons progress, flashcards, notebook entries, everything. This cannot be undone.",
    deleteFailed: "Failed to delete account: {message}",
    deleteConfirm: "Delete my account",
  },
  password: {
    title: "Change password",
    intro: "You'll be signed out on every device, including this one. Forgotten it instead?",
    resetByEmail: "Reset it by email",
    current: "Current password",
    new: "New password",
    confirm: "Confirm new password",
    submit: "Change password",
    fillEveryField: "Fill in every field.",
    mismatch: "Those passwords do not match.",
    sameAsCurrent: "That is already your password.",
    notSignedIn: "You are not signed in.",
    wrongCurrent: "That is not your current password.",
  },
  privacy: {
    publicProfile: "Public profile",
    publicHint:
      "When on, other learners can find you by name, follow you, and see your profile: name, photo, university, join date and study stats. Your notes, highlights and answers are never shared.",
    needsName: "Add a display name in Profile settings first: people search by name.",
  },
  notifications: {
    enable: "Enable notifications",
  },
  languages: {
    label: "Language",
    hint: "The interface switches as soon as you choose. Lesson content stays in the language it was written in.",
    /** The mobile picker sheet's own heading. */
    choose: "Choose a language",
  },
  appearance: {
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    system: "System",
    hintWeb: "System follows your device. The moon button in the sidebar switches it too.",
    hintMobile: "System follows your device. Your choice applies here and on the web.",
  },
  profile: {
    email: "Email",
    displayName: "Display name",
    university: "University",
    changePicture: "Change profile picture",
    clickToChange: "Click the picture to change it.",
    tapToChange: "Tap the picture to change it.",
    chooseImage: "Please choose an image file.",
    imageTooLarge: "Image must be under 5MB.",
    uploadFailed: "Failed to upload image.",
    photoPermission: "Photo library permission is required to change your picture.",
  },
};
