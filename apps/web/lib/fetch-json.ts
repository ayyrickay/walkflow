"use client";

type ApiErrorPayload = {
  error?: string;
};

function isJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json");
}

async function readErrorMessage(response: Response) {
  if (isJsonResponse(response)) {
    const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
    if (payload?.error) {
      return payload.error;
    }
  }

  return `Request failed (${response.status})`;
}

export async function fetchJson<T>(input: RequestInfo | URL, init: RequestInit = {}) {
  const response = await fetch(input, {
    ...init,
    redirect: init.redirect ?? "error"
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (!isJsonResponse(response)) {
    return null as T;
  }

  return (await response.json()) as T;
}

export function toUserErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
