"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { fetchJson, toUserErrorMessage } from "@/lib/fetch-json";

type InteractionAction = {
  status: "approved" | "needs_review" | "archived";
  label: string;
  style: "approved" | "review" | "archive";
};

type InteractionActionsProps = {
  interactionId: string;
  actions: InteractionAction[];
};

function buttonClass(style: InteractionAction["style"]) {
  if (style === "approved") {
    return "action-button action-button-approved";
  }
  if (style === "review") {
    return "action-button action-button-review";
  }
  return "action-button action-button-archive";
}

export function InteractionActions({ interactionId, actions }: InteractionActionsProps) {
  const router = useRouter();
  const [pendingStatus, setPendingStatus] = useState<InteractionAction["status"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitStatus(status: InteractionAction["status"]) {
    if (pendingStatus) {
      return;
    }

    setPendingStatus(status);
    setError(null);

    const formData = new FormData();
    formData.set("status", status);

    try {
      await fetchJson(`/api/interactions/${interactionId}/status`, {
        method: "POST",
        body: formData
      });

      router.refresh();
    } catch (cause) {
      setError(toUserErrorMessage(cause, "Failed to update interaction status."));
    } finally {
      setPendingStatus(null);
    }
  }

  if (actions.length === 0) {
    return <p>This interaction is completed. Status is now automation-managed.</p>;
  }

  return (
    <>
      <div className="action-row">
        {actions.map((action) => (
          <button
            key={`${interactionId}-${action.status}`}
            type="button"
            className={buttonClass(action.style)}
            onClick={() => void submitStatus(action.status)}
            disabled={pendingStatus !== null}
          >
            {pendingStatus === action.status
              ? action.status === "approved"
                ? "Running..."
                : "Saving..."
              : action.label}
          </button>
        ))}
      </div>

      {pendingStatus === "approved" ? (
        <p className="automation-running" role="status" aria-live="polite">
          <span className="automation-spinner" aria-hidden="true" />
          Running automation: creating issue, then opening a PR if appropriate.
        </p>
      ) : null}

      {error ? (
        <p className="automation-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
