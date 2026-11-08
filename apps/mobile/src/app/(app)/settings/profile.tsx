import type { MeResponse } from "@lp/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getApiClient } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";
import { useI18n } from "@/lib/i18n";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles, useThemeColors } from "@/lib/theme-context";
import { ScreenHeader } from "@/lib/ui/primitives";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export default function ProfileSettingsScreen() {
  const styles = useStyles();
  const { t } = useI18n();
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => getApiClient().getMe(),
  });

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
    onSuccess: (updated) => queryClient.setQueryData(["me"], updated),
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
      setAvatarError(t("settings.profile.photoPermission"));
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
      setAvatarError(t("settings.profile.imageTooLarge"));
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
      setAvatarError(err instanceof Error ? err.message : t("settings.profile.uploadFailed"));
    } finally {
      setAvatarUploading(false);
    }
  }

  if (isPending) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loading}>{t("common.loading")}</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.error}>
          {t("common.failedToLoadProfile", { message: (error as Error).message })}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader kicker={t("settings.title")} title={t("settings.sections.profile")} />

      <View style={styles.avatarRow}>
        <Pressable
          style={styles.avatar}
          onPress={handlePickAvatar}
          accessibilityRole="button"
          accessibilityLabel={t("settings.profile.changePicture")}
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
        <Text style={styles.hint}>{t("settings.profile.tapToChange")}</Text>
      </View>
      {avatarError && <Text style={styles.error}>{avatarError}</Text>}

      <Text style={styles.label}>{t("settings.profile.email")}</Text>
      <Text style={styles.readOnlyValue}>{data.email ?? "—"}</Text>

      <Text style={styles.label}>{t("settings.profile.displayName")}</Text>
      <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} />

      <Text style={styles.label}>{t("settings.profile.university")}</Text>
      <TextInput style={styles.input} value={university} onChangeText={setUniversity} />

      {saveMutation.isError && (
        <Text style={styles.error}>
          {t("common.failedToSave", { message: (saveMutation.error as Error).message })}
        </Text>
      )}
      <Pressable
        style={styles.saveButton}
        onPress={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        accessibilityRole="button"
      >
        <Text style={styles.saveButtonText}>
          {saveMutation.isPending ? t("common.saving") : t("common.save")}
        </Text>
      </Pressable>
      {saveMutation.isSuccess && <Text style={styles.saved}>{t("common.saved")}</Text>}
    </ScrollView>
  );
}

const AVATAR_SIZE = 64;

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.sm,
  },
  centered: {
    justifyContent: "center",
    padding: spacing.xl,
  },
  avatarRow: {
    marginTop: spacing.md,
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
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
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
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  saveButton: {
    marginTop: spacing.lg,
    borderRadius: 10,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    color: colors.primaryForeground,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
  },
  saved: {
    fontSize: fontSizes.sm,
    color: colors.success,
  },
  error: {
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
  loading: {
    color: colors.mutedForeground,
    fontSize: fontSizes.sm,
  },
}));
