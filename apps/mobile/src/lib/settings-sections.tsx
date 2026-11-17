import type { MeResponse } from "@lp/contracts";
import { LANGUAGE_NAMES, LANGUAGES, resolveLanguage, type Language } from "@lp/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { getApiClient } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { Overlay } from "@/lib/overlay";
import { supabase } from "@/lib/supabase";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles, useThemeColors } from "@/lib/theme-context";
import { ScreenHeader, SegmentedSwitch } from "@/lib/ui/primitives";

/**
 * The settings sections, as components.
 *
 * On a phone all of them sit on one page, one under another
 * (`app/(app)/settings/index.tsx`), rather than behind the small left nav the
 * web has room for: there were seven sections holding one or two controls
 * each, and a side menu taking two fifths of the width to reach them. The
 * section routes still exist for the links that point at them -- the privacy
 * notice on the People screen, "add a display name first" -- and render the
 * very same components.
 *
 * They live in `lib/` rather than in the route files so expo-router never has
 * to make sense of a route exporting components other screens import.
 */

// --- saving ----------------------------------------------------------------

/** The settings fields a control here can write on its own. */
type SettingsPatch = {
  theme?: string;
  notifications_enabled?: boolean;
  language?: Language;
  profile_public?: boolean;
};

/**
 * Writes one settings field the moment it changes.
 *
 * These sections have no Save button. A switch that needs confirming lies
 * about the state of things until the second press: the one on screen said
 * notifications were on while the account still had them off. The cache is
 * updated before the request leaves, so the control moves under the finger,
 * and a failure puts the old value back and says so -- the only job Save was
 * really doing.
 *
 * Text fields (Profile) keep their Save: writing per keystroke would be a
 * request per letter, and half a name is a worse thing to store than an
 * unsaved one.
 */
function useSettingsWriter(onSaved?: (updated: MeResponse) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => getApiClient().updateMe(patch),
    onMutate: (patch) => {
      const previous = queryClient.getQueryData<MeResponse>(["me"]);
      if (previous) {
        queryClient.setQueryData<MeResponse>(["me"], {
          ...previous,
          // Flat in the request, nested in the response -- every key here is
          // a settings field, so the mapping is this one spread.
          settings: { ...previous.settings, ...patch },
        });
      }
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(["me"], context.previous);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["me"], updated);
      onSaved?.(updated);
    },
  });
}

/** The one line a section shows when a write fails. */
function SaveError({ error }: { error: unknown }) {
  const { t } = useI18n();
  const styles = useStyles();
  if (!error) return null;
  return (
    <Text style={styles.error} accessibilityLiveRegion="polite">
      {t("common.failedToSave", { message: (error as Error).message })}
    </Text>
  );
}

// --- account ---------------------------------------------------------------

export function AccountSection({ me }: { me: MeResponse }) {
  const { t } = useI18n();
  const styles = useStyles();
  const [deleteOpen, setDeleteOpen] = useState(false);

  // No onSuccess navigation: signOut() clears the session, which already
  // takes the user back to the login screen via the root auth redirect.
  const deleteMutation = useMutation({
    mutationFn: () => getApiClient().deleteMe(),
    onSuccess: () => {
      setDeleteOpen(false);
      supabase.auth.signOut();
    },
  });

  return (
    <View style={styles.section}>
      <Text style={styles.hint}>{me.email}</Text>
      <Pressable
        style={styles.button}
        onPress={() => supabase.auth.signOut()}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{t("settings.account.signOut")}</Text>
      </Pressable>
      <Pressable
        style={styles.dangerButton}
        onPress={() => setDeleteOpen(true)}
        accessibilityRole="button"
      >
        <Text style={styles.dangerButtonText}>{t("settings.account.deleteAccount")}</Text>
      </Pressable>

      <Overlay
        visible={deleteOpen}
        title={t("settings.account.deleteAccount")}
        onClose={() => setDeleteOpen(false)}
        footer={
          <Pressable
            style={styles.dangerButton}
            onPress={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            accessibilityRole="button"
          >
            <Text style={styles.dangerButtonText}>
              {deleteMutation.isPending
                ? t("common.deleting")
                : t("settings.account.deleteConfirm")}
            </Text>
          </Pressable>
        }
      >
        <Text style={styles.hint}>{t("settings.account.deleteWarning")}</Text>
        {deleteMutation.isError && (
          <Text style={styles.error}>
            {t("settings.account.deleteFailed", {
              message: (deleteMutation.error as Error).message,
            })}
          </Text>
        )}
      </Overlay>
    </View>
  );
}

// --- privacy ---------------------------------------------------------------

export function PrivacySection({ me }: { me: MeResponse }) {
  const { t } = useI18n();
  const styles = useStyles();
  const queryClient = useQueryClient();
  const write = useSettingsWriter(() => {
    // Who appears in other people's lists just changed.
    void queryClient.invalidateQueries({ queryKey: ["followers"] });
    void queryClient.invalidateQueries({ queryKey: ["following"] });
  });
  const isPublic = me.settings.profile_public;
  // Search is by name only, so the API refuses a nameless public profile.
  const needsName = !me.display_name?.trim();

  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{t("settings.privacy.publicProfile")}</Text>
        <Switch
          value={isPublic}
          onValueChange={(next) => write.mutate({ profile_public: next })}
          disabled={(needsName && !isPublic) || write.isPending}
          accessibilityLabel={t("settings.privacy.publicProfile")}
        />
      </View>
      <Text style={styles.hint}>{t("settings.privacy.publicHint")}</Text>
      {needsName && (
        <Pressable onPress={() => router.push("/settings/profile")} accessibilityRole="link">
          <Text style={styles.link}>{t("settings.privacy.needsName")}</Text>
        </Pressable>
      )}
      <SaveError error={write.error} />
    </View>
  );
}

// --- billing ---------------------------------------------------------------

export function BillingSection() {
  const { t } = useI18n();
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.hint}>{t("common.comingSoon")}</Text>
    </View>
  );
}

// --- notifications ---------------------------------------------------------

export function NotificationsSection({ me }: { me: MeResponse }) {
  const { t } = useI18n();
  const styles = useStyles();
  const write = useSettingsWriter();

  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{t("settings.notifications.enable")}</Text>
        <Switch
          value={me.settings.notifications_enabled}
          onValueChange={(next) => write.mutate({ notifications_enabled: next })}
          disabled={write.isPending}
          accessibilityLabel={t("settings.notifications.enable")}
        />
      </View>
      <SaveError error={write.error} />
    </View>
  );
}

// --- languages -------------------------------------------------------------

/**
 * The language dropdown: a row saying which language is active, opening a
 * sheet to pick another.
 *
 * A dropdown rather than the row of pills this was -- two pills now, a
 * wrapping wall at six -- and a sheet rather than a floating panel, because a
 * phone has nowhere to float one. It is the shape this app already uses for
 * "pick from a list" (see the exam screen's tag picker). The web has had a
 * `<select>` here all along.
 */
export function LanguagesSection({ me }: { me: MeResponse }) {
  const { t } = useI18n();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const write = useSettingsWriter();
  const language = resolveLanguage(me.settings.language);

  return (
    <View style={styles.section}>
      <Text style={styles.rowLabel}>{t("settings.languages.label")}</Text>
      <Pressable
        style={styles.select}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t("settings.languages.label")}
        accessibilityValue={{ text: LANGUAGE_NAMES[language] }}
      >
        <Text style={styles.selectValue}>{LANGUAGE_NAMES[language]}</Text>
        <Text style={styles.selectChevron}>⌄</Text>
      </Pressable>
      <Text style={styles.hint}>{t("settings.languages.hint")}</Text>
      <SaveError error={write.error} />

      <Overlay visible={open} title={t("settings.languages.choose")} onClose={() => setOpen(false)}>
        {/* Each name in its own language, so it reads whatever the interface
            is currently in. */}
        {LANGUAGES.map((code) => {
          const selected = code === language;
          return (
            <Pressable
              key={code}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => {
                setOpen(false);
                if (!selected) write.mutate({ language: code });
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={styles.optionLabel}>{LANGUAGE_NAMES[code]}</Text>
              {selected && <Text style={styles.optionCheck}>✓</Text>}
            </Pressable>
          );
        })}
      </Overlay>
    </View>
  );
}

// --- appearance ------------------------------------------------------------

const THEME_CHOICES = ["light", "dark", "system"] as const;

export function AppearanceSection({ me }: { me: MeResponse }) {
  const { t } = useI18n();
  const styles = useStyles();
  const write = useSettingsWriter();

  return (
    <View style={styles.section}>
      <Text style={styles.rowLabel}>{t("settings.appearance.theme")}</Text>
      <SegmentedSwitch
        label={t("settings.appearance.theme")}
        options={THEME_CHOICES.map((value) => ({
          value,
          label: t(`settings.appearance.${value}`),
        }))}
        value={(me.settings.theme as (typeof THEME_CHOICES)[number]) ?? "system"}
        onChange={(theme) => write.mutate({ theme })}
      />
      <Text style={styles.hint}>{t("settings.appearance.hintMobile")}</Text>
      <SaveError error={write.error} />
    </View>
  );
}

// --- profile ---------------------------------------------------------------

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_SIZE = 64;

export function ProfileSection({ me }: { me: MeResponse }) {
  const { t } = useI18n();
  const styles = useStyles();
  const colors = useThemeColors();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [university, setUniversity] = useState("");
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Render-time state sync from freshly-loaded/refetched data — see the
  // matching web comment for why this isn't a useEffect.
  //
  // Compared by **value**, not by object identity. On the one-page screen
  // every section shares one `me`, and the sections that write on change put
  // a new object into the cache on every tap: keyed on identity, flipping the
  // notifications switch threw away a name typed here but not yet saved.
  // Comparing the two fields this section actually reads keeps the original
  // intent — adopt values that genuinely changed server-side — without that.
  const serverName = me.display_name ?? "";
  const serverUniversity = me.university ?? "";
  const [syncedFrom, setSyncedFrom] = useState<{ name: string; university: string } | null>(null);
  if (syncedFrom?.name !== serverName || syncedFrom.university !== serverUniversity) {
    setDisplayName(serverName);
    setUniversity(serverUniversity);
    setSyncedFrom({ name: serverName, university: serverUniversity });
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
      const path = `${me.id}/avatar.${ext}`;
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

  return (
    <View style={styles.section}>
      <View style={styles.avatarRow}>
        <Pressable
          style={styles.avatar}
          onPress={handlePickAvatar}
          accessibilityRole="button"
          accessibilityLabel={t("settings.profile.changePicture")}
        >
          {me.avatar_url ? (
            <Image source={{ uri: me.avatar_url }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarInitial}>
              {(me.display_name ?? me.email ?? "?").slice(0, 1).toUpperCase()}
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
      <Text style={styles.readOnlyValue}>{me.email ?? "—"}</Text>

      <Text style={styles.label}>{t("settings.profile.displayName")}</Text>
      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
        accessibilityLabel={t("settings.profile.displayName")}
      />

      <Text style={styles.label}>{t("settings.profile.university")}</Text>
      <TextInput
        style={styles.input}
        value={university}
        onChangeText={setUniversity}
        accessibilityLabel={t("settings.profile.university")}
      />

      <SaveError error={saveMutation.error} />
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
    </View>
  );
}

// --- the page --------------------------------------------------------------

/** Top to bottom: who you are, then what the app does, then how it looks. */
export const SETTINGS_SECTIONS = [
  "account",
  "privacy",
  "billing",
  "notifications",
  "languages",
  "appearance",
  "profile",
] as const;

export type SettingsSectionKey = (typeof SETTINGS_SECTIONS)[number];

/** Which sections write as you go, and so earn the autosave note. Profile
 * holds text fields and keeps its Save button; Account's actions and
 * Billing's placeholder save nothing at all. */
const AUTOSAVES: ReadonlySet<SettingsSectionKey> = new Set([
  "privacy",
  "notifications",
  "languages",
  "appearance",
]);

function SectionBody({ section, me }: { section: SettingsSectionKey; me: MeResponse }) {
  switch (section) {
    case "account":
      return <AccountSection me={me} />;
    case "privacy":
      return <PrivacySection me={me} />;
    case "billing":
      return <BillingSection />;
    case "notifications":
      return <NotificationsSection me={me} />;
    case "languages":
      return <LanguagesSection me={me} />;
    case "appearance":
      return <AppearanceSection me={me} />;
    case "profile":
      return <ProfileSection me={me} />;
  }
}

/** One section under its heading, ruled off from the one above. */
function SettingsGroup({ section, me }: { section: SettingsSectionKey; me: MeResponse }) {
  const { t } = useI18n();
  const styles = useStyles();
  return (
    <View style={styles.group}>
      <Text style={styles.groupHeading} accessibilityRole="header">
        {t(`settings.sections.${section}`)}
      </Text>
      {AUTOSAVES.has(section) && <Text style={styles.hint}>{t("settings.autosaveHint")}</Text>}
      <SectionBody section={section} me={me} />
    </View>
  );
}

/** `me`, once, instead of the loading and failure lines every section would
 * otherwise repeat down the page. */
function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => getApiClient().getMe() });
}

/** Every section on one page -- the phone's whole Settings screen. */
export function AllSettingsScreen() {
  const { t } = useI18n();
  const styles = useStyles();
  const { data, isPending, isError, error } = useMe();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader title={t("settings.title")} />
      {isPending && <Text style={styles.hint}>{t("common.loading")}</Text>}
      {isError && (
        <Text style={styles.error}>
          {t("common.failedToLoadSettings", { message: (error as Error).message })}
        </Text>
      )}
      {data &&
        SETTINGS_SECTIONS.map((section) => (
          <SettingsGroup key={section} section={section} me={data} />
        ))}
    </ScrollView>
  );
}

/** The page chrome a single-section screen shares. */
function SectionShell({
  section,
  children,
}: {
  section: SettingsSectionKey;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const styles = useStyles();
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader kicker={t("settings.title")} title={t(`settings.sections.${section}`)} />
      {AUTOSAVES.has(section) && <Text style={styles.hint}>{t("settings.autosaveHint")}</Text>}
      {children}
    </ScrollView>
  );
}

function MeSectionScreen({ section }: { section: SettingsSectionKey }) {
  const { t } = useI18n();
  const styles = useStyles();
  const { data, isPending, isError, error } = useMe();
  return (
    <SectionShell section={section}>
      {isPending && <Text style={styles.hint}>{t("common.loading")}</Text>}
      {isError && (
        <Text style={styles.error}>
          {t("common.failedToLoadSettings", { message: (error as Error).message })}
        </Text>
      )}
      {data && <SectionBody section={section} me={data} />}
    </SectionShell>
  );
}

/**
 * One section on a screen of its own, for the links that point straight at it
 * (`/settings/privacy` from the People screen, `/settings/profile` from the
 * privacy note) -- the same components the page above renders.
 */
export function SettingsSectionScreen({ section }: { section: SettingsSectionKey }) {
  // Billing is the one section that reads nothing from the account, so its
  // screen asks for nothing: no query, no loading line, no QueryClient.
  if (section === "billing") {
    return (
      <SectionShell section="billing">
        <BillingSection />
      </SectionShell>
    );
  }
  return <MeSectionScreen section={section} />;
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  group: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  groupHeading: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.mutedForeground,
  },
  section: {
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "stretch",
  },
  rowLabel: {
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  // The dropdown's closed state: the current value and a chevron, the same
  // shape as the exam screen's tag summary.
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  selectValue: {
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  selectChevron: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.mutedForeground,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    // 44pt minimum tap target, as everywhere else a list is tapped.
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
  },
  optionSelected: {
    backgroundColor: colors.muted,
  },
  optionLabel: {
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  optionCheck: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.accent,
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
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  button: {
    // Same width and height for every action in a section, text centred.
    width: 176,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: colors.foreground,
    fontWeight: fontWeights.bold,
    textAlign: "center",
    fontSize: fontSizes.sm,
  },
  dangerButton: {
    width: 176,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerButtonText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
    textAlign: "center",
    fontSize: fontSizes.sm,
  },
  saveButton: {
    marginTop: spacing.sm,
    borderRadius: 10,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    color: colors.primaryForeground,
    fontWeight: fontWeights.medium,
    fontSize: fontSizes.sm,
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
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  link: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.accent,
  },
  saved: {
    fontSize: fontSizes.sm,
    color: colors.success,
  },
  error: {
    color: colors.danger,
    fontSize: fontSizes.sm,
  },
}));
