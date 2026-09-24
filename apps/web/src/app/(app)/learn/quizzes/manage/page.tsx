"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiClientError } from "@lp/api-client";
import type { QuestionImportRequest, QuestionImportResult } from "@lp/contracts";
import { questionImportRequestSchema } from "@lp/validation";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/button";
import { getBrowserApiClient } from "@/lib/api-client.browser";

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function ImportResultSummary({
  result,
  dryRun,
}: {
  result: QuestionImportResult;
  dryRun: boolean;
}) {
  return (
    <div className="mt-md rounded-md border border-border p-md">
      <p className="text-sm font-medium text-foreground">
        {dryRun ? "Dry run — nothing written yet" : "Import committed"}
      </p>
      <dl className="mt-sm grid grid-cols-3 gap-sm text-sm">
        <div>
          <dt className="text-muted-foreground">Created</dt>
          <dd className="font-medium text-foreground">{result.created}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Updated</dt>
          <dd className="font-medium text-foreground">{result.updated}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Skipped</dt>
          <dd className="font-medium text-foreground">{result.skipped}</dd>
        </div>
      </dl>
      {result.errors.length > 0 && (
        <ul className="mt-md flex flex-col gap-xs">
          {result.errors.map((error, i) => (
            <li key={i} role="alert" className="text-sm text-danger">
              #{error.index} · {error.field}: {error.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ImportForm() {
  const [jsonText, setJsonText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewedText, setPreviewedText] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  type ImportVariables = { text: string; payload: QuestionImportRequest };

  const previewMutation = useMutation({
    mutationFn: ({ payload }: ImportVariables) =>
      getBrowserApiClient().importQuestions(payload, true),
    // Reads the text back from `variables` (fixed at the moment `.mutate()`
    // was called) rather than closing over the live `jsonText` state — the
    // admin may have kept typing while this request was in flight, and a
    // closure over `jsonText` would then mark THAT newer, never-validated
    // text as "previewed".
    onSuccess: (_data, variables) => setPreviewedText(variables.text),
    onError: (err) => setRequestError(describeError(err)),
  });

  const commitMutation = useMutation({
    mutationFn: ({ payload }: ImportVariables) =>
      getBrowserApiClient().importQuestions(payload, false),
    onError: (err) => setRequestError(describeError(err)),
  });

  function describeError(err: unknown): string {
    if (err instanceof ApiClientError) {
      const body = err.body as { message?: string } | null;
      return body?.message ?? `Request failed with status ${err.status}`;
    }
    return err instanceof Error ? err.message : "Something went wrong.";
  }

  function parsePayload(): QuestionImportRequest | null {
    setParseError(null);
    setRequestError(null);

    let raw: unknown;
    try {
      raw = JSON.parse(jsonText);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
      return null;
    }

    const result = questionImportRequestSchema.safeParse(raw);
    if (!result.success) {
      setParseError(
        result.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; "),
      );
      return null;
    }
    return result.data;
  }

  function handlePreview() {
    const payload = parsePayload();
    if (payload === null) return;
    previewMutation.mutate({ text: jsonText, payload });
  }

  function handleCommit() {
    const payload = parsePayload();
    if (payload === null) return;
    commitMutation.mutate({ text: jsonText, payload });
  }

  function handleTextChange(text: string) {
    setJsonText(text);
    setPreviewedText(null);
    // Clear stale feedback: an error from the previous payload sitting
    // under freshly-edited text reads as if the new text were rejected.
    setParseError(null);
    setRequestError(null);
    // Otherwise a second batch pasted after a successful commit finds
    // commitMutation.isSuccess still true from the FIRST batch, which
    // permanently disables Import (canCommit checks !isSuccess) and hides
    // any new preview behind the stale "Import committed" summary.
    commitMutation.reset();
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    try {
      handleTextChange(await readFileAsText(file));
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not read that file.");
    }
  }

  const canCommit =
    previewedText !== null && previewedText === jsonText && !commitMutation.isSuccess;

  return (
    <div className="mt-lg flex max-w-2xl flex-col gap-md">
      <label className="flex flex-col gap-xs text-sm text-foreground">
        Upload a JSON file
        <input type="file" accept="application/json" onChange={handleFileChange} />
      </label>

      <label className="flex flex-col gap-xs text-sm text-foreground">
        Import payload (JSON)
        <textarea
          value={jsonText}
          onChange={(event) => handleTextChange(event.target.value)}
          rows={16}
          placeholder={'{"allow_new_tags": false, "questions": [...]}'}
          className="rounded-md border border-border px-sm py-xs font-mono text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </label>

      {parseError && (
        <p role="alert" className="text-sm text-danger">
          Invalid JSON: {parseError}
        </p>
      )}
      {requestError && (
        <p role="alert" className="text-sm text-danger">
          {requestError}
        </p>
      )}

      <div className="flex gap-sm">
        <Button
          type="button"
          variant="secondary"
          onClick={handlePreview}
          disabled={jsonText.trim() === "" || previewMutation.isPending}
        >
          {previewMutation.isPending ? "Checking..." : "Preview (dry run)"}
        </Button>
        <Button
          type="button"
          onClick={handleCommit}
          disabled={!canCommit || commitMutation.isPending}
        >
          {commitMutation.isPending ? "Importing..." : "Import"}
        </Button>
      </div>
      {!canCommit && !commitMutation.isSuccess && (
        <p className="text-xs text-muted-foreground">
          Run a dry-run preview on the current payload before importing.
        </p>
      )}

      {commitMutation.data ? (
        <ImportResultSummary result={commitMutation.data} dryRun={false} />
      ) : (
        previewMutation.data && <ImportResultSummary result={previewMutation.data} dryRun={true} />
      )}
    </div>
  );
}

export default function ManageQuestionsPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });

  if (me.isPending) {
    return (
      <main className="p-xl">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  const isAdmin = me.data?.role === "admin";

  return (
    <main className="p-xl">
      <Link href="/learn/quizzes" className="text-sm text-muted-foreground hover:underline">
        ← Quizzes
      </Link>
      <h1 className="mt-xs text-2xl font-semibold text-foreground">Import questions</h1>

      {isAdmin ? (
        <ImportForm />
      ) : (
        <p className="mt-md text-sm text-muted-foreground">Admin access required.</p>
      )}
    </main>
  );
}
