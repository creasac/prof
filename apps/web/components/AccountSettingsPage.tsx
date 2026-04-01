"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "../lib/auth-client";
import {
  buildAuthHref,
  getSessionUserName,
  getSessionUsername,
  normalizeNameInput,
  normalizeUsernameInput,
} from "../lib/auth-user";
import { buildProfileHref, buildSettingsHref } from "../lib/profile-route";
import { PasswordField } from "./PasswordField";

export function AccountSettingsPage() {
  const router = useRouter();
  const settingsHref = buildSettingsHref();
  const { data: session, isPending, refetch } = authClient.useSession();
  const sessionName = getSessionUserName(session);
  const sessionUsername = getSessionUsername(session);
  const sessionEmail = typeof session?.user?.email === "string" ? session.user.email : "";
  const isEmailVerified =
    session?.user && "emailVerified" in session.user ? Boolean(session.user.emailVerified) : false;

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isPending || session?.user?.id) {
      return;
    }

    router.replace(buildAuthHref("/login", settingsHref));
  }, [isPending, router, session?.user?.id, settingsHref]);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    setName(sessionName);
    setUsername(sessionUsername);
    setEmail(sessionEmail);
  }, [session?.user?.id, sessionEmail, sessionName, sessionUsername]);

  async function isUsernameAvailable(nextUsername: string) {
    if (!nextUsername || nextUsername === sessionUsername) {
      return true;
    }

    const result = await authClient.isUsernameAvailable({
      username: nextUsername,
    });

    if (result.error) {
      throw new Error(result.error.message ?? "Failed to check username.");
    }

    return Boolean(result.data?.available);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFormStatus(null);
    setIsSaving(true);

    try {
      const normalizedName = normalizeNameInput(name);
      const normalizedUsername = normalizeUsernameInput(username);
      const normalizedEmail = email.trim().toLowerCase();
      const wantsPasswordChange = Boolean(currentPassword || newPassword);

      if (!normalizedName) {
        setFormError("Name is required.");
        return;
      }

      if (normalizedUsername.length < 3) {
        setFormError("Username must be at least 3 characters.");
        return;
      }

      if (!normalizedEmail) {
        setFormError("Email is required.");
        return;
      }

      if (wantsPasswordChange) {
        if (!currentPassword) {
          setFormError("Current password is required.");
          return;
        }

        if (!newPassword) {
          setFormError("New password is required.");
          return;
        }

        if (newPassword.length < 8) {
          setFormError("New password must be at least 8 characters.");
          return;
        }
      }

      const hasNameChange = normalizedName !== sessionName;
      const hasUsernameChange = normalizedUsername !== sessionUsername;
      const hasEmailChange = normalizedEmail !== sessionEmail;

      if (hasUsernameChange) {
        const available = await isUsernameAvailable(normalizedUsername);
        if (!available) {
          setFormError("Username is already taken.");
          return;
        }
      }

      if (hasNameChange || hasUsernameChange) {
        const profileResult = await authClient.updateUser({
          ...(hasNameChange ? { name: normalizedName } : {}),
          ...(hasUsernameChange ? { username: normalizedUsername } : {}),
        });

        if (profileResult.error) {
          setFormError(profileResult.error.message ?? "Failed to update.");
          return;
        }
      }

      if (hasEmailChange) {
        const emailResult = await authClient.changeEmail({
          newEmail: normalizedEmail,
          callbackURL: settingsHref,
        });

        if (emailResult.error) {
          setFormError(emailResult.error.message ?? "Failed to update.");
          return;
        }
      }

      if (wantsPasswordChange) {
        const passwordResult = await authClient.changePassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: true,
        });

        if (passwordResult.error) {
          setFormError(passwordResult.error.message ?? "Failed to update.");
          return;
        }
      }

      await refetch();
      setName(normalizedName);
      setUsername(normalizedUsername);
      setEmail(normalizedEmail);
      setCurrentPassword("");
      setNewPassword("");
      setFormStatus(isEmailVerified && hasEmailChange ? "Check your new email." : "Updated.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to update.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isPending || !session?.user?.id) {
    return null;
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <header style={styles.header}>
          <h1 style={styles.title}>Account</h1>
          <button
            type="button"
            style={styles.linkButton}
            onClick={() => {
              router.push(buildProfileHref(sessionUsername));
            }}
          >
            View profile
          </button>
        </header>

        <form style={styles.form} onSubmit={(event) => void handleSubmit(event)}>
          <div style={styles.singleRowGrid}>
            <label style={styles.rowLabel} htmlFor="account-name">
              Name
            </label>
            <input
              id="account-name"
              style={styles.input}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>

          <div style={styles.singleRowGrid}>
            <label style={styles.rowLabel} htmlFor="account-username">
              Username
            </label>
            <input
              id="account-username"
              style={styles.input}
              type="text"
              value={username}
              onChange={(event) => setUsername(normalizeUsernameInput(event.target.value))}
              minLength={3}
              required
            />
          </div>

          <div style={styles.singleRowGrid}>
            <label style={styles.rowLabel} htmlFor="account-email">
              Email
            </label>
            <input
              id="account-email"
              style={styles.input}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div style={styles.passwordGrid}>
            <label style={styles.rowLabel} htmlFor="account-current-password">
              Current password
            </label>
            <PasswordField
              id="account-current-password"
              inputStyle={styles.input}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required={Boolean(newPassword)}
            />

            <label style={styles.rowLabel} htmlFor="account-new-password">
              New password
            </label>
            <PasswordField
              id="account-new-password"
              inputStyle={styles.input}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required={Boolean(currentPassword)}
            />
          </div>

          {formError ? <p style={styles.errorText}>{formError}</p> : null}
          {formStatus ? <p style={styles.okText}>{formStatus}</p> : null}

          <button type="submit" style={styles.submitButton} disabled={isSaving}>
            {isSaving ? "..." : "Update"}
          </button>
        </form>
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
    width: "min(100%, 420px)",
    borderRadius: "18px",
    border: "1px solid rgba(94, 73, 61, 0.14)",
    background: "rgba(255, 252, 247, 0.94)",
    boxShadow: "0 18px 42px rgba(73, 35, 14, 0.1)",
    padding: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
  },
  title: {
    margin: 0,
    fontSize: "1.15rem",
    lineHeight: 1.1,
    color: "#2c1c14",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    paddingTop: "2px",
  },
  singleRowGrid: {
    display: "grid",
    gridTemplateColumns: "120px minmax(0, 1fr)",
    gap: "8px 10px",
    alignItems: "center",
  },
  passwordGrid: {
    display: "grid",
    gridTemplateColumns: "120px minmax(0, 1fr)",
    gap: "8px 10px",
    alignItems: "center",
  },
  rowLabel: {
    fontSize: "0.84rem",
    lineHeight: 1.2,
    color: "#5e493d",
    fontWeight: 600,
  },
  input: {
    width: "100%",
    borderRadius: "10px",
    border: "1px solid rgba(94, 73, 61, 0.16)",
    background: "#fffdfb",
    color: "#422f24",
    padding: "10px 11px",
    fontSize: "0.94rem",
  },
  submitButton: {
    alignSelf: "flex-end",
    border: 0,
    borderRadius: "10px",
    background: "#5e493d",
    color: "#fff7f2",
    padding: "10px 14px",
    fontSize: "0.94rem",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  linkButton: {
    border: "1px solid rgba(94, 73, 61, 0.16)",
    borderRadius: "10px",
    background: "transparent",
    color: "#5e493d",
    padding: "8px 10px",
    fontSize: "0.84rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  errorText: {
    margin: 0,
    fontSize: "0.84rem",
    lineHeight: 1.4,
    color: "#a22e2e",
  },
  okText: {
    margin: 0,
    fontSize: "0.84rem",
    lineHeight: 1.4,
    color: "#2e6a3c",
  },
};
