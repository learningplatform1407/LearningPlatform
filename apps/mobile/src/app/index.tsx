import { useQuery } from "@tanstack/react-query";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";

export default function DashboardScreen() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getApiClient().getMe(),
  });

  if (isPending) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Failed to load profile: {(error as Error).message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome{data.display_name ? `, ${data.display_name}` : ""}</Text>
      <Text>Email: {data.email}</Text>
      <Text>University: {data.university ?? "Not set"}</Text>
      <Text>Theme: {data.settings.theme}</Text>
      <Text>Notifications: {data.settings.notifications_enabled ? "Enabled" : "Disabled"}</Text>
      <Pressable style={styles.button} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 8 },
  title: { fontSize: 24, fontWeight: "600", marginBottom: 12 },
  button: {
    backgroundColor: "#111",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: "red" },
});
