"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRef } from "react";

import { fetchJson, toUserErrorMessage } from "@/lib/fetch-json";

type RepoOverrideFormProps = {
  interactionId: string;
  currentRepoName: string;
  owners: string[];
  localRepoNames: string[];
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function RepoOverrideForm(props: RepoOverrideFormProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(props.currentRepoName);
  const [remoteSuggestions, setRemoteSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastError, setToastError] = useState<string | null>(null);

  const localSuggestions = useMemo(() => {
    const query = normalize(value);
    if (query.length < 2) {
      return [];
    }
    return props.localRepoNames
      .filter((repo) => normalize(repo).includes(query))
      .slice(0, 8);
  }, [props.localRepoNames, value]);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setRemoteSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        params.set("q", query);
        params.set("limit", "8");
        if (props.owners.length > 0) {
          params.set("owners", props.owners.join(","));
        }

        const data = await fetchJson<{ repoNames?: string[] }>(`/api/github/repositories/suggest?${params.toString()}`, {
          signal: controller.signal
        });
        setRemoteSuggestions(data.repoNames ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setRemoteSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [props.owners, value]);

  const suggestions = useMemo(() => {
    const ordered = [...localSuggestions, ...remoteSuggestions];
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const repo of ordered) {
      const key = normalize(repo);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push(repo);
    }
    return unique.slice(0, 8);
  }, [localSuggestions, remoteSuggestions]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }

    setSaving(true);
    setToastError(null);

    try {
      const body = new FormData();
      body.set("repoName", value);

      await fetchJson(`/api/interactions/${props.interactionId}/repo`, {
        method: "POST",
        body
      });

      const container = rootRef.current?.closest("details");
      if (container instanceof HTMLDetailsElement) {
        container.open = false;
      }

      router.refresh();
    } catch (error) {
      setToastError(toUserErrorMessage(error, "Network error while updating repository."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="repo-override" ref={rootRef}>
      <form onSubmit={onSubmit} className="repo-override-form">
        <input
          name="repoName"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="owner/repo"
          autoComplete="off"
        />
        <button type="submit" className="artifact-link-button" disabled={saving}>
          {saving ? "Saving..." : "Save Repo"}
        </button>
      </form>
      {loading ? <p className="repo-override-hint">Searching repositories...</p> : null}
      {suggestions.length > 0 ? (
        <div className="repo-suggestions" role="listbox" aria-label="Repository suggestions">
          {suggestions.map((repo) => (
            <button key={repo} type="button" className="repo-suggestion" onClick={() => setValue(repo)}>
              {repo}
            </button>
          ))}
        </div>
      ) : null}
      <p className="repo-override-hint">Type to search. Suggestions are capped to keep this fast.</p>
      {toastError ? (
        <div className="toast toast-error" role="status" aria-live="polite">
          {toastError}
        </div>
      ) : null}
    </div>
  );
}
