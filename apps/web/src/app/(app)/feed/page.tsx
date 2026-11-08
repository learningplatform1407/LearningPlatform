"use client";

import type { FeedCategory, FeedPost } from "@lp/contracts";
import {
  ALLOWED_FEED_IMAGE_TYPES,
  isAllowedFeedImageType,
  FEED_IMAGES_BUCKET,
  FEED_PAGE_SIZE,
  MAX_FEED_IMAGE_BYTES,
  formatPostDate,
  type Translator,
  splitLinkifiedBody,
} from "@lp/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";

/** Renders the body with bare URLs turned into links.
 *
 * There is no `link_url` column -- a URL belongs in the text the author is
 * already writing -- so this is what makes a pasted livestream or Instagram
 * link usable. What counts as a link is decided by `splitLinkifiedBody` in
 * @lp/ui, shared with mobile so the http(s)-only rule has one home. */
function LinkifiedBody({ body }: { body: string }) {
  return (
    <p className="mt-sm whitespace-pre-wrap [overflow-wrap:anywhere] text-foreground">
      {splitLinkifiedBody(body).map((segment, index) =>
        segment.href === undefined ? (
          <Fragment key={index}>{segment.text}</Fragment>
        ) : (
          <a
            key={index}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2"
          >
            {segment.text}
          </a>
        ),
      )}
    </p>
  );
}

function imageUrl(imagePath: string): string {
  // Synchronous string concat against a public bucket -- no network call and
  // no expiry, unlike the signed URLs the documents bucket needs.
  return createClient().storage.from(FEED_IMAGES_BUCKET).getPublicUrl(imagePath).data.publicUrl;
}

function CategoryChip({ category }: { category: FeedCategory }) {
  const { t } = useI18n();
  return (
    <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
      {t(`feed.categories.${category}`)}
    </span>
  );
}

function Byline({ post }: { post: FeedPost }) {
  const { t, language } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-sm text-caption font-semibold text-muted-foreground">
      {post.author?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL, not worth next/image config
        <img src={post.author.avatar_url} alt="" className="size-6 rounded-full object-cover" />
      ) : null}
      {/* `author` is null once the authoring admin's profile is deleted: the
          announcement outlives them by design, so this needs a fallback
          rather than a guard that hides the post. */}
      <span className="font-bold text-foreground">
        {post.author?.display_name ?? t("feed.staff")}
      </span>
      <span>·</span>
      <span>{formatPostDate(post.published_at, language)}</span>
      {post.updated_at !== post.created_at ? (
        <>
          <span>·</span>
          <span>{t("feed.edited")}</span>
        </>
      ) : null}
      <CategoryChip category={post.category} />
    </div>
  );
}

/** Upload-on-submit, not upload-on-pick.
 *
 * Abandoning the composer then uploads nothing at all, which removes the
 * largest source of orphaned objects in a public bucket. The preview comes
 * from a local object URL so the UX doesn't suffer for it. */
async function uploadImage(t: Translator["t"], file: File): Promise<string> {
  // Checked rather than cast: ImageField already refuses anything else, but a
  // cast here would let a future caller past the endpoint's Literal and into
  // an opaque 422.
  if (!isAllowedFeedImageType(file.type)) {
    throw new Error(t("feed.pickImageType"));
  }
  const { storage_path, token } = await getBrowserApiClient().requestFeedImageUploadUrl({
    mime_type: file.type,
    size_bytes: file.size,
  });
  const { error } = await createClient()
    .storage.from(FEED_IMAGES_BUCKET)
    .uploadToSignedUrl(storage_path, token, file, { contentType: file.type });
  if (error) throw error;
  return storage_path;
}

/** A local preview URL for `file`, released when it changes or unmounts.
 *
 * createObjectURL in the render body would mint a fresh URL on every keystroke
 * in the composer -- each one pinning the whole selected file until the page
 * goes away, and re-fetching the <img> src each time. */
function usePreviewUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (url === null) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

function ImageField({
  file,
  onPick,
  disabled,
  label,
  inputId = "feed-image",
}: {
  file: File | null;
  onPick: (file: File | null) => void;
  disabled: boolean;
  /** The composer and each post's edit form both render one of these, so the
   * label and the input id have to differ -- duplicate ids would make
   * getByLabelText ambiguous and break the label/input association. */
  label?: string;
  inputId?: string;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = usePreviewUrl(file);

  /** A file input holds its own value, so clearing React state is not enough
   * to let the same file be re-picked. profile/page.tsx resets it the same
   * way. */
  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    setError(null);
    onPick(null);
  }

  return (
    <div>
      <label className="block text-toc font-semibold text-foreground" htmlFor={inputId}>
        {label ?? t("feed.picture")}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ALLOWED_FEED_IMAGE_TYPES.join(",")}
        disabled={disabled}
        className="mt-xs block w-full text-sm text-muted-foreground"
        onChange={(event) => {
          const picked = event.target.files?.[0] ?? null;
          setError(null);
          if (!picked) {
            onPick(null);
            return;
          }
          // Mirrors the server's checks so the admin hears about it before
          // waiting on an upload. The bucket enforces both for real.
          if (!isAllowedFeedImageType(picked.type)) {
            setError(t("feed.pickImageType"));
            onPick(null);
            return;
          }
          if (picked.size > MAX_FEED_IMAGE_BYTES) {
            setError(t("feed.imageTooLarge"));
            onPick(null);
            return;
          }
          onPick(picked);
        }}
      />
      {error ? (
        <p role="alert" className="mt-xs text-sm text-danger">
          {error}
        </p>
      ) : null}
      {previewUrl ? (
        <div className="mt-sm flex items-start gap-sm">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL for a pre-upload preview */}
          <img src={previewUrl} alt="" className="max-h-40 rounded-md object-cover" />
          <Button variant="secondary" onClick={clear} disabled={disabled}>
            {t("feed.removePicture")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Composer() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<FeedCategory>("news");
  const [file, setFile] = useState<File | null>(null);
  // The key of an upload that already landed. If createFeedPost then fails
  // (a 422, a 500, a dropped connection), pressing Post again must reuse it
  // rather than minting a second object -- a public bucket with no sweeper
  // would otherwise collect one orphan per retry. Cleared whenever the picked
  // file changes, since the remembered key then describes the wrong bytes.
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  // Bumped only on a successful post, to hand the whole composer a fresh
  // ImageField. Remounting also drops its local validation error, which is
  // what we want here: the form is empty again. Clearing the picture without
  // posting does not need this -- ImageField resets its own input.
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      let imagePath = uploadedPath;
      if (file && imagePath === null) {
        imagePath = await uploadImage(t, file);
        setUploadedPath(imagePath);
      }
      return getBrowserApiClient().createFeedPost({
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
      setFile(null);
      setUploadedPath(null);
      setResetKey((key) => key + 1);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : t("feed.postFailed"));
    },
  });

  const canPost = title.trim().length > 0 && body.trim().length > 0;

  return (
    <Card className="mt-lg w-full p-md shadow-dot">
      <h2 className="label-caps">{t("feed.newAnnouncement")}</h2>
      <div className="mt-md flex flex-col gap-md">
        <div>
          <label className="block text-toc font-semibold text-foreground" htmlFor="feed-title">
            {t("feed.postTitle")}
          </label>
          <input
            id="feed-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={createMutation.isPending}
            placeholder={t("feed.titlePlaceholder")}
            className="field mt-xs"
          />
        </div>
        <div>
          <label className="block text-toc font-semibold text-foreground" htmlFor="feed-body">
            {t("feed.body")}
          </label>
          <textarea
            id="feed-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={createMutation.isPending}
            rows={4}
            placeholder={t("feed.bodyPlaceholderWeb")}
            className="field mt-xs"
          />
        </div>
        <div>
          <label className="block text-toc font-semibold text-foreground" htmlFor="feed-category">
            {t("feed.category")}
          </label>
          <select
            id="feed-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as FeedCategory)}
            disabled={createMutation.isPending}
            className="field mt-xs"
          >
            <option value="news">{t("feed.categories.news")}</option>
            <option value="media">{t("feed.mediaOption")}</option>
          </select>
        </div>
        <ImageField
          key={resetKey}
          file={file}
          onPick={(picked) => {
            setFile(picked);
            setUploadedPath(null);
          }}
          disabled={createMutation.isPending}
        />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!canPost || createMutation.isPending}
          >
            {createMutation.isPending ? t("feed.posting") : t("feed.post")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PostCard({ post }: { post: FeedPost }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form from refetched data, the same identity-checked
  // setState-during-render pattern profile/page.tsx uses. Without this the
  // card keeps whatever the post said when it first mounted -- and since
  // every admin can edit every post, opening Edit after someone else's
  // correction landed would show the pre-correction text and Save would
  // quietly overwrite them.
  //
  // Skipped while editing, so a background refetch cannot yank text out from
  // under someone mid-sentence. That leaves the narrower race -- two admins
  // with the form open at once -- where the second Save still wins; fixing
  // that properly needs optimistic concurrency (send updated_at, 409 on
  // mismatch) and is noted in FEED-9 rather than bolted on here.
  const [syncedFrom, setSyncedFrom] = useState<FeedPost>(post);
  if (post !== syncedFrom && !isEditing) {
    setTitle(post.title);
    setBody(post.body);
    setSyncedFrom(post);
  }

  // Picture edits, kept out of the text state above because this is the one
  // field where "left alone" and "cleared" are different requests.
  // `replacement` holds a newly picked file; `removeImage` records an explicit
  // clear. Both default to leaving the existing picture exactly as it is.
  const [replacement, setReplacement] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);

  function resetImageEdits() {
    setReplacement(null);
    setRemoveImage(false);
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      // Three cases, which the server tells apart by whether the key is
      // present at all: a new file uploads and sends its path, an explicit
      // removal sends null, and anything else omits the field.
      let imagePatch: { image_path?: string | null } = {};
      if (replacement) imagePatch = { image_path: await uploadImage(t, replacement) };
      else if (removeImage) imagePatch = { image_path: null };

      return getBrowserApiClient().updateFeedPost(post.id, {
        title: title.trim(),
        body: body.trim(),
        ...imagePatch,
      });
    },
    onSuccess: () => {
      setIsEditing(false);
      resetImageEdits();
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : t("feed.saveFailed"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => getBrowserApiClient().deleteFeedPost(post.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : t("feed.deleteFailed"));
    },
  });

  const isBusy = updateMutation.isPending || deleteMutation.isPending;

  return (
    <article className="w-full border-t border-border pt-md">
      {isEditing ? (
        <div className="flex flex-col gap-sm">
          <label className="text-toc font-semibold text-foreground" htmlFor={`title-${post.id}`}>
            {t("feed.postTitle")}
          </label>
          <input
            id={`title-${post.id}`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="field"
          />
          <label className="text-toc font-semibold text-foreground" htmlFor={`body-${post.id}`}>
            {t("feed.body")}
          </label>
          <textarea
            id={`body-${post.id}`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            className="field"
          />
          {/* Without these the server's replace and clear branches had no
              caller at all: an announcement published with the wrong photo
              could only be fixed by deleting it and retyping. */}
          {post.image_path && !removeImage && !replacement ? (
            <div className="flex items-center gap-sm">
              <span className="text-sm text-muted-foreground">{t("feed.currentPicture")}</span>
              <Button variant="secondary" onClick={() => setRemoveImage(true)} disabled={isBusy}>
                {t("feed.removePicture")}
              </Button>
            </div>
          ) : null}
          {removeImage ? (
            <div className="flex items-center gap-sm">
              <span className="text-sm text-muted-foreground">
                {t("feed.pictureWillBeRemoved")}
              </span>
              <Button variant="secondary" onClick={resetImageEdits} disabled={isBusy}>
                {t("feed.keepIt")}
              </Button>
            </div>
          ) : null}
          <ImageField
            file={replacement}
            onPick={(picked) => {
              setReplacement(picked);
              // Picking a new file supersedes a pending removal.
              if (picked) setRemoveImage(false);
            }}
            disabled={isBusy}
            label={post.image_path ? t("feed.replacePicture") : t("feed.addPicture")}
            inputId={`image-${post.id}`}
          />
          <div className="flex gap-sm">
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={isBusy || title.trim().length === 0 || body.trim().length === 0}
            >
              {updateMutation.isPending ? t("feed.saving") : t("common.save")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setTitle(post.title);
                setBody(post.body);
                resetImageEdits();
                setIsEditing(false);
                setError(null);
              }}
              disabled={isBusy}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-heading leading-tight font-extrabold text-foreground">
            {post.title}
          </h2>
          <div className="mt-xs">
            <Byline post={post} />
          </div>
          <LinkifiedBody body={post.body} />
          {post.image_path ? (
            // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL, not worth next/image config
            <img
              src={imageUrl(post.image_path)}
              alt=""
              className="mt-md aspect-[4/3] w-full rounded-md object-cover"
            />
          ) : null}
          {/* Gated on the server-computed flags, never on the caller's own
              role: re-deriving a permission client-side is the bug ad08d02
              fixed on flashcards. Here they are role-based, so every admin
              sees these on every post including other people's. */}
          {post.can_edit || post.can_delete ? (
            <div className="mt-md flex gap-sm">
              {post.can_edit ? (
                <Button variant="secondary" onClick={() => setIsEditing(true)} disabled={isBusy}>
                  {t("feed.edit")}
                </Button>
              ) : null}
              {post.can_delete ? (
                <Button
                  variant="danger"
                  disabled={isBusy}
                  onClick={() => {
                    if (!window.confirm(t("feed.confirmDelete"))) return;
                    deleteMutation.mutate();
                  }}
                >
                  {deleteMutation.isPending ? t("feed.deleting") : t("common.delete")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
      {error ? (
        <p role="alert" className="mt-sm text-sm text-danger">
          {error}
        </p>
      ) : null}
    </article>
  );
}

export default function FeedPage() {
  const { t } = useI18n();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });
  const feed = useQuery({
    queryKey: ["feed"],
    queryFn: () => getBrowserApiClient().listFeed({ limit: FEED_PAGE_SIZE }),
  });

  if (me.isPending || feed.isPending) {
    return (
      <PageMain width="reading">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </PageMain>
    );
  }

  if (feed.isError) {
    return (
      <PageMain width="reading">
        <p role="alert" className="text-sm text-danger">
          {t("feed.loadFailed", { message: (feed.error as Error).message })}
        </p>
      </PageMain>
    );
  }

  // Handled explicitly rather than falling through to `me.data?.role`, which
  // would be undefined and silently render an admin the read-only view -- no
  // composer, no Edit, no Delete and no hint that anything failed, which reads
  // exactly like losing your permissions.
  if (me.isError) {
    return (
      <PageMain width="reading">
        <p role="alert" className="text-sm text-danger">
          {t("feed.profileFailed", { message: (me.error as Error).message })}
        </p>
      </PageMain>
    );
  }

  const isAdmin = me.data?.role === "admin";
  const posts = feed.data ?? [];

  return (
    <PageMain width="reading">
      <PageHeader kicker={t("feed.kicker")} title={t("feed.title")} />

      {isAdmin ? <Composer /> : null}

      {posts.length === 0 ? (
        <p className="mt-md text-sm text-muted-foreground">{t("feed.empty")}</p>
      ) : (
        <>
          <ul className="mt-lg flex flex-col gap-xl">
            {posts.map((post) => (
              <li key={post.id}>
                <PostCard post={post} />
              </li>
            ))}
          </ul>
          {/* There is no "Load more" yet (FEED-9), so a full page means older
              announcements exist that this screen cannot reach. Saying so
              beats a list that simply ends and reads as the whole history. */}
          {posts.length >= FEED_PAGE_SIZE ? (
            <p className="mt-lg text-sm text-muted-foreground">
              {t("feed.showingRecent", { count: FEED_PAGE_SIZE })}
            </p>
          ) : null}
        </>
      )}
    </PageMain>
  );
}
