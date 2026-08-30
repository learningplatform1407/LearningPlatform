import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";
import { supabase } from "@/lib/supabase";

export default function SignupScreen() {
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
      setError(signUpError.message);
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
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.footer}>
          We sent you a confirmation link. Follow it to finish creating your account.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign up</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
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
        <Text style={styles.buttonText}>{pending ? "Signing up..." : "Sign up"}</Text>
      </Pressable>
      <Link href="/login">
        <Text style={styles.footer}>
          Already have an account? <Text style={styles.footerLink}>Log in</Text>
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
