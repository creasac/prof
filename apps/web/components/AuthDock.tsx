"use client";

import { useState, type CSSProperties, type FormEvent } from "react";

import { authClient } from "../lib/auth-client";

export function AuthDock() {
  const { data: session, isPending, error, refetch } = authClient.useSession();
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      if (mode === "sign_up") {
        const result = await authClient.signUp.email({
          name: name.trim(),
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

  return (
    <aside style={styles.shell}>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <div>
            <p style={styles.eyebrow}>Account</p>
            <h2 style={styles.title}>{session?.user ? "Signed In" : "Sync Progress"}</h2>
          </div>
          {session?.user ? (
            <button type="button" style={styles.ghostButton} onClick={() => void handleSignOut()} disabled={isSubmitting}>
              {isSubmitting ? "..." : "Sign out"}
            </button>
          ) : null}
        </div>

        {session?.user ? (
          <div style={styles.copyBlock}>
            <p style={styles.bodyText}>{session.user.name || session.user.email}</p>
            <p style={styles.subtleText}>{session.user.email}</p>
            <p style={styles.subtleText}>Learn sessions now save to your account as well as local browser state.</p>
          </div>
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
                  placeholder="Name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
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
    top: "16px",
    right: "16px",
    zIndex: 40,
    width: "min(360px, calc(100vw - 32px))",
    pointerEvents: "none",
  },
  card: {
    pointerEvents: "auto",
    borderRadius: "18px",
    border: "1px solid rgba(94, 73, 61, 0.16)",
    background: "rgba(255, 249, 243, 0.96)",
    boxShadow: "0 16px 40px rgba(93, 70, 51, 0.14)",
    backdropFilter: "blur(18px)",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
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
    margin: "4px 0 0",
    fontSize: "1rem",
    lineHeight: 1.1,
    color: "#422f24",
  },
  copyBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  bodyText: {
    margin: 0,
    color: "#422f24",
    fontWeight: 600,
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
    gap: "8px",
  },
  modeButton: {
    borderRadius: "999px",
    border: "1px solid rgba(94, 73, 61, 0.16)",
    background: "rgba(255, 255, 255, 0.75)",
    color: "#6c5648",
    padding: "8px 12px",
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
    gap: "8px",
  },
  input: {
    borderRadius: "12px",
    border: "1px solid rgba(94, 73, 61, 0.16)",
    background: "#fffdfb",
    color: "#422f24",
    padding: "10px 12px",
    fontSize: "0.95rem",
  },
  submitButton: {
    borderRadius: "12px",
    border: "none",
    background: "#5e493d",
    color: "#fff7f2",
    padding: "10px 12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  ghostButton: {
    borderRadius: "999px",
    border: "1px solid rgba(94, 73, 61, 0.16)",
    background: "transparent",
    color: "#5e493d",
    padding: "8px 12px",
    cursor: "pointer",
  },
  errorText: {
    margin: 0,
    color: "#a22e2e",
    fontSize: "0.88rem",
  },
};
