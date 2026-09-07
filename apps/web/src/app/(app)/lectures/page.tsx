"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
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

export default function LecturesPage() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });
  const documents = useQuery({
    queryKey: ["documents"],
    queryFn: () => getBrowserApiClient().listDocuments(),
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
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (err) => {
      setUploadError(err instanceof Error ? err.message : "Failed to upload document.");
    },
  });

  if (me.isPending || documents.isPending) {
    return (
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (documents.isError) {
    return (
      <main className="p-xl">
        <p role="alert" className="text-sm text-danger">
          Failed to load lectures: {(documents.error as Error).message}
        </p>
      </main>
    );
  }

  const isAdmin = me.data?.role === "admin";

  return (
    <main className="p-xl">
      <h1 className="text-2xl font-semibold text-foreground">Lectures</h1>

      {documents.data.length === 0 ? (
        <p className="mt-md text-sm text-muted-foreground">No lectures uploaded yet.</p>
      ) : (
        <ul className="mt-lg flex flex-col gap-xs">
          {documents.data.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/lectures/${doc.id}`}
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
          className="mt-2xl flex max-w-[24rem] flex-col gap-md border-t border-border pt-lg"
          onSubmit={(event) => {
            event.preventDefault();
            setUploadError(null);
            uploadMutation.mutate();
          }}
        >
          <h2 className="text-sm font-semibold text-foreground">Upload a lecture</h2>
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
    </main>
  );
}
