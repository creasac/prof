export function buildProfileHref(username: string) {
  return `/@${encodeURIComponent(username)}`;
}

export function buildSettingsHref() {
  return "/settings/profile";
}
