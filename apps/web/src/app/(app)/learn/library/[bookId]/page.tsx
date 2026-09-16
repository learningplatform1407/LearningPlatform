"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { getBrowserApiClient } from "@/lib/api-client.browser";
import { sha256Hex } from "@/lib/checksum";
import { createClient } from "@/lib/supabase/client";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const STATUS_LABEL: Record<string, string> = {
  processing: "Processing...",
  ready: "Ready",
  failed: "Failed",
};

function UncategorizedLessonsPage() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });
  const uncategorized = useQuery({
    queryKey: ["documents", "uncategorized"],
    queryFn: () => getBrowserApiClient().listDocuments("none"),
  });

  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a PDF file first.");
      if (file.type !== "application/pdf") throw new Error("Only PDF files are supported.");
      if (file.size > MAX_UPLOAD_BYTES) throw new Error("File must be under 50MB.");

      const client = getBrowserApiClient();
      const { storage_path, token } = await client.requestDocumentUploadUrl({
        filename: file.name,
        mime_type: "application/pdf",
        size_bytes: file.size,
      });

      const supabase = createClient();
      const { error: uploadStorageError } = await supabase.storage
        .from("documents")
        .uploadToSignedUrl(storage_path, token, file, { contentType: "application/pdf" });
      if (uploadStorageError) throw uploadStorageError;

      const checksum = await sha256Hex(file);
      return client.createDocument({
        title,
        storage_path,
        mime_type: "application/pdf",
        size_bytes: file.size,
        checksum,
      });
    },
    onSuccess: () => {
      setTitle("");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["documents", "uncategorized"] });
    },
    onError: (err) => {
      setUploadError(err instanceof Error ? err.message : "Failed to upload document.");
    },
  });

  if (me.isPending || uncategorized.isPending) {
    return (
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  const isAdmin = me.data?.role === "admin";

  return (
    <main className="p-xl">
      <Link href="/learn/library" className="text-sm text-muted-foreground hover:underline">
        ← Library
      </Link>
      <h1 className="mt-xs text-2xl font-semibold text-foreground">Uncategorized</h1>
      <div className="mt-lg">
        {uncategorized.data && uncategorized.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lessons yet.</p>
        ) : (
          <ul className="flex flex-col gap-xs">
            {uncategorized.data?.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={`/learn/${doc.id}`}
                  className="flex items-center justify-between rounded-md border border-border px-md py-sm hover:bg-muted"
                >
                  <span className="text-sm font-medium text-foreground">{doc.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {doc.status ? (STATUS_LABEL[doc.status] ?? doc.status) : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {isAdmin && (
          <form
            className="mt-lg flex max-w-[24rem] flex-col gap-md border-t border-border pt-lg"
            onSubmit={(event) => {
              event.preventDefault();
              setUploadError(null);
              uploadMutation.mutate();
            }}
          >
            <h3 className="text-sm font-semibold text-foreground">Upload a lesson</h3>
            <label className="flex flex-col gap-xs text-sm text-foreground">
              Title
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-xs text-sm text-foreground">
              PDF file
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                required
              />
            </label>
            {uploadError && (
              <p role="alert" className="text-sm text-danger">
                {uploadError}
              </p>
            )}
            <button
              type="submit"
              disabled={uploadMutation.isPending}
              className="self-start rounded-md bg-primary px-md py-sm text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

function BookChaptersPage({ bookId }: { bookId: string }) {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });
  const chapters = useQuery({
    queryKey: ["chapters", bookId],
    queryFn: () => getBrowserApiClient().listChapters(bookId),
  });

  const [title, setTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const createChapterMutation = useMutation({
    mutationFn: () => getBrowserApiClient().createChapter(bookId, { title }),
    onSuccess: () => {
      setTitle("");
      queryClient.invalidateQueries({ queryKey: ["chapters", bookId] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : "Failed to create chapter.");
    },
  });

  if (me.isPending || chapters.isPending) {
    return (
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (chapters.isError) {
    return (
      <main className="p-xl">
        <p role="alert" className="text-sm text-danger">
          Failed to load chapters: {(chapters.error as Error).message}
        </p>
      </main>
    );
  }

  const isAdmin = me.data?.role === "admin";

  return (
    <main className="p-xl">
      <Link href="/learn/library" className="text-sm text-muted-foreground hover:underline">
        ← Library
      </Link>
      <h1 className="mt-xs text-2xl font-semibold text-foreground">Chapters</h1>

      {chapters.data.length === 0 ? (
        <p className="mt-md text-sm text-muted-foreground">No chapters yet.</p>
      ) : (
        <ul className="mt-lg flex flex-col gap-xs">
          {chapters.data.map((chapter) => (
            <li key={chapter.id}>
              <Link
                href={`/learn/library/${bookId}/${chapter.id}`}
                className="flex items-center justify-between rounded-md border border-border px-md py-sm hover:bg-muted"
              >
                <span className="text-sm font-medium text-foreground">{chapter.title}</span>
                <span className="text-xs text-muted-foreground">
                  {chapter.sub_chapter_count}{" "}
                  {chapter.sub_chapter_count === 1 ? "sub-chapter" : "sub-chapters"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <form
          className="mt-2xl flex max-w-[24rem] flex-col gap-md border-t border-border pt-lg"
          onSubmit={(event) => {
            event.preventDefault();
            setCreateError(null);
            createChapterMutation.mutate();
          }}
        >
          <h2 className="text-sm font-semibold text-foreground">New chapter</h2>
          <label className="flex flex-col gap-xs text-sm text-foreground">
            Title
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              className="rounded-md border border-border px-sm py-xs text-base focus:border-primary focus:outline-none"
            />
          </label>
          {createError && (
            <p role="alert" className="text-sm text-danger">
              {createError}
            </p>
          )}
          <button
            type="submit"
            disabled={createChapterMutation.isPending}
            className="self-start rounded-md bg-primary px-md py-sm text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createChapterMutation.isPending ? "Creating..." : "Create chapter"}
          </button>
        </form>
      )}
    </main>
  );
}

export default function BookPage() {
  const params = useParams<{ bookId: string }>();
  if (params.bookId === "uncategorized") {
    return <UncategorizedLessonsPage />;
  }
  return <BookChaptersPage bookId={params.bookId} />;
}
