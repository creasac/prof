"use client";

import type { CourseSummary, LearnSessionSummary } from "@prof/contracts";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { buildCourseHref } from "../lib/course-route";
import { buildLearnHref } from "../lib/learn-route";
import { loadRemoteLearnSessionSummaries } from "../lib/learn-session-api";
import { listLocalLearnSessionSummaries } from "../lib/learn-session";
import { loadProfile } from "../lib/profile-api";
import { authClient } from "../lib/auth-client";
import { COURSE_LIBRARY_UPDATED_EVENT, LOCAL_SESSION_HISTORY_UPDATED_EVENT } from "../lib/app-shell-events";
import { buildProfileHref } from "../lib/profile-route";
import { AuthDock } from "./AuthDock";
import { Icon } from "./TutorUi";

const DESKTOP_MEDIA_QUERY = "(min-width: 960px)";
const DRAWER_WIDTH = 296;
const DRAWER_RAIL_WIDTH = 62;
const DESKTOP_CONTENT_OFFSET = DRAWER_WIDTH + 18;
const DESKTOP_RAIL_OFFSET = DRAWER_RAIL_WIDTH + 16;
const MOBILE_CONTENT_OFFSET = DRAWER_RAIL_WIDTH + 10;

function getSessionUsername(session: ReturnType<typeof authClient.useSession>["data"]) {
  if (!session?.user || !("username" in session.user)) {
    return "";
  }

  return typeof session.user.username === "string" ? session.user.username : "";
}

function getAvatarLabel(username: string) {
  return username.trim().charAt(0).toUpperCase() || "?";
}

function compareIsoDatesDesc(left: string, right: string) {
  return Date.parse(right) - Date.parse(left);
}

function mergeSessionHistory(entries: LearnSessionSummary[]) {
  const merged = new Map<string, LearnSessionSummary>();

  for (const entry of entries) {
    const current = merged.get(entry.sessionId);
    if (!current || compareIsoDatesDesc(current.updatedAt, entry.updatedAt) > 0) {
      merged.set(entry.sessionId, entry);
    }
  }

  return Array.from(merged.values()).sort((left, right) => compareIsoDatesDesc(left.updatedAt, right.updatedAt));
}

function formatHistoryTimestamp(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: authSession } = authClient.useSession();
  const [isDesktop, setIsDesktop] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCoursesOpen, setIsCoursesOpen] = useState(true);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [sessionHistory, setSessionHistory] = useState<LearnSessionSummary[]>([]);
  const [isCoursesLoading, setIsCoursesLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isSignOutMenuOpen, setIsSignOutMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const sessionUsername = getSessionUsername(authSession);
  const profileHref = sessionUsername ? buildProfileHref(sessionUsername) : "";
  const remoteHistoryRef = useRef<LearnSessionSummary[]>([]);
  const hasInitializedDrawerRef = useRef(false);
  const authUserIdRef = useRef<string | null>(authSession?.user?.id ?? null);
  const sessionUsernameRef = useRef(sessionUsername);
  const signOutMenuRef = useRef<HTMLDivElement | null>(null);

  authUserIdRef.current = authSession?.user?.id ?? null;
  sessionUsernameRef.current = sessionUsername;

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);

    const syncViewport = () => {
      const nextIsDesktop = mediaQuery.matches;
      setIsDesktop(nextIsDesktop);
      setIsDrawerOpen((current) => {
        if (!hasInitializedDrawerRef.current) {
          hasInitializedDrawerRef.current = true;
          return nextIsDesktop;
        }

        if (!nextIsDesktop) {
          return false;
        }

        return current;
      });
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => {
      mediaQuery.removeEventListener("change", syncViewport);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDrawerData() {
      setIsCoursesLoading(Boolean(authSession?.user?.id && sessionUsername));
      setIsHistoryLoading(true);
      setCoursesError(null);
      setHistoryError(null);

      const localEntries = listLocalLearnSessionSummaries();
      let remoteEntries: LearnSessionSummary[] = [];
      let nextCourses: CourseSummary[] = [];
      let nextHistoryError: string | null = null;
      let nextCoursesError: string | null = null;

      if (authSession?.user?.id) {
        try {
          remoteEntries = await loadRemoteLearnSessionSummaries({
            cacheKey: authSession.user.id,
          });
        } catch (error) {
          nextHistoryError = toErrorMessage(error, "Failed to load saved learn sessions.");
        }
      }

      if (authSession?.user?.id && sessionUsername) {
        try {
          const profile = await loadProfile(sessionUsername);
          nextCourses = profile?.courses ?? [];
        } catch (error) {
          nextCoursesError = toErrorMessage(error, "Failed to load saved courses.");
        }
      }

      if (cancelled) {
        return;
      }

      remoteHistoryRef.current = remoteEntries;
      setSessionHistory(mergeSessionHistory([...remoteEntries, ...localEntries]));
      setHistoryError(nextHistoryError);
      setIsHistoryLoading(false);
      setCourses(nextCourses);
      setCoursesError(nextCoursesError);
      setIsCoursesLoading(false);
    }

    void loadDrawerData();

    return () => {
      cancelled = true;
    };
  }, [authSession?.user?.id, sessionUsername]);

  useEffect(() => {
    const handleLocalHistoryUpdated = () => {
      setSessionHistory(mergeSessionHistory([...remoteHistoryRef.current, ...listLocalLearnSessionSummaries()]));
    };

    const handleCourseLibraryUpdated = () => {
      const userId = authUserIdRef.current;
      const username = sessionUsernameRef.current;

      if (!userId || !username) {
        setCourses([]);
        setCoursesError(null);
        setIsCoursesLoading(false);
        return;
      }

      setIsCoursesLoading(true);
      setCoursesError(null);

      void loadProfile(username)
        .then((profile) => {
          setCourses(profile?.courses ?? []);
        })
        .catch((error) => {
          setCoursesError(toErrorMessage(error, "Failed to load saved courses."));
        })
        .finally(() => {
          setIsCoursesLoading(false);
        });
    };

    window.addEventListener(LOCAL_SESSION_HISTORY_UPDATED_EVENT, handleLocalHistoryUpdated);
    window.addEventListener(COURSE_LIBRARY_UPDATED_EVENT, handleCourseLibraryUpdated);

    return () => {
      window.removeEventListener(LOCAL_SESSION_HISTORY_UPDATED_EVENT, handleLocalHistoryUpdated);
      window.removeEventListener(COURSE_LIBRARY_UPDATED_EVENT, handleCourseLibraryUpdated);
    };
  }, []);

  useEffect(() => {
    if (!isSignOutMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!signOutMenuRef.current?.contains(event.target as Node)) {
        setIsSignOutMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isSignOutMenuOpen]);

  const drawerOffset = isDesktop
    ? isDrawerOpen
      ? DESKTOP_CONTENT_OFFSET
      : DESKTOP_RAIL_OFFSET
    : MOBILE_CONTENT_OFFSET;
  const isHomePage = pathname === "/";
  const isExplorePage = pathname === "/explore";
  const isProfilePage = Boolean(profileHref) && pathname === profileHref;

  function closeDrawerIfNeeded() {
    if (!isDesktop) {
      setIsDrawerOpen(false);
    }
  }

  function navigateToHome() {
    if (isHomePage) {
      closeDrawerIfNeeded();
      return;
    }

    closeDrawerIfNeeded();
    router.push("/");
  }

  function openCourse(course: CourseSummary) {
    closeDrawerIfNeeded();
    router.push(
      buildCourseHref({
        username: course.ownerUsername,
        courseSlug: course.courseSlug,
      }),
    );
  }

  function openHistoryEntry(entry: LearnSessionSummary) {
    closeDrawerIfNeeded();
    router.push(
      buildLearnHref({
        sessionId: entry.sessionId,
        courseOwnerUsername: null,
        courseSlug: null,
        goal: "",
        preferredBlockType: "",
        useWebSearch: false,
        autoStartAction: null,
      }),
    );
  }

  function navigateToExplore() {
    if (isExplorePage) {
      closeDrawerIfNeeded();
      return;
    }

    closeDrawerIfNeeded();
    router.push("/explore");
  }

  function isCourseActive(course: CourseSummary) {
    const courseHref = buildCourseHref({
      username: course.ownerUsername,
      courseSlug: course.courseSlug,
    });

    return pathname === courseHref || pathname.startsWith(`${courseHref}/quiz/`);
  }

  function isHistoryEntryActive(entry: LearnSessionSummary) {
    const learnHref = buildLearnHref({
      sessionId: entry.sessionId,
      courseOwnerUsername: null,
      courseSlug: null,
      goal: "",
      preferredBlockType: "",
      useWebSearch: false,
      autoStartAction: null,
    });

    return pathname === learnHref || pathname.startsWith(`${learnHref}/quiz`);
  }

  async function handleSignOut() {
    setIsSigningOut(true);

    try {
      const result = await authClient.signOut();
      if (result.error) {
        return;
      }

      setIsSignOutMenuOpen(false);
      closeDrawerIfNeeded();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <>
      {!isDesktop && isDrawerOpen ? (
        <button
          type="button"
          aria-label="Close navigation drawer"
          onClick={() => setIsDrawerOpen(false)}
          style={styles.backdrop}
        />
      ) : null}

      <aside
        style={{
          ...styles.drawer,
          width: isDrawerOpen ? DRAWER_WIDTH : DRAWER_RAIL_WIDTH,
          ...(isDrawerOpen ? styles.drawerOpen : styles.drawerClosed),
        }}
      >
        {isDrawerOpen ? (
          <>
            <div style={styles.drawerHeader}>
              <Link
                href="/"
                aria-label="prof."
                style={styles.brandLink}
                onClick={() => {
                  closeDrawerIfNeeded();
                }}
              >
                <Image src="/icon.png" alt="prof." width={40} height={40} style={styles.brandIcon} priority />
              </Link>

              <button
                type="button"
                aria-label="Close navigation drawer"
                onClick={() => setIsDrawerOpen(false)}
                style={styles.toggleButton}
              >
                <Icon name="menu" size={20} />
              </button>
            </div>

            <div style={styles.drawerBody}>
              <div style={styles.primaryActions}>
                <button
                  type="button"
                  onClick={navigateToHome}
                  style={{
                    ...styles.learnButton,
                    ...(isHomePage ? styles.learnButtonActive : null),
                  }}
                  aria-current={isHomePage ? "page" : undefined}
                >
                  <span style={styles.buttonIconWrap}>
                    <Icon name="plus" size={17} />
                  </span>
                  <span>learn something new</span>
                </button>

                <button
                  type="button"
                  onClick={navigateToExplore}
                  style={{
                    ...styles.learnButton,
                    ...(isExplorePage ? styles.learnButtonActive : null),
                  }}
                  aria-current={isExplorePage ? "page" : undefined}
                >
                  <span style={styles.buttonIconWrap}>
                    <Icon name="search" size={16} />
                  </span>
                  <span>explore</span>
                </button>
              </div>

              <section style={styles.section}>
                <button
                  type="button"
                  onClick={() => setIsCoursesOpen((current) => !current)}
                  style={styles.sectionToggle}
                  aria-expanded={isCoursesOpen}
                >
                  <span>courses</span>
                  <Icon name={isCoursesOpen ? "chevronUp" : "chevronDown"} size={16} />
                </button>

                {isCoursesOpen ? (
                  <div style={styles.sectionBody}>
                    {coursesError ? <p style={styles.errorText}>{coursesError}</p> : null}
                    {isCoursesLoading ? (
                      <p style={styles.emptyText}>Loading courses...</p>
                    ) : courses.length === 0 ? (
                      <p style={styles.emptyText}>
                        {authSession?.user?.id ? "No saved courses yet." : "Sign in to see saved courses."}
                      </p>
                    ) : (
                      <div style={styles.list}>
                        {courses.map((course) => (
                          <button
                            key={course.courseId}
                            type="button"
                            onClick={() => openCourse(course)}
                            style={{
                              ...styles.listItem,
                              ...(isCourseActive(course) ? styles.listItemActive : null),
                            }}
                            aria-current={isCourseActive(course) ? "page" : undefined}
                          >
                            {course.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </section>

              <section style={styles.section}>
                <div style={styles.sectionHeading}>
                  <span>history</span>
                </div>

                <div style={styles.sectionBody}>
                  {historyError ? <p style={styles.errorText}>{historyError}</p> : null}
                  {isHistoryLoading ? (
                    <p style={styles.emptyText}>Loading history...</p>
                  ) : sessionHistory.length === 0 ? (
                    <p style={styles.emptyText}>Start a session and it will appear here.</p>
                  ) : (
                    <div style={styles.historyList}>
                      {sessionHistory.map((entry) => (
                        <button
                          key={entry.sessionId}
                          type="button"
                          onClick={() => openHistoryEntry(entry)}
                          style={{
                            ...styles.historyItem,
                            ...(isHistoryEntryActive(entry) ? styles.historyItemActive : null),
                          }}
                          aria-current={isHistoryEntryActive(entry) ? "page" : undefined}
                        >
                          <span style={styles.historyItemTitle}>{entry.title}</span>
                          <span style={styles.historyItemMeta}>{formatHistoryTimestamp(entry.updatedAt)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>

            {sessionUsername ? (
              <div style={styles.drawerFooter}>
                <div
                  ref={signOutMenuRef}
                  style={{
                    ...styles.profileLink,
                    ...(isProfilePage ? styles.profileLinkActive : null),
                  }}
                >
                  <Link
                    href={profileHref}
                    onClick={() => {
                      closeDrawerIfNeeded();
                    }}
                    style={styles.profileIdentity}
                    aria-label={`${sessionUsername} profile`}
                    aria-current={isProfilePage ? "page" : undefined}
                  >
                    <span style={styles.profileAvatar}>{getAvatarLabel(sessionUsername)}</span>
                    <span style={styles.profileUsername}>@{sessionUsername}</span>
                  </Link>

                  <div style={styles.profileActions}>
                    <button
                      type="button"
                      onClick={() => setIsSignOutMenuOpen((current) => !current)}
                      style={styles.profileActionButton}
                      aria-label="Open sign out menu"
                      aria-expanded={isSignOutMenuOpen}
                    >
                      <Icon name="logOut" size={17} />
                    </button>

                    {isSignOutMenuOpen ? (
                      <div style={styles.signOutMenu}>
                        <button
                          type="button"
                          onClick={() => void handleSignOut()}
                          style={styles.signOutMenuButton}
                          disabled={isSigningOut}
                        >
                          {isSigningOut ? "Signing out..." : "Sign out"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div style={styles.drawerRail}>
            <button
              type="button"
              aria-label="Open navigation drawer"
              onClick={() => setIsDrawerOpen(true)}
              style={styles.toggleButton}
            >
              <Icon name="menu" size={20} />
            </button>

            {sessionUsername ? (
              <Link
                href={profileHref}
                onClick={() => {
                  closeDrawerIfNeeded();
                }}
                style={{
                  ...styles.profileRailLink,
                  ...(isProfilePage ? styles.profileRailLinkActive : null),
                }}
                aria-label={`${sessionUsername} profile`}
                aria-current={isProfilePage ? "page" : undefined}
              >
                <span style={styles.profileAvatar}>{getAvatarLabel(sessionUsername)}</span>
              </Link>
            ) : null}
          </div>
        )}
      </aside>

      <div
        style={{
          ...styles.appFrame,
          paddingLeft: drawerOffset,
        }}
      >
        <AuthDock />
        {children}
      </div>
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  appFrame: {
    minHeight: "100vh",
    transition: "padding-left 180ms ease",
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 44,
    border: 0,
    background: "rgba(33, 20, 13, 0.16)",
    padding: 0,
    cursor: "pointer",
  },
  drawer: {
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    zIndex: 45,
    borderRight: "1px solid rgba(94, 73, 61, 0.14)",
    background: "rgba(255, 250, 245, 0.94)",
    boxShadow: "0 20px 48px rgba(73, 35, 14, 0.12)",
    backdropFilter: "blur(18px)",
    overflow: "hidden",
    transition: "width 180ms ease, box-shadow 180ms ease",
  },
  drawerOpen: {
    display: "flex",
    flexDirection: "column",
  },
  drawerClosed: {
    display: "flex",
    flexDirection: "column",
  },
  drawerRail: {
    width: "100%",
    flex: 1,
    padding: "14px 10px 16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
  },
  drawerHeader: {
    padding: "14px 14px 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    borderBottom: "1px solid rgba(94, 73, 61, 0.1)",
  },
  brandLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
  },
  brandIcon: {
    width: "50px",
    height: "auto",
  },
  drawerBody: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "12px 10px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  drawerFooter: {
    padding: "8px 10px 16px",
    borderTop: "1px solid rgba(94, 73, 61, 0.1)",
  },
  primaryActions: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  toggleButton: {
    width: "36px",
    height: "36px",
    borderRadius: "10px",
    border: "1px solid rgba(94, 73, 61, 0.12)",
    background: "rgba(255, 255, 255, 0.9)",
    color: "var(--text)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(73, 35, 14, 0.08)",
  },
  learnButton: {
    width: "100%",
    border: "1px solid rgba(138, 55, 21, 0.12)",
    borderRadius: "16px",
    background: "linear-gradient(135deg, rgba(255, 246, 239, 0.96), rgba(255, 255, 255, 0.94))",
    color: "var(--text)",
    padding: "11px 13px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    cursor: "pointer",
    textAlign: "left",
    fontSize: "0.94rem",
    fontWeight: 600,
    letterSpacing: "-0.01em",
  },
  learnButtonActive: {
    borderColor: "rgba(138, 55, 21, 0.2)",
    background: "linear-gradient(135deg, rgba(255, 238, 226, 0.98), rgba(255, 248, 242, 0.96))",
    color: "var(--accent-strong)",
  },
  buttonIconWrap: {
    width: "24px",
    height: "24px",
    borderRadius: "8px",
    background: "rgba(191, 91, 44, 0.12)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--accent-strong)",
    flexShrink: 0,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  sectionHeading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 4px",
    color: "#5e493d",
    fontSize: "0.8rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  sectionToggle: {
    width: "100%",
    border: 0,
    background: "transparent",
    padding: "0 4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    color: "#5e493d",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  sectionBody: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  listItem: {
    width: "100%",
    border: "1px solid transparent",
    borderRadius: "12px",
    background: "transparent",
    color: "var(--text)",
    padding: "8px 10px",
    cursor: "pointer",
    textAlign: "left",
    fontSize: "0.9rem",
    lineHeight: 1.35,
  },
  listItemActive: {
    borderColor: "rgba(138, 55, 21, 0.14)",
    background: "rgba(255, 244, 234, 0.94)",
    color: "var(--accent-strong)",
  },
  historyList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  historyItem: {
    width: "100%",
    border: "1px solid transparent",
    borderRadius: "14px",
    background: "rgba(255, 255, 255, 0.52)",
    padding: "9px 10px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    cursor: "pointer",
    textAlign: "left",
  },
  historyItemActive: {
    borderColor: "rgba(138, 55, 21, 0.14)",
    background: "rgba(255, 244, 234, 0.94)",
  },
  historyItemTitle: {
    color: "var(--text)",
    fontSize: "0.89rem",
    fontWeight: 600,
    lineHeight: 1.3,
  },
  historyItemMeta: {
    color: "var(--muted)",
    fontSize: "0.74rem",
    lineHeight: 1.3,
  },
  emptyText: {
    margin: 0,
    padding: "0 4px",
    color: "var(--muted)",
    fontSize: "0.86rem",
    lineHeight: 1.45,
  },
  errorText: {
    margin: 0,
    padding: "0 4px",
    color: "#a22e2e",
    fontSize: "0.8rem",
    lineHeight: 1.45,
  },
  profileLink: {
    width: "100%",
    borderRadius: "16px",
    border: "1px solid transparent",
    background: "rgba(255, 255, 255, 0.58)",
    minHeight: "42px",
    padding: "2px 0 2px 2px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  profileLinkActive: {
    borderColor: "rgba(138, 55, 21, 0.14)",
    background: "rgba(255, 244, 234, 0.94)",
  },
  profileRailLink: {
    textDecoration: "none",
    borderRadius: "999px",
    border: "1px solid transparent",
    padding: "2px",
  },
  profileRailLinkActive: {
    borderColor: "rgba(138, 55, 21, 0.2)",
    background: "rgba(255, 244, 234, 0.9)",
  },
  profileAvatar: {
    width: "38px",
    height: "38px",
    borderRadius: "999px",
    border: "1px solid rgba(94, 73, 61, 0.16)",
    background: "#5e493d",
    color: "#fff7f2",
    display: "grid",
    placeItems: "center",
    fontSize: "0.92rem",
    fontWeight: 700,
    letterSpacing: "0.01em",
    flexShrink: 0,
  },
  profileIdentity: {
    minWidth: 0,
    flex: 1,
    color: "var(--text)",
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    paddingRight: "8px",
  },
  profileUsername: {
    minWidth: 0,
    fontSize: "0.92rem",
    fontWeight: 600,
    lineHeight: 1.3,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  profileActions: {
    position: "relative",
    flexShrink: 0,
  },
  profileActionButton: {
    width: "34px",
    height: "34px",
    borderRadius: "10px",
    border: "1px solid rgba(94, 73, 61, 0.12)",
    background: "rgba(255, 255, 255, 0.9)",
    color: "#5e493d",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  signOutMenu: {
    position: "absolute",
    right: 0,
    bottom: "calc(100% + 8px)",
    minWidth: "116px",
    padding: "6px",
    borderRadius: "12px",
    border: "1px solid rgba(94, 73, 61, 0.14)",
    background: "rgba(255, 249, 243, 0.98)",
    boxShadow: "0 16px 36px rgba(73, 35, 14, 0.16)",
    backdropFilter: "blur(18px)",
  },
  signOutMenuButton: {
    width: "100%",
    border: 0,
    borderRadius: "8px",
    background: "transparent",
    color: "#8a3715",
    padding: "8px 10px",
    textAlign: "left",
    fontSize: "0.88rem",
    fontWeight: 600,
    cursor: "pointer",
  },
};
