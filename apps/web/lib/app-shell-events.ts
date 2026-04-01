const LOCAL_SESSION_HISTORY_UPDATED_EVENT = "prof:local-session-history-updated";
const COURSE_LIBRARY_UPDATED_EVENT = "prof:course-library-updated";

function dispatchBrowserEvent(type: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(type));
}

export function notifyLocalSessionHistoryUpdated() {
  dispatchBrowserEvent(LOCAL_SESSION_HISTORY_UPDATED_EVENT);
}

export function notifyCourseLibraryUpdated() {
  dispatchBrowserEvent(COURSE_LIBRARY_UPDATED_EVENT);
}

export { COURSE_LIBRARY_UPDATED_EVENT, LOCAL_SESSION_HISTORY_UPDATED_EVENT };
