"use client";

import { FormEvent, useMemo, useState } from "react";

export function AuthScreen() {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [direction, setDirection] = useState<"forward" | "backward" | null>(null);
  const [submitting, setSubmitting] = useState<"login" | "signup" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const authHeading = useMemo(() => {
    return tab === "login" ? "Login failed" : "Sign up failed";
  }, [tab]);

  function switchTab(nextTab: "login" | "signup") {
    if (nextTab === tab) {
      return;
    }

    setDirection(nextTab === "signup" ? "forward" : "backward");
    setTab(nextTab);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>, mode: "login" | "signup") {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(mode);
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
        redirect: "error"
      });

      if (response.ok) {
        window.location.assign("/dashboard");
        return;
      }

      let message = "Something went wrong. Please try again.";
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const payload = (await response.json()) as { error?: string };
        if (payload.error) {
          message = payload.error;
        }
      }

      setErrorMessage(message);
    } catch (error) {
      console.error(`${mode} request failed`, error);
      setErrorMessage("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <section className="auth-screen">
      <div className="auth-fullscreen-gradient" aria-hidden="true" />
      <div className="auth-modal-wrap">
        <p className="auth-modal-brand">WALKFLOW</p>
        <div className="auth-modal">
          <h1>Think while walking. Ship when you return.</h1>
          <p className="auth-lede">
            Call in your ideas, confirm the repo action by voice, and review a clean execution trail in one dashboard.
          </p>

          <ul className="auth-points">
            <li>Phone-first capture for hands-free developer notes</li>
            <li>Safe-by-default confirmations with `Needs Review` fallback</li>
            <li>Repo-aware issue and PR workflow history</li>
          </ul>

          <div className="auth-tabs" role="tablist" aria-label="Authentication mode" data-tab={tab}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "login"}
              className={`auth-tab ${tab === "login" ? "auth-tab-active" : ""}`}
              onClick={() => switchTab("login")}
            >
              Login
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "signup"}
              className={`auth-tab ${tab === "signup" ? "auth-tab-active" : ""}`}
              onClick={() => switchTab("signup")}
            >
              Sign up
            </button>
          </div>

          {tab === "login" ? (
            <form
              method="post"
              className={`auth-form-card auth-form-card-single ${
                direction === "backward" ? "auth-panel-slide-backward" : ""
              }`}
              onSubmit={(event) => void submitAuth(event, "login")}
            >
              <label htmlFor="login-email">Email</label>
              <input id="login-email" name="email" type="email" placeholder="dev@example.com" required />

              <label htmlFor="login-password">Password</label>
              <input id="login-password" name="password" type="password" minLength={8} required />

              <button type="submit" disabled={submitting !== null}>
                {submitting === "login" ? "Logging in..." : "Login"}
              </button>
            </form>
          ) : (
            <form
              method="post"
              className={`auth-form-card auth-form-card-single ${
                direction === "forward" ? "auth-panel-slide-forward" : ""
              }`}
              onSubmit={(event) => void submitAuth(event, "signup")}
            >
              <label htmlFor="register-email">Email</label>
              <input id="register-email" name="email" type="email" placeholder="dev@example.com" required />

              <label htmlFor="register-phone">Phone (E.164)</label>
              <input id="register-phone" name="phoneE164" type="tel" placeholder="+447700900123" required />

              <label htmlFor="register-password">Password</label>
              <input id="register-password" name="password" type="password" minLength={8} required />

              <button type="submit" disabled={submitting !== null}>
                {submitting === "signup" ? "Creating account..." : "Sign up"}
              </button>
            </form>
          )}
        </div>
      </div>

      {errorMessage ? (
        <div className="auth-error-overlay" role="presentation" onClick={() => setErrorMessage(null)}>
          <section
            className="auth-error-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="auth-error-title"
            aria-describedby="auth-error-description"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="auth-error-title">{authHeading}</h2>
            <p id="auth-error-description">{errorMessage}</p>
            <div className="auth-error-actions">
              <button type="button" onClick={() => setErrorMessage(null)}>
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
