"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { fetchJson, toUserErrorMessage } from "@/lib/fetch-json";

type SummaryOverrideFormProps = {
  interactionId: string;
  currentSummary: string;
};

export function SummaryOverrideForm(props: SummaryOverrideFormProps) {
  const router = useRouter();
  const [savedValue, setSavedValue] = useState(props.currentSummary);
  const [draftValue, setDraftValue] = useState(props.currentSummary);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastError, setToastError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }

    setSaving(true);
    setToastError(null);

    try {
      const body = new FormData();
      body.set("summary", draftValue);

      await fetchJson(`/api/interactions/${props.interactionId}/summary`, {
        method: "POST",
        body
      });

      setSavedValue(draftValue);
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      setToastError(toUserErrorMessage(error, "Network error while updating summary."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="summary-override">
      {!isEditing ? (
        <div className="summary-display">
          <p>{savedValue}</p>
          <button
            type="button"
            className="summary-edit-toggle"
            aria-label="Edit summary"
            onClick={() => {
              setDraftValue(savedValue);
              setToastError(null);
              setIsEditing(true);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M3 17.25V21h3.75L19.81 7.94l-3.75-3.75L3 17.25Zm2.92 2.08H5v-.92l9.94-9.94.92.92L5.92 19.33ZM20.71 6.04a1 1 0 0 0 0-1.41l-1.34-1.34a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75 1.13-1.13Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="summary-override-form">
          <label htmlFor="summary-input">Edit summary</label>
          <textarea
            id="summary-input"
            name="summary"
            value={draftValue}
            onChange={(event) => setDraftValue(event.target.value)}
            rows={5}
          />
          <div className="summary-override-actions">
            <button type="submit" className="artifact-link-button" disabled={saving}>
              {saving ? "Saving..." : "Save Summary"}
            </button>
            <button
              type="button"
              className="summary-cancel-button"
              disabled={saving}
              onClick={() => {
                setDraftValue(savedValue);
                setToastError(null);
                setIsEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {toastError ? (
        <div className="toast toast-error" role="status" aria-live="polite">
          {toastError}
        </div>
      ) : null}
    </div>
  );
}
