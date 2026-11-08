import { Link } from "expo-router";
import { authErrorMessage } from "@lp/ui";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useI18n } from "@/lib/i18n";
import { fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { makeStyles } from "@/lib/theme-context";

export default function LoginScreen() {
  const styles = useStyles();
  const translator = useI18n();
  const { t } = translator;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    setPending(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setPending(false);
    if (signInError) {
      setError(authErrorMessage(translator, signInError));
    }
    // On success, onAuthStateChange updates the session and Stack.Protected
    // reactively swaps to the protected stack — no manual navigation needed.
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("auth.logIn")}</Text>
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
        // Without this, Android's soft keyboard reports CapSentences for the
        // field and capitalises the first character, so a password starting
        // lowercase is submitted wrong and Supabase answers "Invalid login
        // credentials". The email field above already sets it.
        autoCapitalize="none"
        autoComplete="current-password"
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
        <Text style={styles.buttonText}>{pending ? t("auth.loggingIn") : t("auth.logIn")}</Text>
      </Pressable>
      <Link href="/signup">
        <Text style={styles.footer}>
          {t("auth.noAccount")} <Text style={styles.footerLink}>{t("auth.signUp")}</Text>
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
