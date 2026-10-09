import type { FeedCategory, FeedPost } from "@lp/contracts";
import {
  FEED_CATEGORY_LABELS,
  FEED_IMAGES_BUCKET,
  MAX_FEED_IMAGE_BYTES,
  formatPostDate,
  isAllowedFeedImageType,
  splitLinkifiedBody,
} from "@lp/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import { Fragment, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getApiClient } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";
import { colors, fontSizes, fontWeights, lineHeight, radii, spacing } from "@/lib/theme";

function imageUrl(imagePath: string): string {
  // A synchronous string concat against a public bucket -- no network call
  // and no expiry, unlike the signed URLs the documents bucket needs.
  return supabase.storage.from(FEED_IMAGES_BUCKET).getPublicUrl(imagePath).data.publicUrl;
}

/** The body with bare URLs made tappable.
 *
 * There is no `link_url` column -- a URL belongs in the text the author is
 * already writing -- so this is what makes a pasted livestream or Instagram
 * link usable. What counts as a link is decided by `splitLinkifiedBody` in
 * @lp/ui, shared with web so the http(s)-only rule has one home. Opened in
 * the in-app browser rather than handed to Linking.openURL, so an unexpected
 * target cannot hand off to another app. */
function LinkifiedBody({ body }: { body: string }) {
  return (
    <Text style={styles.body}>
      {splitLinkifiedBody(body).map((segment, index) =>
        segment.href === undefined ? (
          <Fragment key={index}>{segment.text}</Fragment>
        ) : (
          <Text
            key={index}
            style={styles.link}
            accessibilityRole="link"
            onPress={() => {
              void WebBrowser.openBrowserAsync(segment.href!);
            }}
          >
            {segment.text}
          </Text>
        ),
      )}
    </Text>
  );
}

/** Upload-on-submit, not upload-on-pick: abandoning the composer uploads
 * nothing, which removes the largest source of orphaned objects. */
async function uploadImage(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  // Checked, not cast. iOS commonly hands back image/heic, and a cast would
  // hide that from the type checker only for FastAPI's Literal to reject it --
  // surfacing as "API request failed with status 422" after the user has
  // already waited on the fetch below. The bucket's allowed_mime_types would
  // refuse it too.
  if (!isAllowedFeedImageType(asset.mimeType)) {
    throw new Error("Pick a JPEG, PNG or WebP image.");
  }
  const mimeType = asset.mimeType;

  // The picker hands back a uri, never bytes -- same step every upload in
  // this app takes (see profile.tsx).
  const blob = await (await fetch(asset.uri)).blob();

  // blob.size, not asset.fileSize: the latter describes the original file
  // while `quality: 0.8` means we upload a re-encode, so the two disagree --
  // and on Android fileSize is frequently undefined, which also made the
  // pick-time guard a no-op. Measuring the bytes we are about to send is what
  // makes this error match the bucket's hard file_size_limit.
  if (blob.size > MAX_FEED_IMAGE_BYTES) {
    throw new Error("Image must be under 5MB.");
  }

  const { storage_path, token } = await getApiClient().requestFeedImageUploadUrl({
    mime_type: mimeType,
    size_bytes: blob.size,
  });
  const { error } = await supabase.storage
    .from(FEED_IMAGES_BUCKET)
    .uploadToSignedUrl(storage_path, token, blob, { contentType: mimeType });
  if (error) throw error;
  return storage_path;
}

function Composer() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<FeedCategory>("news");
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      const imagePath = asset ? await uploadImage(asset) : null;
      return getApiClient().createFeedPost({
        title: title.trim(),
        body: body.trim(),
        category,
        image_path: imagePath,
      });
    },
    onSuccess: () => {
      setTitle("");
      setBody("");
      setCategory("news");
      setAsset(null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to post.");
    },
  });

  async function handlePickImage() {
    setError(null);
    // Required before the library opens, or the picker silently returns
    // nothing on a device that has not been asked yet.
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      setError("Photo library permission is required to attach a picture.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled) return;

    const picked = result.assets[0];
    if (!picked) return;
    // Optimistic only: fileSize is often undefined on Android, and describes
    // the pre-re-encode file when present. uploadImage re-checks blob.size,
    // which is the number that actually matters -- this just saves the user a
    // round trip when the picker does tell us.
    if (picked.fileSize && picked.fileSize > MAX_FEED_IMAGE_BYTES) {
      setError("Image must be under 5MB.");
      return;
    }
    if (!isAllowedFeedImageType(picked.mimeType)) {
      setError("Pick a JPEG, PNG or WebP image.");
      return;
    }
    setAsset(picked);
  }

  const canPost = title.trim().length > 0 && body.trim().length > 0;
  const isPending = createMutation.isPending;

  return (
    <View style={styles.composer}>
      <Text style={styles.composerTitle}>New announcement</Text>

      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        editable={!isPending}
        placeholder="January timetable is up"
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel="Title"
      />

      <Text style={styles.label}>Body</Text>
      <TextInput
        style={[styles.input, styles.bodyInput]}
        value={body}
        onChangeText={setBody}
        editable={!isPending}
        multiline
        placeholder="Share an announcement… paste a link and it becomes tappable."
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel="Body"
      />

      <Text style={styles.label}>Category</Text>
      <View style={styles.segmented}>
        {(["news", "media"] as const).map((value) => {
          const selected = category === value;
          return (
            <Pressable
              key={value}
              onPress={() => setCategory(value)}
              disabled={isPending}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.segment, selected && styles.segmentSelected]}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                {FEED_CATEGORY_LABELS[value]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => void handlePickImage()}
        disabled={isPending}
        accessibilityRole="button"
        style={styles.secondaryButton}
      >
        <Text style={styles.secondaryButtonText}>{asset ? "Change picture" : "Add a picture"}</Text>
      </Pressable>

      {asset ? (
        <View style={styles.previewRow}>
          <Image source={{ uri: asset.uri }} style={styles.preview} contentFit="cover" />
          <Pressable
            onPress={() => setAsset(null)}
            disabled={isPending}
            accessibilityRole="button"
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Remove picture</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <Pressable
        onPress={() => createMutation.mutate()}
        disabled={!canPost || isPending}
        accessibilityRole="button"
        style={[styles.primaryButton, (!canPost || isPending) && styles.buttonDisabled]}
      >
        {isPending ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.primaryButtonText}>Post</Text>
        )}
      </Pressable>
    </View>
  );
}

function PostCard({ post }: { post: FeedPost }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form from refetched data (same pattern as profile.tsx and the
  // web card). Without this the card keeps whatever the post said when it
  // mounted, so opening Edit after another admin's correction landed would
  // offer the pre-correction text and Save would quietly overwrite them.
  // Skipped while editing, so a refetch cannot yank text out mid-sentence.
  const [syncedFrom, setSyncedFrom] = useState<FeedPost>(post);
  if (post !== syncedFrom && !isEditing) {
    setTitle(post.title);
    setBody(post.body);
    setSyncedFrom(post);
  }

  const updateMutation = useMutation({
    mutationFn: () =>
      getApiClient().updateFeedPost(post.id, { title: title.trim(), body: body.trim() }),
    onSuccess: () => {
      setIsEditing(false);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to save.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => getApiClient().deleteFeedPost(post.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to delete.");
    },
  });

  const isBusy = updateMutation.isPending || deleteMutation.isPending;

  function confirmDelete() {
    Alert.alert("Delete this announcement?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  }

  if (isEditing) {
    return (
      <View style={styles.card}>
        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          editable={!isBusy}
          accessibilityLabel="Edit title"
        />
        <Text style={styles.label}>Body</Text>
        <TextInput
          style={[styles.input, styles.bodyInput]}
          value={body}
          onChangeText={setBody}
          editable={!isBusy}
          multiline
          accessibilityLabel="Edit body"
        />
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            onPress={() => updateMutation.mutate()}
            disabled={isBusy || title.trim().length === 0 || body.trim().length === 0}
            accessibilityRole="button"
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              {updateMutation.isPending ? "Saving…" : "Save"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setTitle(post.title);
              setBody(post.body);
              setIsEditing(false);
              setError(null);
            }}
            disabled={isBusy}
            accessibilityRole="button"
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.postTitle}>{post.title}</Text>
      <View style={styles.byline}>
        {/* `author` is null once the authoring admin's profile is deleted --
            the announcement outlives them by design, so this falls back
            rather than hiding the post. */}
        <Text style={styles.authorName}>{post.author?.display_name ?? "Staff"}</Text>
        <Text style={styles.bylineMeta}>· {formatPostDate(post.published_at)}</Text>
        {post.updated_at !== post.created_at ? (
          <Text style={styles.bylineMeta}>· edited</Text>
        ) : null}
        <View style={styles.chip}>
          <Text style={styles.chipText}>{FEED_CATEGORY_LABELS[post.category]}</Text>
        </View>
      </View>

      <LinkifiedBody body={post.body} />

      {post.image_path ? (
        // expo-image rather than RN's Image: a scrolling list of remote
        // photos is the case RN's has no disk cache for, so every mount
        // would re-download on a student's data plan.
        <Image
          source={{ uri: imageUrl(post.image_path) }}
          style={styles.postImage}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      {/* Gated on the server's flags, never on the caller's own role:
          re-deriving a permission client-side is the bug ad08d02 fixed on
          flashcards. Here they are role-based, so every admin sees these on
          every post including other people's. */}
      {post.can_edit || post.can_delete ? (
        <View style={styles.actions}>
          {post.can_edit ? (
            <Pressable
              onPress={() => setIsEditing(true)}
              disabled={isBusy}
              accessibilityRole="button"
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Edit</Text>
            </Pressable>
          ) : null}
          {post.can_delete ? (
            <Pressable
              onPress={confirmDelete}
              disabled={isBusy}
              accessibilityRole="button"
              style={styles.secondaryButton}
            >
              <Text style={styles.dangerButtonText}>
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function FeedScreen() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => getApiClient().getMe() });
  const feed = useQuery({ queryKey: ["feed"], queryFn: () => getApiClient().listFeed() });

  if (me.isPending || feed.isPending) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  if (feed.isError) {
    return (
      <View style={styles.centered}>
        <Text accessibilityRole="alert" style={styles.error}>
          Failed to load the feed: {(feed.error as Error).message}
        </Text>
      </View>
    );
  }

  // Handled explicitly rather than falling through to `me.data?.role`, which
  // would be undefined and silently render an admin the read-only view -- no
  // composer, no actions and no explanation.
  if (me.isError) {
    return (
      <View style={styles.centered}>
        <Text accessibilityRole="alert" style={styles.error}>
          Failed to load your profile: {(me.error as Error).message}
        </Text>
      </View>
    );
  }

  const isAdmin = me.data?.role === "admin";

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={feed.data ?? []}
      keyExtractor={(post) => post.id}
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>Feed</Text>
          {isAdmin ? <Composer /> : null}
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>No announcements yet.</Text>}
      renderItem={({ item }) => <PostCard post={item} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.xl, gap: spacing.lg },
  centered: { flex: 1, justifyContent: "center", padding: spacing.xl },
  title: {
    fontSize: fontSizes["2xl"],
    lineHeight: lineHeight(fontSizes["2xl"]),
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  loading: { fontSize: fontSizes.sm, color: colors.mutedForeground },
  empty: { fontSize: fontSizes.sm, color: colors.mutedForeground },
  error: { fontSize: fontSizes.sm, color: colors.danger },
  composer: {
    marginTop: spacing.lg,
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  composerTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  label: {
    marginTop: spacing.xs,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSizes.sm,
    color: colors.foreground,
    backgroundColor: colors.background,
  },
  bodyInput: { minHeight: 96, textAlignVertical: "top" },
  segmented: { flexDirection: "row", gap: spacing.sm },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  segmentSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { fontSize: fontSizes.sm, color: colors.foreground },
  segmentTextSelected: { color: colors.primaryForeground, fontWeight: fontWeights.medium },
  primaryButton: {
    marginTop: spacing.sm,
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.primaryForeground,
  },
  secondaryButton: {
    marginTop: spacing.sm,
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  secondaryButtonText: { fontSize: fontSizes.sm, color: colors.foreground },
  dangerButtonText: { fontSize: fontSizes.sm, color: colors.danger },
  buttonDisabled: { opacity: 0.5 },
  previewRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  preview: { width: 96, height: 96, borderRadius: radii.md },
  card: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.background,
  },
  postTitle: {
    fontSize: fontSizes.lg,
    lineHeight: lineHeight(fontSizes.lg, "tight"),
    fontWeight: fontWeights.semibold,
    color: colors.foreground,
  },
  byline: {
    marginTop: spacing.xs,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
  },
  authorName: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.foreground,
  },
  bylineMeta: { fontSize: fontSizes.xs, color: colors.mutedForeground },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
    backgroundColor: colors.muted,
  },
  chipText: { fontSize: fontSizes.xs, color: colors.mutedForeground },
  body: {
    marginTop: spacing.sm,
    fontSize: fontSizes.sm,
    lineHeight: lineHeight(fontSizes.sm, "relaxed"),
    color: colors.foreground,
  },
  link: { color: colors.primary, textDecorationLine: "underline" },
  postImage: {
    marginTop: spacing.md,
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: radii.md,
  },
  actions: { flexDirection: "row", gap: spacing.sm },
});
