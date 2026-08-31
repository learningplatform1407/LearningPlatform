import type { MeResponse } from "@lp/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";
import { colors, fontSizes, fontWeights, lineHeight, spacing } from "@/lib/theme";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function ProfileScreen() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getApiClient().getMe(),
  });

  const [mode, setMode] = useState<"view" | "edit">("view");
  const [displayName, setDisplayName] = useState("");
  const [university, setUniversity] = useState("");
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Render-time state sync from freshly-loaded/refetched data — see the
  // matching web comment for why this isn't a useEffect.
  const [syncedFrom, setSyncedFrom] = useState<MeResponse | null>(null);
  if (data && data !== syncedFrom) {
    setDisplayName(data.display_name ?? "");
    setUniversity(data.university ?? "");
    setSyncedFrom(data);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      getApiClient().updateMe({
        display_name: displayName || null,
        university: university || null,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["me"], updated);
      setMode("view");
    },
  });

  const avatarMutation = useMutation({
    mutationFn: (avatarUrl: string) => getApiClient().updateMe({ avatar_url: avatarUrl }),
    onSuccess: (updated) => queryClient.setQueryData(["me"], updated),
  });

  async function handlePickAvatar() {
    if (!data) return;
    setAvatarError(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      setAvatarError("Photo library permission is required to change your picture.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset) return;
    if (asset.fileSize && asset.fileSize > MAX_AVATAR_BYTES) {
      setAvatarError("Image must be under 5MB.");
      return;
    }

    setAvatarUploading(true);
    try {
      const blob = await (await fetch(asset.uri)).blob();
      const ext = asset.mimeType?.split("/")[1] ?? "jpg";
      const path = `${data.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: asset.mimeType ?? "image/jpeg" });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
      await avatarMutation.mutateAsync(publicUrlData.publicUrl);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Failed to upload image.");
    } finally {
      setAvatarUploading(false);
    }
  }

  if (isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
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
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <Pressable
          style={styles.settingsButton}
          onPress={() => router.push("/settings")}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Text style={styles.settingsIcon}>⚙</Text>
        </Pressable>
      </View>

      <View style={styles.avatarRow}>
        <Pressable
          style={styles.avatar}
          onPress={handlePickAvatar}
          accessibilityRole="button"
          accessibilityLabel="Change profile picture"
        >
          {data.avatar_url ? (
            <Image source={{ uri: data.avatar_url }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarInitial}>
              {(data.display_name ?? data.email ?? "?").slice(0, 1).toUpperCase()}
            </Text>
          )}
          {avatarUploading && (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color={colors.foreground} />
            </View>
          )}
        </Pressable>
        <Text style={styles.joined}>Joined {formatJoined(data.created_at)}</Text>
      </View>
      {avatarError && <Text style={styles.error}>{avatarError}</Text>}

      {mode === "view" ? (
        <>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Email</Text>
            <Text style={styles.rowValue}>{data.email ?? "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Display name</Text>
            <Text style={styles.rowValue}>{data.display_name ?? "Not set"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>University</Text>
            <Text style={styles.rowValue}>{data.university ?? "Not set"}</Text>
          </View>
          <Pressable
            style={styles.button}
            onPress={() => setMode("edit")}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Edit</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.readOnlyValue}>{data.email ?? "—"}</Text>

          <Text style={styles.label}>Display name</Text>
          <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} />

          <Text style={styles.label}>University</Text>
          <TextInput style={styles.input} value={university} onChangeText={setUniversity} />

          {saveMutation.isError && (
            <Text style={styles.error}>Failed to save: {(saveMutation.error as Error).message}</Text>
          )}
          <View style={styles.editActions}>
            <Pressable
              style={[styles.button, styles.saveButton]}
              onPress={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              accessibilityRole="button"
            >
              <Text style={styles.saveButtonText}>{saveMutation.isPending ? "Saving..." : "Save"}</Text>
            </Pressable>
            <Pressable
              style={styles.button}
              onPress={() => {
                setDisplayName(data.display_name ?? "");
                setUniversity(data.university ?? "");
                setMode("view");
              }}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const AVATAR_SIZE = 64;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSizes["2xl"],
    lineHeight: lineHeight(fontSizes["2xl"], "tight"),
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  settingsButton: {
    height: 32,
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  settingsIcon: {
    fontSize: fontSizes.lg,
    color: colors.mutedForeground,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarInitial: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.medium,
    color: colors.mutedForeground,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background + "b3",
  },
  joined: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  rowValue: {
    fontSize: fontSizes.sm,
    color: colors.foreground,
  },
  label: {
    marginTop: spacing.sm,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  readOnlyValue: {
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  editActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  button: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: spacing.md,
  },
  buttonText: {
    color: colors.foreground,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  saveButtonText: {
    color: colors.primaryForeground,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
  },
  error: {
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
  loading: {
    color: colors.mutedForeground,
    fontSize: fontSizes.sm,
  },
});
