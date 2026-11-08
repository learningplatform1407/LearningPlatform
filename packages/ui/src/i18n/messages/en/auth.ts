export const auth = {
  email: "Email",
  password: "Password",
  logIn: "Log in",
  loggingIn: "Logging in...",
  signUp: "Sign up",
  signingUp: "Signing up...",
  forgotPassword: "Forgot your password?",
  noAccount: "Don't have an account?",
  haveAccount: "Already have an account?",
  checkEmail: "Check your email",
  confirmationSent: "We sent you a confirmation link. Follow it to finish creating your account.",
  passwordChanged:
    "Password changed. You've been signed out everywhere — log in with your new password.",
  resetTitle: "Reset your password",
  resetIntro: "Enter the email address you signed up with.",
  resetExpired:
    "That link has expired or was already used. Enter your email address and we'll send a new one.",
  resetSent:
    "If that address has an account, we've sent it a link to set a new password. The link can only be used once.",
  backToLogIn: "Back to log in",
  sending: "Sending...",
  sendResetLink: "Send reset link",
  remembered: "Remembered it?",
  enterEmail: "Enter your email address.",
  newPasswordTitle: "Set a new password",
  newPasswordIntro:
    "You'll be signed out on every device, including this one, and can log in again with the new password.",
  enterNewPassword: "Enter a new password.",
  saveNewPassword: "Save new password",
  /** Supabase's error codes we can say better than its English message. */
  errors: {
    invalid_credentials: "Wrong email or password.",
    email_not_confirmed: "Confirm your email address first — check your inbox for the link.",
    user_already_exists: "An account with this email already exists.",
    weak_password: "That password is too weak. Use at least 6 characters.",
    same_password: "That is already your password.",
    over_email_send_rate_limit: "Too many emails sent. Wait a few minutes and try again.",
    over_request_rate_limit: "Too many attempts. Wait a few minutes and try again.",
  },
};
