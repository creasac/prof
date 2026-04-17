"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

import { authClient } from "../lib/auth-client";
import {
  buildAuthHref,
  createUsernameBase,
  getSessionUsername,
  normalizeNameInput,
  normalizeUsernameInput,
  sanitizeNextPath,
} from "../lib/auth-user";
import { buildProfileHref } from "../lib/profile-route";
import { PasswordField } from "./PasswordField";

type AuthPageProps = {
  mode: "login" | "signup";
};

const MAX_USERNAME_LENGTH = 24;

function withUsernameSuffix(base: string, index: number) {
  if (index === 0) {
    return base;
  }

  const suffix = `_${index + 1}`;
  return `${base.slice(0, Math.max(3, MAX_USERNAME_LENGTH - suffix.length))}${suffix}`;
}

function isEmailLike(value: string) {
  return value.includes("@");
}

export function AuthPage({ mode }: AuthPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending: isSessionPending, error: sessionError, refetch } = authClient.useSession();
  const sessionUsername = getSessionUsername(session);
  const nextPath = sanitizeNextPath(searchParams.get("next"));
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usernameNote, setUsernameNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [hasEditedUsername, setHasEditedUsername] = useState(false);
  const usernameRequestIdRef = useRef(0);

  useEffect(() => {
    if (isSessionPending || !session?.user?.id) {
      return;
    }

    router.replace(nextPath ?? buildProfileHref(sessionUsername));
  }, [isSessionPending, nextPath, router, session?.user?.id, sessionUsername]);

  useEffect(() => {
    if (mode !== "signup" || hasEditedUsername) {
      return;
    }

    const base = createUsernameBase(name);
    const requestId = usernameRequestIdRef.current + 1;
    usernameRequestIdRef.current = requestId;
    setIsCheckingUsername(Boolean(name.trim()));

    if (!name.trim()) {
      setUsername("");
      setUsernameNote("");
      setIsCheckingUsername(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void findAvailableUsername(base)
        .then((resolvedUsername) => {
          if (usernameRequestIdRef.current !== requestId || hasEditedUsername) {
            return;
          }

          setUsername(resolvedUsername);
          setUsernameNote("");
        })
        .catch((error) => {
          if (usernameRequestIdRef.current !== requestId || hasEditedUsername) {
            return;
          }

          setUsername(base);
          setUsernameNote(error instanceof Error ? error.message : "Failed to check username.");
        })
        .finally(() => {
          if (usernameRequestIdRef.current === requestId && !hasEditedUsername) {
            setIsCheckingUsername(false);
          }
        });
    }, 220);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [hasEditedUsername, mode, name]);

  async function findAvailableUsername(seed: string) {
    const base = createUsernameBase(seed);

    for (let index = 0; index < 40; index += 1) {
      const candidate = withUsernameSuffix(base, index);
      const result = await authClient.isUsernameAvailable({
        username: candidate,
      });

      if (result.error) {
        throw new Error(result.error.message ?? "Failed to check username.");
      }

      if (result.data?.available) {
        return candidate;
      }
    }

    return withUsernameSuffix(base, 40 + Math.floor(Math.random() * 50));
  }

  async function ensureUsernameAvailable(seed: string, reason: "auto" | "manual") {
    const normalized = createUsernameBase(seed);
    const requestId = usernameRequestIdRef.current + 1;
    usernameRequestIdRef.current = requestId;
    setIsCheckingUsername(true);

    try {
      const resolvedUsername = await findAvailableUsername(normalized);

      if (usernameRequestIdRef.current !== requestId) {
        return normalized;
      }

      setUsername(resolvedUsername);
      setUsernameNote(reason === "manual" && resolvedUsername !== normalized ? `Using ${resolvedUsername}.` : "");
      return resolvedUsername;
    } finally {
      if (usernameRequestIdRef.current === requestId) {
        setIsCheckingUsername(false);
      }
    }
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const trimmedIdentifier = identifier.trim();

      const result = isEmailLike(trimmedIdentifier)
        ? await authClient.signIn.email({
            email: trimmedIdentifier,
            password,
          })
        : await authClient.signIn.username({
            username: normalizeUsernameInput(trimmedIdentifier),
            password,
          });

      if (result.error) {
        setFormError(result.error.message ?? "Failed to log in.");
        return;
      }

      await refetch();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to log in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const normalizedName = normalizeNameInput(name);
      if (!normalizedName) {
        setFormError("Name is required.");
        return;
      }

      const resolvedUsername = await ensureUsernameAvailable(username || name, "manual");
      const result = await authClient.signUp.email({
        name: normalizedName,
        username: resolvedUsername,
        email: email.trim(),
        password,
      });

      if (result.error) {
        setFormError(result.error.message ?? "Failed to sign up.");
        return;
      }

      await refetch();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to sign up.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const alternateHref = buildAuthHref(mode === "login" ? "/signup" : "/login", nextPath);

  if (!isSessionPending && session?.user?.id) {
    return null;
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1 style={styles.title}>{mode === "login" ? "Log in" : "Sign up"}</h1>

        {mode === "login" ? (
          <form style={styles.form} onSubmit={(event) => void handleLoginSubmit(event)}>
            <input
              style={styles.input}
              type="text"
              placeholder="Email or username"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
            />
            <PasswordField
              inputStyle={styles.input}
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              autoComplete="current-password"
              required
            />
            <button type="submit" style={styles.submitButton} disabled={isSubmitting}>
              {isSubmitting ? "..." : "Log in"}
            </button>
          </form>
        ) : (
          <form style={styles.form} onSubmit={(event) => void handleSignupSubmit(event)}>
            <input
              style={styles.input}
              type="text"
              placeholder="Name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              required
            />
            <input
              style={styles.input}
              type="text"
              placeholder="Username"
              value={username}
              onChange={(event) => {
                usernameRequestIdRef.current += 1;
                setHasEditedUsername(true);
                setIsCheckingUsername(false);
                setUsername(normalizeUsernameInput(event.target.value));
                setUsernameNote("");
              }}
              onBlur={() => {
                if (!username) {
                  return;
                }

                void ensureUsernameAvailable(username, "manual").catch((error) => {
                  setUsernameNote(error instanceof Error ? error.message : "Failed to check username.");
                });
              }}
              minLength={3}
              required
            />
            {isCheckingUsername ? <p style={styles.note}>Checking username...</p> : null}
            {!isCheckingUsername && usernameNote ? <p style={styles.note}>{usernameNote}</p> : null}
            <input
              style={styles.input}
              type="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <PasswordField
              inputStyle={styles.input}
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              autoComplete="new-password"
              required
            />
            <button type="submit" style={styles.submitButton} disabled={isSubmitting || isCheckingUsername}>
              {isSubmitting ? "..." : "Sign up"}
            </button>
          </form>
        )}

        {formError ? <p style={styles.errorText}>{formError}</p> : null}
        {sessionError ? <p style={styles.subtleText}>Auth needs `DATABASE_URL` and `AUTH_SECRET`.</p> : null}

        <p style={styles.switchText}>
          {mode === "login" ? "No account?" : "Have an account?"}{" "}
          <Link href={alternateHref} style={styles.switchLink}>
            {mode === "login" ? "Sign up" : "Log in"}
          </Link>
        </p>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--bg)",
    padding: "24px 16px",
    display: "grid",
    placeItems: "center",
  },
  card: {
    width: "min(100%, 360px)",
    borderRadius: "18px",
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    boxShadow: "var(--shadow)",
    padding: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  title: {
    margin: 0,
    fontSize: "1.15rem",
    lineHeight: 1.1,
    color: "var(--text-soft)",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  input: {
    width: "100%",
    borderRadius: "10px",
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "var(--text-soft)",
    padding: "10px 11px",
    fontSize: "0.94rem",
  },
  submitButton: {
    border: 0,
    borderRadius: "10px",
    background: "var(--surface-contrast)",
    color: "var(--inverse-text)",
    padding: "10px 12px",
    fontSize: "0.94rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  note: {
    margin: 0,
    fontSize: "0.82rem",
    lineHeight: 1.4,
    color: "var(--muted)",
  },
  subtleText: {
    margin: 0,
    fontSize: "0.82rem",
    lineHeight: 1.4,
    color: "var(--muted)",
  },
  errorText: {
    margin: 0,
    fontSize: "0.84rem",
    lineHeight: 1.4,
    color: "var(--danger)",
  },
  switchText: {
    margin: 0,
    fontSize: "0.88rem",
    lineHeight: 1.4,
    color: "var(--muted)",
  },
  switchLink: {
    color: "var(--text-soft)",
    textDecoration: "none",
    fontWeight: 600,
  },
};
