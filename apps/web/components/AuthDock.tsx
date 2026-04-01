"use client";

import { useState, type CSSProperties, type FormEvent } from "react";

import { authClient } from "../lib/auth-client";

function getSessionUsername(session: ReturnType<typeof authClient.useSession>["data"]) {
  if (!session?.user || !("username" in session.user)) {
    return "";
  }

  return typeof session.user.username === "string" ? session.user.username : "";
}

export function AuthDock() {
  const { data: session, isPending, error, refetch } = authClient.useSession();
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sessionUsername = getSessionUsername(session);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      if (mode === "sign_up") {
        const normalizedUsername = username.trim();
        const result = await authClient.signUp.email({
          name: normalizedUsername,
          username: normalizedUsername,
          email: email.trim(),
          password,
        });

        if (result.error) {
          setFormError(result.error.message ?? "Failed to create the account.");
          return;
        }
      } else {
        const result = await authClient.signIn.email({
          email: email.trim(),
          password,
        });

        if (result.error) {
          setFormError(result.error.message ?? "Failed to sign in.");
          return;
        }
      }

      setPassword("");
      await refetch();
    } catch (nextError) {
      setFormError(nextError instanceof Error ? nextError.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleClaimUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.user) {
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      const normalizedUsername = username.trim();
      const result = await authClient.updateUser({
        username: normalizedUsername,
        name: session.user.name || normalizedUsername,
      });

      if (result.error) {
        setFormError(result.error.message ?? "Failed to save username.");
        return;
      }

      await refetch();
    } catch (nextError) {
      setFormError(nextError instanceof Error ? nextError.message : "Failed to save username.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignOut() {
    setFormError(null);
    setIsSubmitting(true);

    try {
      const result = await authClient.signOut();
      if (result.error) {
        setFormError(result.error.message ?? "Failed to sign out.");
        return;
      }

      await refetch();
    } catch (nextError) {
      setFormError(nextError instanceof Error ? nextError.message : "Failed to sign out.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (session?.user && sessionUsername) {
    return null;
  }

  return (
    <aside style={styles.shell}>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <div>
            <p style={styles.eyebrow}>Account</p>
            <h2 style={styles.title}>{session?.user ? "Choose username" : "Sync Progress"}</h2>
          </div>
          {session?.user ? (
            <button type="button" style={styles.ghostButton} onClick={() => void handleSignOut()} disabled={isSubmitting}>
              {isSubmitting ? "..." : "Sign out"}
            </button>
          ) : null}
        </div>

        {session?.user ? (
          <form style={styles.form} onSubmit={(event) => void handleClaimUsername(event)}>
            <input
              style={styles.input}
              type="text"
              placeholder="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              minLength={3}
              required
            />
            <button type="submit" style={styles.submitButton} disabled={isSubmitting || isPending}>
              {isSubmitting ? "Saving..." : "Save username"}
            </button>
          </form>
        ) : (
          <>
            <div style={styles.modeRow}>
              <button
                type="button"
                style={{ ...styles.modeButton, ...(mode === "sign_in" ? styles.modeButtonActive : null) }}
                onClick={() => setMode("sign_in")}
              >
                Sign in
              </button>
              <button
                type="button"
                style={{ ...styles.modeButton, ...(mode === "sign_up" ? styles.modeButtonActive : null) }}
                onClick={() => setMode("sign_up")}
              >
                Create
              </button>
            </div>

            <form style={styles.form} onSubmit={(event) => void handleSubmit(event)}>
              {mode === "sign_up" ? (
                <input
                  style={styles.input}
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  minLength={3}
                  required
                />
              ) : null}
              <input
                style={styles.input}
                type="email"
                placeholder="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <input
                style={styles.input}
                type="password"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
              <button type="submit" style={styles.submitButton} disabled={isSubmitting || isPending}>
                {isSubmitting ? "Working..." : mode === "sign_up" ? "Create account" : "Sign in"}
              </button>
            </form>
          </>
        )}

        {formError ? <p style={styles.errorText}>{formError}</p> : null}
        {!session?.user && error ? (
          <p style={styles.subtleText}>Auth is unavailable until the server has `DATABASE_URL` and `AUTH_SECRET` configured.</p>
        ) : null}
      </div>
    </aside>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    position: "fixed",
    top: "12px",
    right: "12px",
    zIndex: 40,
    width: "min(332px, calc(100vw - 24px))",
    pointerEvents: "none",
  },
  card: {
    pointerEvents: "auto",
    borderRadius: "16px",
    border: "1px solid rgba(94, 73, 61, 0.16)",
    background: "rgba(255, 249, 243, 0.96)",
    boxShadow: "0 16px 40px rgba(93, 70, 51, 0.14)",
    backdropFilter: "blur(18px)",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    alignItems: "flex-start",
  },
  eyebrow: {
    margin: 0,
    fontSize: "0.72rem",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#876755",
  },
  title: {
    margin: "3px 0 0",
    fontSize: "0.96rem",
    lineHeight: 1.1,
    color: "#422f24",
  },
  subtleText: {
    margin: 0,
    fontSize: "0.88rem",
    lineHeight: 1.4,
    color: "#6c5648",
  },
  modeRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "6px",
  },
  modeButton: {
    borderRadius: "999px",
    border: "1px solid rgba(94, 73, 61, 0.16)",
    background: "rgba(255, 255, 255, 0.75)",
    color: "#6c5648",
    padding: "7px 10px",
    cursor: "pointer",
  },
  modeButtonActive: {
    background: "#5e493d",
    color: "#fff7f2",
    borderColor: "#5e493d",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  input: {
    borderRadius: "10px",
    border: "1px solid rgba(94, 73, 61, 0.16)",
    background: "#fffdfb",
    color: "#422f24",
    padding: "9px 10px",
    fontSize: "0.92rem",
  },
  submitButton: {
    borderRadius: "10px",
    border: "none",
    background: "#5e493d",
    color: "#fff7f2",
    padding: "9px 10px",
    fontWeight: 600,
    cursor: "pointer",
  },
  ghostButton: {
    borderRadius: "999px",
    border: "1px solid rgba(94, 73, 61, 0.16)",
    background: "transparent",
    color: "#5e493d",
    padding: "7px 10px",
    cursor: "pointer",
  },
  errorText: {
    margin: 0,
    color: "#a22e2e",
    fontSize: "0.88rem",
  },
};
