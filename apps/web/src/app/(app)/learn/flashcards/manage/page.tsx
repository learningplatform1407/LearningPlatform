"use client";

import { ApiClientError } from "@lp/api-client";
import type { FlashcardImportRequest, FlashcardImportResult } from "@lp/contracts";
import { flashcardImportRequestSchema } from "@lp/validation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/button";
import { PageHeader } from "@/components/page-header";
import { PageMain } from "@/components/page-main";
import { getBrowserApiClient } from "@/lib/api-client.browser";
import { rich, useI18n } from "@/lib/i18n";

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
  result: FlashcardImportResult;
  dryRun: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-md rounded-xl border border-border p-md shadow-dot">
      <p className="text-sm font-medium text-foreground">
        {dryRun ? t("admin.import.dryRun") : t("admin.import.committed")}
      </p>
      <dl className="mt-sm grid grid-cols-3 gap-sm text-sm">
        <div>
          <dt className="text-muted-foreground">{t("admin.import.created")}</dt>
          <dd className="font-medium text-foreground">{result.created}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("admin.import.updated")}</dt>
          <dd className="font-medium text-foreground">{result.updated}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("admin.import.skipped")}</dt>
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
  const { t } = useI18n();
  const [jsonText, setJsonText] = useState("");
  // Syntax and shape are reported separately: telling an admin their
  // well-formed JSON is "invalid JSON" sends them hunting for a comma that
  // isn't missing, when the real problem is a field.
  const [syntaxError, setSyntaxError] = useState<string | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [previewedText, setPreviewedText] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  type ImportVariables = { text: string; payload: FlashcardImportRequest };

  const previewMutation = useMutation({
    mutationFn: ({ payload }: ImportVariables) =>
      getBrowserApiClient().importFlashcards(payload, true),
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
      getBrowserApiClient().importFlashcards(payload, false),
    onError: (err) => setRequestError(describeError(err)),
  });

  function describeError(err: unknown): string {
    if (err instanceof ApiClientError) {
      const body = err.body as { message?: string } | null;
      return body?.message ?? t("questions.requestFailed", { status: err.status });
    }
    return err instanceof Error ? err.message : t("admin.import.somethingWrong");
  }

  function parsePayload(): FlashcardImportRequest | null {
    setSyntaxError(null);
    setSchemaError(null);
    setRequestError(null);

    let raw: unknown;
    try {
      raw = JSON.parse(jsonText);
    } catch (err) {
      setSyntaxError(err instanceof Error ? err.message : t("admin.import.invalidJson"));
      return null;
    }

    const result = flashcardImportRequestSchema.safeParse(raw);
    if (!result.success) {
      setSchemaError(
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
    setSyntaxError(null);
    setSchemaError(null);
    setRequestError(null);
    // Otherwise a second batch pasted after a successful commit finds
    // commitMutation.isSuccess still true from the FIRST batch, which
    // permanently disables Import (canCommit checks !isSuccess) and hides
    // any new preview behind the stale "Import committed" summary.
    commitMutation.reset();
    // And the preview's own result has to go with it, or the previous
    // payload's "Dry run — Created 1" panel renders underneath the new text
    // as though it described that.
    previewMutation.reset();
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    try {
      handleTextChange(await readFileAsText(file));
    } catch (err) {
      setSyntaxError(err instanceof Error ? err.message : t("admin.import.couldNotRead"));
    }
  }

  const canCommit =
    previewedText !== null && previewedText === jsonText && !commitMutation.isSuccess;

  return (
    <div className="mt-lg flex w-full max-w-[56rem] flex-col gap-md">
      <p className="text-sm text-muted-foreground">
        {rich(t("admin.import.flashcardsIntro"), {
          official: (
            <strong className="font-medium text-foreground">{t("admin.import.official")}</strong>
          ),
          externalId: <code>external_id</code>,
        })}
      </p>

      <label className="flex flex-col gap-1.5 text-toc font-semibold text-foreground">
        {t("admin.import.uploadJson")}
        <input
          type="file"
          accept="application/json"
          onChange={handleFileChange}
          className="field file:mr-sm file:rounded-md file:border-0 file:bg-secondary file:px-sm file:py-xs file:text-sm file:font-medium file:text-foreground"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-toc font-semibold text-foreground">
        {t("admin.import.payload")}
        <textarea
          value={jsonText}
          onChange={(event) => handleTextChange(event.target.value)}
          rows={24}
          placeholder={
            '{"flashcards": [{"external_id": "fc-1", "document_id": "...", "front_text": "...", "back_text": "..."}]}'
          }
          className="field resize-y font-mono text-xs!"
        />
      </label>

      {syntaxError && (
        <p role="alert" className="text-sm text-danger">
          {t("admin.import.invalidJsonDetail", { detail: syntaxError })}
        </p>
      )}
      {schemaError && (
        <p role="alert" className="text-sm text-danger">
          That JSON is valid but doesn&apos;t match the import format: {schemaError}
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
          {previewMutation.isPending ? t("admin.import.checking") : t("admin.import.preview")}
        </Button>
        <Button
          type="button"
          onClick={handleCommit}
          disabled={!canCommit || commitMutation.isPending}
        >
          {commitMutation.isPending ? t("admin.import.importing") : t("admin.import.import")}
        </Button>
      </div>
      {!canCommit && !commitMutation.isSuccess && (
        <p className="text-xs text-muted-foreground">{t("admin.import.previewFirst")}</p>
      )}

      {commitMutation.data ? (
        <ImportResultSummary result={commitMutation.data} dryRun={false} />
      ) : (
        previewMutation.data && <ImportResultSummary result={previewMutation.data} dryRun={true} />
      )}
    </div>
  );
}

export default function ManageFlashcardsPage() {
  const { t } = useI18n();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getBrowserApiClient().getMe() });

  if (me.isPending) {
    return (
      <PageMain>
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </PageMain>
    );
  }

  const isAdmin = me.data?.role === "admin";

  return (
    <PageMain>
      <PageHeader kicker={t("admin.adminKicker")} title={t("admin.tools.flashcards")} />

      {isAdmin ? (
        <ImportForm />
      ) : (
        <p className="mt-md text-sm text-muted-foreground">{t("admin.accessRequired")}</p>
      )}
    </PageMain>
  );
}
