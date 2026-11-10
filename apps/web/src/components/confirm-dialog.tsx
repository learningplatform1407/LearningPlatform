"use client";

import { Button } from "@/components/button";
import { Modal } from "@/components/modal";
import { useI18n } from "@/lib/i18n";

/** A short question with two answers, centred over the dimmed page.
 *
 * Replaces `window.confirm` for confirmations. The browser's own dialog
 * ignores the theme and the type scale, cannot say which action is
 * destructive, orders the buttons the browser's way rather than ours, and
 * blocks the main thread for as long as it is open.
 *
 * Built on `Modal`, so focus return, Escape, the scroll lock and the portal
 * are the shared implementations rather than a second set -- including its
 * documented lack of a focus trap.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  /** The consequence, in one sentence. Omit when the title says it all. */
  message?: string;
  confirmLabel: string;
  /** Defaults to the shared "Cancel" wording. */
  cancelLabel?: string;
  /** Renders the confirm action as destructive, for actions that lose work. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();

  return (
    <Modal open={open} onClose={onCancel} title={title} compact>
      {message !== undefined && <p className="text-sm text-muted-foreground">{message}</p>}
      {/* Confirm last, so the reading order ends on the action being asked
          about and Tab reaches the way out first. */}
      <div className="mt-lg flex justify-end gap-sm">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel ?? t("common.cancel")}
        </Button>
        <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
