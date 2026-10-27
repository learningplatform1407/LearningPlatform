import * as Linking from "expo-linking";
import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { supabase } from "@/lib/supabase";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

export default function ForgotPasswordScreen() {
  const { expired } = useLocalSearchParams<{ expired?: string }>();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    setPending(true);
    setError(null);

    // createURL, not a hand-written "learningplatform://" string: in Expo Go
    // the app has no custom scheme of its own and is reached over
    // exp://…/--/…, so a literal scheme URL would never open in development.
    const redirectTo = Linking.createURL("/reset-password", {
      queryParams: { flow: "recovery" },
    });
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });
    setPending(false);

    // Not branched on whether the address has an account: Supabase does not
    // say, and an endpoint that did would let anyone test whether a given
    // person studies here. Only transport and rate-limit failures surface.
    // See docs/architecture/password-reset.md §2.
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.body}>
          If that address has an account, we&apos;ve sent it a link to set a new password. The link
          can only be used once.
        </Text>
        <Link href="/login">
          <Text style={styles.footerLink}>Back to log in</Text>
        </Link>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reset your password</Text>
      {expired === "1" ? (
        <Text style={styles.error}>
          That link has expired or was already used. Enter your email and we&apos;ll send a new one.
        </Text>
      ) : (
        <Text style={styles.body}>Enter the email address you signed up with.</Text>
      )}
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={styles.button}
        onPress={handleSubmit}
        disabled={pending || email.trim().length === 0}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{pending ? "Sending..." : "Send reset link"}</Text>
      </Pressable>
      <Link href="/login">
        <Text style={styles.footer}>
          Remembered it? <Text style={styles.footerLink}>Log in</Text>
        </Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
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
  body: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.sm,
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
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
});
