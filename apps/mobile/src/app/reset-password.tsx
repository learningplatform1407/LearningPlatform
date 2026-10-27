import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

/** Reachable only while `isRecovering`, which the deep-link handler sets.
 *
 * Gating on `session` would not do: a recovery link mints an ordinary full
 * session, so that would make this screen reachable by anyone already signed
 * in — and it sets a new password without asking for the current one. The
 * same trap the web proxy closes with a signed marker cookie. See
 * `docs/architecture/password-reset.md` §4 and §5.
 */
export default function ResetPasswordScreen() {
  const { endRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    if (password !== confirmation) {
      setError("Those passwords do not match.");
      return;
    }

    setPending(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setPending(false);
      setError(updateError.message);
      return;
    }

    // Same rule as web: a password change ends every session, this one
    // included. The premise of a reset is that somebody else may know the old
    // password, and leaving their session alive fixes nothing.
    //
    // endRecovery() after signOut, not before: clearing the flag first would
    // re-derive the guard as `!!session && !isRecovering` and flash the app
    // stack open in the moment before the sign-out lands.
    await supabase.auth.signOut({ scope: "global" });
    endRecovery();
    // No navigation needed -- onAuthStateChange drops `session`, and the
    // navigator swaps back to the signed-out stack on its own.
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set a new password</Text>
      <Text style={styles.body}>
        You&apos;ll be signed out on every device, including this one, and can log in again with the
        new password.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="New password"
        placeholderTextColor={colors.mutedForeground}
        secureTextEntry
        autoComplete="new-password"
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm new password"
        placeholderTextColor={colors.mutedForeground}
        secureTextEntry
        autoComplete="new-password"
        value={confirmation}
        onChangeText={setConfirmation}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={styles.button}
        onPress={handleSubmit}
        disabled={pending || password.length === 0 || confirmation.length === 0}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{pending ? "Saving..." : "Save new password"}</Text>
      </Pressable>
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
});
