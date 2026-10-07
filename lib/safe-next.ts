/** Only allow in-site relative paths as post-login destinations. */
export function safeNext(raw: string | null | undefined, origin?: string): string {
  if (!raw) return "/";
  try {
    if (raw.startsWith("http")) {
      const u = new URL(raw);
      if (origin && u.origin !== origin) return "/";
      raw = u.pathname + u.search;
    }
  } catch {
    return "/";
  }
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}
