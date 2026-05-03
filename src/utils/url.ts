// Tiny helper for rendering external URLs safely. React does NOT block
// `javascript:` / `data:` schemes in `href` — it warns, but still renders,
// and clicking executes the script. Wrap any user / API-controlled string
// before binding it to an anchor.
//
// Returns the normalised URL string when scheme is http(s), else `null`.
// Callers fall back to plain text in the null case.
export function safeHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    // ignore — URL constructor throws on malformed input
  }
  return null;
}
