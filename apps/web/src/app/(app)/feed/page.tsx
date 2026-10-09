"use client";

import type { FeedCategory, FeedPost } from "@lp/contracts";
import { formatPostDate } from "@lp/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { createClient } from "@/lib/supabase/client";

const FEED_IMAGES_BUCKET = "feed-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const CATEGORY_LABELS: Record<FeedCategory, string> = {
  news: "News",
  media: "Media",
};

// Only an absolute http(s) URL becomes a link. Deliberately narrow: the body
// is free text, so a looser matcher is how `javascript:` ends up in an href.
const URL_PATTERN = /(https?:\/\/[^\s<]+)/g;

/** Renders the body with bare URLs turned into links.
 *
 * There is no `link_url` column -- a URL belongs in the text the author is
 * already writing -- so this is what makes a pasted livestream or Instagram
 * link usable. Trailing punctuation is trimmed off the href so "see
 * https://example.com." doesn't link the full stop. */
function LinkifiedBody({ body }: { body: string }) {
  return (
    <p className="mt-sm whitespace-pre-wrap text-sm leading-relaxed text-foreground">
      {body.split(URL_PATTERN).map((part, index) => {
        if (!/^https?:\/\//.test(part)) return <Fragment key={index}>{part}</Fragment>;
        const trailing = part.match(/[.,;:!?)\]]+$/)?.[0] ?? "";
        const href = part.slice(0, part.length - trailing.length);
        return (
          <Fragment key={index}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {href}
            </a>
            {trailing}
          </Fragment>
        );
      })}
    </p>
  );
}

function imageUrl(imagePath: string): string {
  // Synchronous string concat against a public bucket -- no network call and
  // no expiry, unlike the signed URLs the documents bucket needs.
  return createClient().storage.from(FEED_IMAGES_BUCKET).getPublicUrl(imagePath).data.publicUrl;
}

function CategoryChip({ category }: { category: FeedCategory }) {
  return (
    <span className="rounded-full bg-muted px-sm py-0.5 text-xs font-medium text-muted-foreground">
      {CATEGORY_LABELS[category]}
    </span>
  );
}

function Byline({ post }: { post: FeedPost }) {
  return (
    <div className="flex flex-wrap items-center gap-sm text-xs text-muted-foreground">
      {post.author?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL, not worth next/image config
        <img src={post.author.avatar_url} alt="" className="size-6 rounded-full object-cover" />
      ) : null}
      {/* `author` is null once the authoring admin's profile is deleted: the
          announcement outlives them by design, so this needs a fallback
          rather than a guard that hides the post. */}
      <span className="font-medium text-foreground">{post.author?.display_name ?? "Staff"}</span>
      <span>·</span>
      <span>{formatPostDate(post.published_at)}</span>
      {post.updated_at !== post.created_at ? (
        <>
          <span>·</span>
          <span>edited</span>
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
async function uploadImage(file: File): Promise<string> {
  const { storage_path, token } = await getBrowserApiClient().requestFeedImageUploadUrl({
    mime_type: file.type as "image/jpeg" | "image/png" | "image/webp",
    size_bytes: file.size,
  });
  const { error } = await createClient()
    .storage.from(FEED_IMAGES_BUCKET)
    .uploadToSignedUrl(storage_path, token, file, { contentType: file.type });
  if (error) throw error;
  return storage_path;
}

function ImageField({
  file,
  onPick,
  onClear,
  disabled,
}: {
  file: File | null;
  onPick: (file: File | null) => void;
  onClear: () => void;
  disabled: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <label className="block text-sm font-medium text-foreground" htmlFor="feed-image">
        Picture (optional)
      </label>
      <input
        id="feed-image"
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
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
          if (!ALLOWED_IMAGE_TYPES.includes(picked.type)) {
            setError("Pick a JPEG, PNG or WebP image.");
            onPick(null);
            return;
          }
          if (picked.size > MAX_IMAGE_BYTES) {
            setError("Image must be under 5MB.");
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
      {file ? (
        <div className="mt-sm flex items-start gap-sm">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL for a pre-upload preview */}
          <img
            src={URL.createObjectURL(file)}
            alt=""
            className="max-h-40 rounded-md object-cover"
          />
          <Button variant="secondary" onClick={onClear} disabled={disabled}>
            Remove picture
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Composer() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<FeedCategory>("news");
  const [file, setFile] = useState<File | null>(null);
  const [imageKey, setImageKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      const imagePath = file ? await uploadImage(file) : null;
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
      setImageKey((key) => key + 1);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to post.");
    },
  });

  const canPost = title.trim().length > 0 && body.trim().length > 0;

  return (
    <Card className="mt-lg w-full max-w-[42rem] p-md">
      <h2 className="text-sm font-semibold text-foreground">New announcement</h2>
      <div className="mt-md flex flex-col gap-md">
        <div>
          <label className="block text-sm font-medium text-foreground" htmlFor="feed-title">
            Title
          </label>
          <input
            id="feed-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={createMutation.isPending}
            placeholder="January timetable is up"
            className="mt-xs w-full rounded-md border border-border bg-background px-md py-sm text-sm text-foreground"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground" htmlFor="feed-body">
            Body
          </label>
          <textarea
            id="feed-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={createMutation.isPending}
            rows={4}
            placeholder="Share an announcement… paste a link and it becomes clickable."
            className="mt-xs w-full rounded-md border border-border bg-background px-md py-sm text-sm text-foreground"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground" htmlFor="feed-category">
            Category
          </label>
          <select
            id="feed-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as FeedCategory)}
            disabled={createMutation.isPending}
            className="mt-xs w-full rounded-md border border-border bg-background px-md py-sm text-sm text-foreground"
          >
            <option value="news">News</option>
            <option value="media">Media — a livestream or social link</option>
          </select>
        </div>
        {/* Keyed so a successful post resets the native file input, which
            holds its own value outside React state. */}
        <ImageField
          key={imageKey}
          file={file}
          onPick={setFile}
          onClear={() => {
            setFile(null);
            setImageKey((key) => key + 1);
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
            {createMutation.isPending ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PostCard({ post }: { post: FeedPost }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: () =>
      getBrowserApiClient().updateFeedPost(post.id, { title: title.trim(), body: body.trim() }),
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
    mutationFn: () => getBrowserApiClient().deleteFeedPost(post.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to delete.");
    },
  });

  const isBusy = updateMutation.isPending || deleteMutation.isPending;

  return (
    <Card as="article" className="w-full max-w-[42rem] p-md">
      {isEditing ? (
        <div className="flex flex-col gap-sm">
          <label className="text-sm font-medium text-foreground" htmlFor={`title-${post.id}`}>
            Title
          </label>
          <input
            id={`title-${post.id}`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-md py-sm text-sm text-foreground"
          />
          <label className="text-sm font-medium text-foreground" htmlFor={`body-${post.id}`}>
            Body
          </label>
          <textarea
            id={`body-${post.id}`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            className="w-full rounded-md border border-border bg-background px-md py-sm text-sm text-foreground"
          />
          <div className="flex gap-sm">
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={isBusy || title.trim().length === 0 || body.trim().length === 0}
            >
              {updateMutation.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setTitle(post.title);
                setBody(post.body);
                setIsEditing(false);
                setError(null);
              }}
              disabled={isBusy}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-lg font-semibold leading-snug text-foreground">{post.title}</h2>
          <div className="mt-xs">
            <Byline post={post} />
          </div>
          <LinkifiedBody body={post.body} />
          {post.image_path ? (
            // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL, not worth next/image config
            <img
              src={imageUrl(post.image_path)}
              alt=""
              className="mt-md max-h-[28rem] w-full rounded-md object-cover"
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
                  Edit
                </Button>
              ) : null}
              {post.can_delete ? (
                <Button
                  variant="danger"
                  disabled={isBusy}
                  onClick={() => {
                    if (!window.confirm("Delete this announcement? This cannot be undone.")) return;
                    deleteMutation.mutate();
                  }}
                >
                  {deleteMutation.isPending ? "Deleting…" : "Delete"}
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
    </Card>
  );
}

export default function FeedPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });
  const feed = useQuery({ queryKey: ["feed"], queryFn: () => getBrowserApiClient().listFeed() });

  if (me.isPending || feed.isPending) {
    return (
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (feed.isError) {
    return (
      <main className="p-xl">
        <p role="alert" className="text-sm text-danger">
          Failed to load the feed: {(feed.error as Error).message}
        </p>
      </main>
    );
  }

  const isAdmin = me.data?.role === "admin";
  const posts = feed.data ?? [];

  return (
    <main className="p-xl">
      <h1 className="text-2xl font-semibold text-foreground">Feed</h1>

      {isAdmin ? <Composer /> : null}

      {posts.length === 0 ? (
        <p className="mt-md text-sm text-muted-foreground">No announcements yet.</p>
      ) : (
        <ul className="mt-lg flex flex-col gap-lg">
          {posts.map((post) => (
            <li key={post.id}>
              <PostCard post={post} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
