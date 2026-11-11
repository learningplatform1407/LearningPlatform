import type { UserSummary } from "@lp/contracts";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { getApiClient } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { UserRow, useRemoveFollower } from "@/lib/social";
import { fontSizes, fontWeights, spacing } from "@/lib/theme";
import { makeStyles, useThemeColors } from "@/lib/theme-context";
import { ScreenHeader, SegmentedSwitch } from "@/lib/ui/primitives";

type Tab = "search" | "following" | "followers";
const TABS: readonly Tab[] = ["search", "following", "followers"];

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}

export default function PeopleScreen() {
  const { t } = useI18n();
  const styles = useStyles();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(
    TABS.includes(params.tab as Tab) ? (params.tab as Tab) : "search",
  );
  const me = useQuery({ queryKey: ["me"], queryFn: () => getApiClient().getMe() });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader kicker={t("profile.title")} title={t("social.peopleTitle")} />

      {me.data && !me.data.settings.profile_public && (
        <Pressable accessibilityRole="link" onPress={() => router.push("/settings/privacy")}>
          <Text style={styles.hint}>
            {t("social.privateNotice")}{" "}
            <Text style={styles.link}>{t("social.privateNoticeLink")}</Text>
          </Text>
        </Pressable>
      )}

      <SegmentedSwitch
        label={t("social.peopleTitle")}
        options={TABS.map((key) => ({ value: key, label: t(`social.tabs.${key}`) }))}
        value={tab}
        onChange={setTab}
      />

      {tab === "search" && <SearchTab />}
      {tab === "following" && <FollowingTab />}
      {tab === "followers" && <FollowersTab />}
    </ScrollView>
  );
}

function SearchTab() {
  const { t } = useI18n();
  const styles = useStyles();
  const colors = useThemeColors();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim());
  const enabled = debounced.length >= MIN_QUERY_LENGTH;
  const results = useQuery({
    queryKey: ["user-search", debounced],
    queryFn: () => getApiClient().searchUsers(debounced),
    enabled,
  });

  return (
    <View style={styles.tab}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        accessibilityLabel={t("social.searchLabel")}
        placeholder={t("social.searchPlaceholder")}
        placeholderTextColor={colors.mutedForeground}
        maxLength={50}
        autoCorrect={false}
        autoCapitalize="words"
        returnKeyType="search"
        style={styles.input}
      />
      {!enabled && <Text style={styles.hint}>{t("social.searchHint")}</Text>}
      {enabled && results.isPending && <Text style={styles.hint}>{t("social.searching")}</Text>}
      {enabled && results.isError && (
        <Text style={styles.error}>
          {t("social.loadFailed", { message: (results.error as Error).message })}
        </Text>
      )}
      {enabled && results.data?.length === 0 && (
        <Text style={styles.hint}>{t("social.noResults", { query: debounced })}</Text>
      )}
      {enabled && results.data && results.data.length > 0 && <UserList users={results.data} />}
    </View>
  );
}

function FollowingTab() {
  const { t } = useI18n();
  const styles = useStyles();
  const following = useQuery({
    queryKey: ["following"],
    queryFn: () => getApiClient().listFollowing(),
  });
  if (following.isPending) return <Text style={styles.hint}>{t("common.loading")}</Text>;
  if (following.isError) {
    return (
      <Text style={styles.error}>
        {t("social.loadFailed", { message: (following.error as Error).message })}
      </Text>
    );
  }
  if (following.data.length === 0) {
    return <Text style={styles.hint}>{t("social.emptyFollowing")}</Text>;
  }
  return <UserList users={following.data} />;
}

function FollowersTab() {
  const { t } = useI18n();
  const styles = useStyles();
  const followers = useQuery({
    queryKey: ["followers"],
    queryFn: () => getApiClient().listFollowers(),
  });
  const remove = useRemoveFollower();
  if (followers.isPending) return <Text style={styles.hint}>{t("common.loading")}</Text>;
  if (followers.isError) {
    return (
      <Text style={styles.error}>
        {t("social.loadFailed", { message: (followers.error as Error).message })}
      </Text>
    );
  }
  if (followers.data.length === 0) {
    return <Text style={styles.hint}>{t("social.emptyFollowers")}</Text>;
  }
  return (
    <View style={styles.tab}>
      {remove.isError && (
        <Text style={styles.error}>
          {t("social.actionFailed", { message: (remove.error as Error).message })}
        </Text>
      )}
      <UserList users={followers.data} onRemove={(user) => remove.mutate(user.id)} />
    </View>
  );
}

function UserList({
  users,
  onRemove,
}: {
  users: UserSummary[];
  onRemove?: (user: UserSummary) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.list}>
      {users.map((user) => (
        <UserRow key={user.id} user={user} onRemove={onRemove && (() => onRemove(user))} />
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  tab: {
    gap: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSizes.base,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  list: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  hint: {
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  link: {
    fontWeight: fontWeights.bold,
    color: colors.accent,
  },
  error: {
    fontSize: fontSizes.sm,
    color: colors.danger,
  },
}));
