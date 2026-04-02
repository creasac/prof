import { createPublicId, normalizeGuestUsageId } from "@prof/contracts";

const GUEST_USAGE_ID_STORAGE_KEY = "prof.guest.usage.v1";

export function getGuestUsageId() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const existing = normalizeGuestUsageId(window.localStorage.getItem(GUEST_USAGE_ID_STORAGE_KEY));
    if (existing) {
      return existing;
    }

    const nextId = `guest_${createPublicId(24)}`;
    window.localStorage.setItem(GUEST_USAGE_ID_STORAGE_KEY, nextId);
    return nextId;
  } catch {
    return "";
  }
}
