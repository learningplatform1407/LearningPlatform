import { Link } from "expo-router";
import { authErrorMessage } from "@lp/ui";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useI18n } from "@/lib/i18n";
import { fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { makeStyles } from "@/lib/theme-context";

export default function SignupScreen() {
  const styles = useStyles();
  const translator = useI18n();
  const { t } = translator;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit() {
    setPending(true);
    setError(null);
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    setPending(false);
    if (signUpError) {
      setError(authErrorMessage(translator, signUpError));
      return;
    }
    // If a session was returned immediately, onAuthStateChange + Stack.Protected
    // handle the transition automatically. Otherwise, confirmation is required.
    if (!data.session) {
      setCheckEmail(true);
    }
  }

  if (checkEmail) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t("auth.checkEmail")}</Text>
        <Text style={styles.footer}>{t("auth.confirmationSent")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("auth.signUp")}</Text>
      <TextInput
        style={styles.input}
        placeholder={t("auth.email")}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder={t("auth.password")}
        secureTextEntry
        autoComplete="new-password"
        value={password}
        onChangeText={setPassword}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={styles.button}
        onPress={handleSubmit}
        disabled={pending}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{pending ? t("auth.signingUp") : t("auth.signUp")}</Text>
      </Pressable>
      <Link href="/login">
        <Text style={styles.footer}>
          {t("auth.haveAccount")} <Text style={styles.footerLink}>{t("auth.logIn")}</Text>
        </Text>
      </Link>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: fontSizes["2xl"],
    lineHeight: lineHeight(fontSizes["2xl"], "tight"),
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.sm,
    fontSize: 15,
    color: colors.foreground,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: "center",
  },
  buttonText: {
    color: colors.primaryForeground,
    fontWeight: fontWeights.semibold,
    fontSize: fontSizes.sm,
  },
  error: {
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
  footer: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  footerLink: {
    color: colors.primary,
    fontWeight: fontWeights.medium,
  },
}));
