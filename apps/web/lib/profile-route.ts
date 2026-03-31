export function buildProfileHref(username: string) {
  return `/@${encodeURIComponent(username)}`;
}
