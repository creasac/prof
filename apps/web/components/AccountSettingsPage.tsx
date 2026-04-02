"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AccountUnlimitedAccessStatus } from "@prof/contracts";

import { authClient } from "../lib/auth-client";
import {
  buildAuthHref,
  getSessionUserName,
  getSessionUsername,
  normalizeNameInput,
  normalizeUsernameInput,
} from "../lib/auth-user";
import { buildProfileHref, buildSettingsHref } from "../lib/profile-route";
import { loadAccountUnlimitedAccessStatus, redeemAccountUnlimitedAccessCode } from "../lib/unlimited-access-api";
import { PasswordField } from "./PasswordField";

function formatUtcDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not available";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getUnlimitedAccessStatusLabel(status: AccountUnlimitedAccessStatus | null) {
  if (!status) {
    return "Unavailable";
  }

  if (status.hasUnlimitedAccess) {
    return "Active";
  }

  if (status.canRedeem) {
    return "Available";
  }

  return "Expired";
}

function getUnlimitedAccessSummary(status: AccountUnlimitedAccessStatus | null) {
  if (!status) {
    return "Unlimited access status is unavailable right now.";
  }

  if (status.hasUnlimitedAccess) {
    return `Unlimited access is active until ${formatUtcDateTime(status.accessExpiresAt)}.`;
  }

  if (status.canRedeem) {
    return "Enter the April 2026 access code below to unlock unlimited live and text usage.";
  }

  if (status.redeemedAt) {
    return `This April 2026 code was redeemed on ${formatUtcDateTime(status.redeemedAt)} and ended on ${formatUtcDateTime(status.accessExpiresAt)}.`;
  }

  return "The April 2026 unlimited-access code is no longer redeemable.";
}

function getUnlimitedAccessPillStyle(status: AccountUnlimitedAccessStatus | null) {
  if (status?.hasUnlimitedAccess) {
    return styles.statusPillActive;
  }

  if (status?.canRedeem) {
    return styles.statusPillAvailable;
  }

  return styles.statusPillExpired;
}

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
  const [unlimitedAccessStatus, setUnlimitedAccessStatus] = useState<AccountUnlimitedAccessStatus | null>(null);
  const [unlimitedAccessCode, setUnlimitedAccessCode] = useState("");
  const [unlimitedAccessError, setUnlimitedAccessError] = useState<string | null>(null);
  const [unlimitedAccessMessage, setUnlimitedAccessMessage] = useState<string | null>(null);
  const [isUnlimitedAccessLoading, setIsUnlimitedAccessLoading] = useState(true);
  const [isRedeemingUnlimitedAccess, setIsRedeemingUnlimitedAccess] = useState(false);

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

  useEffect(() => {
    let cancelled = false;

    async function hydrateUnlimitedAccessStatus() {
      if (!session?.user?.id) {
        return;
      }

      setIsUnlimitedAccessLoading(true);
      setUnlimitedAccessError(null);

      try {
        const status = await loadAccountUnlimitedAccessStatus();
        if (!cancelled) {
          setUnlimitedAccessStatus(status);
        }
      } catch (error) {
        if (!cancelled) {
          setUnlimitedAccessError(error instanceof Error ? error.message : "Failed to load unlimited access.");
        }
      } finally {
        if (!cancelled) {
          setIsUnlimitedAccessLoading(false);
        }
      }
    }

    void hydrateUnlimitedAccessStatus();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

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

  async function handleUnlimitedAccessRedeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUnlimitedAccessError(null);
    setUnlimitedAccessMessage(null);
    setIsRedeemingUnlimitedAccess(true);

    try {
      const result = await redeemAccountUnlimitedAccessCode(unlimitedAccessCode);
      setUnlimitedAccessStatus(result.status);
      setUnlimitedAccessCode("");
      setUnlimitedAccessMessage(result.message);
    } catch (error) {
      setUnlimitedAccessError(error instanceof Error ? error.message : "Failed to redeem unlimited access.");
    } finally {
      setIsRedeemingUnlimitedAccess(false);
    }
  }

  if (isPending || !session?.user?.id) {
    return null;
  }

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
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

        <section id="access-code" style={styles.card}>
          <header style={styles.sectionHeader}>
            <div style={styles.sectionHeaderText}>
              <h2 style={styles.title}>Unlimited access</h2>
              <p style={styles.sectionText}>
                {isUnlimitedAccessLoading ? "Checking your unlimited access status." : getUnlimitedAccessSummary(unlimitedAccessStatus)}
              </p>
            </div>
            <span style={{ ...styles.statusPill, ...getUnlimitedAccessPillStyle(unlimitedAccessStatus) }}>
              {isUnlimitedAccessLoading ? "Loading" : getUnlimitedAccessStatusLabel(unlimitedAccessStatus)}
            </span>
          </header>

          {isUnlimitedAccessLoading ? (
            <p style={styles.helperText}>Loading status...</p>
          ) : (
            <div style={styles.detailList}>
              <div style={styles.singleRowGrid}>
                <span style={styles.rowLabel}>Campaign</span>
                <p style={styles.valueText}>
                  {formatUtcDateTime(unlimitedAccessStatus?.campaignStartsAt)} to{" "}
                  {formatUtcDateTime(unlimitedAccessStatus?.campaignEndsAt)}
                </p>
              </div>

              <div style={styles.singleRowGrid}>
                <span style={styles.rowLabel}>Access ends</span>
                <p style={styles.valueText}>{formatUtcDateTime(unlimitedAccessStatus?.accessExpiresAt)}</p>
              </div>

              {unlimitedAccessStatus?.redeemedAt ? (
                <div style={styles.singleRowGrid}>
                  <span style={styles.rowLabel}>Redeemed</span>
                  <p style={styles.valueText}>{formatUtcDateTime(unlimitedAccessStatus.redeemedAt)}</p>
                </div>
              ) : null}
            </div>
          )}

          {!isUnlimitedAccessLoading && unlimitedAccessStatus?.canRedeem ? (
            <form style={styles.form} onSubmit={(event) => void handleUnlimitedAccessRedeem(event)}>
              <div style={styles.singleRowGrid}>
                <label style={styles.rowLabel} htmlFor="account-unlimited-access-code">
                  Access code
                </label>
                <input
                  id="account-unlimited-access-code"
                  style={styles.input}
                  type="text"
                  value={unlimitedAccessCode}
                  onChange={(event) => setUnlimitedAccessCode(event.target.value)}
                  placeholder="Enter access code"
                  maxLength={200}
                  autoComplete="off"
                  required
                />
              </div>

              {unlimitedAccessError ? <p style={styles.errorText}>{unlimitedAccessError}</p> : null}
              {unlimitedAccessMessage ? <p style={styles.okText}>{unlimitedAccessMessage}</p> : null}

              <button
                type="submit"
                style={styles.submitButton}
                disabled={isRedeemingUnlimitedAccess || !unlimitedAccessCode.trim()}
              >
                {isRedeemingUnlimitedAccess ? "..." : "Redeem code"}
              </button>
            </form>
          ) : null}

          {!isUnlimitedAccessLoading && !unlimitedAccessStatus?.canRedeem && unlimitedAccessError ? (
            <p style={styles.errorText}>{unlimitedAccessError}</p>
          ) : null}
          {!isUnlimitedAccessLoading && !unlimitedAccessStatus?.canRedeem && unlimitedAccessMessage ? (
            <p style={styles.okText}>{unlimitedAccessMessage}</p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--bg)",
    padding: "24px 16px 48px",
  },
  shell: {
    width: "100%",
    maxWidth: "520px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  card: {
    width: "100%",
    borderRadius: "18px",
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    boxShadow: "var(--shadow)",
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
  sectionHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
  },
  sectionHeaderText: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  title: {
    margin: 0,
    fontSize: "1.15rem",
    lineHeight: 1.1,
    color: "var(--text-soft)",
  },
  sectionText: {
    margin: 0,
    fontSize: "0.88rem",
    lineHeight: 1.45,
    color: "var(--muted)",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    paddingTop: "2px",
  },
  detailList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
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
    color: "var(--muted-strong)",
    fontWeight: 600,
  },
  valueText: {
    margin: 0,
    fontSize: "0.9rem",
    lineHeight: 1.45,
    color: "var(--text-soft)",
  },
  helperText: {
    margin: 0,
    fontSize: "0.84rem",
    lineHeight: 1.4,
    color: "var(--muted)",
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
    alignSelf: "flex-end",
    border: 0,
    borderRadius: "10px",
    background: "var(--surface-contrast)",
    color: "#fff",
    padding: "10px 14px",
    fontSize: "0.94rem",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  linkButton: {
    border: "1px solid var(--border)",
    borderRadius: "10px",
    background: "var(--surface-2)",
    color: "var(--text-soft)",
    padding: "8px 10px",
    fontSize: "0.84rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  statusPill: {
    flexShrink: 0,
    borderRadius: "999px",
    padding: "6px 10px",
    fontSize: "0.78rem",
    lineHeight: 1,
    fontWeight: 700,
    border: "1px solid transparent",
  },
  statusPillActive: {
    background: "rgba(44, 138, 87, 0.12)",
    borderColor: "rgba(44, 138, 87, 0.3)",
    color: "var(--success)",
  },
  statusPillAvailable: {
    background: "rgba(73, 112, 212, 0.12)",
    borderColor: "rgba(73, 112, 212, 0.24)",
    color: "var(--text-soft)",
  },
  statusPillExpired: {
    background: "rgba(148, 163, 184, 0.12)",
    borderColor: "rgba(148, 163, 184, 0.22)",
    color: "var(--muted-strong)",
  },
  errorText: {
    margin: 0,
    fontSize: "0.84rem",
    lineHeight: 1.4,
    color: "var(--danger)",
  },
  okText: {
    margin: 0,
    fontSize: "0.84rem",
    lineHeight: 1.4,
    color: "var(--success)",
  },
};
