/** Shared markdown utilities for transcript components. */

import DOMPurify from "dompurify";
import { marked } from "marked";

// Classes our own rendering pipeline ever generates, scoped to the one
// element each is actually emitted on. Both the element AND the class value
// must match — a class-value-only allowlist would let LLM-generated
// markdown (which can carry raw inline HTML that `marked` passes through
// untouched) spoof our marker/callout styling on an arbitrary <span> or
// <div>, e.g. faking a "resolved" info callout or a conflict marker on
// unrelated text.
const ALLOWED_CLASSES_BY_TAG: Record<string, Set<string>> = {
  MARK: new Set(["tpc-marker", "tpc-marker--unclear", "tpc-marker--conflict"]),
  BLOCKQUOTE: new Set(["tpc-quote--warn", "tpc-quote--info"]),
};

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  const el = node as Element;
  if (!el.hasAttribute?.("class")) return;
  const allowed = ALLOWED_CLASSES_BY_TAG[el.nodeName];
  const kept = allowed
    ? el.getAttribute("class")!.split(/\s+/).filter((c) => allowed.has(c))
    : [];
  if (kept.length) {
    el.setAttribute("class", kept.join(" "));
  } else {
    el.removeAttribute("class");
  }
});

const SANITIZE_OPTS = { ADD_TAGS: ["mark" as const], ADD_ATTR: ["class"] };

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Highlight [неразборчиво: ...] and [противоречие: ...] markers in raw HTML. */
export function highlightMarkers(html: string): string {
  // The match text comes from the LLM-generated transcript and is
  // interpolated into a <mark> tag. Escape it before insertion so this
  // function is safe regardless of where it sits in the call chain
  // (defence-in-depth — DOMPurify still runs after, but order changes
  // shouldn't open an XSS hole).
  return html
    .replace(
      /\[неразборчиво:[^\]]*\]/gi,
      (m) => `<mark class="tpc-marker tpc-marker--unclear">${escapeHtml(m)}</mark>`,
    )
    .replace(
      /\[противоречие:[^\]]*\]/gi,
      (m) => `<mark class="tpc-marker tpc-marker--conflict">${escapeHtml(m)}</mark>`,
    );
}

/** Tag a <blockquote>'s leading emoji as a semantic callout type — an open
 *  contradiction ("⚠️ Противоречие (открытое): ...") and a call-resolved
 *  note ("ℹ️ Разрешённое противоречие: ...") are opposite in meaning
 *  (problem vs. already solved) and should not look identical. Blockquotes
 *  without either marker are left unclassed (ordinary de-emphasized quote). */
export function classifyBlockquotes(html: string): string {
  return html.replace(
    /<blockquote>(\s*<p>\s*)(⚠️?|ℹ️?)/g,
    (match: string, prefix: string, emoji: string) => {
      if (emoji.startsWith("⚠")) {
        return `<blockquote class="tpc-quote--warn">${prefix}${emoji}`;
      }
      if (emoji.startsWith("ℹ")) {
        return `<blockquote class="tpc-quote--info">${prefix}${emoji}`;
      }
      return match;
    },
  );
}

/** Render markdown to sanitized HTML with highlighted markers. */
export function renderBriefHtml(markdown: string): string {
  const raw = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(classifyBlockquotes(highlightMarkers(raw)), SANITIZE_OPTS);
}

/** Render markdown to sanitized HTML (no marker highlighting). */
export function renderMarkdownHtml(markdown: string): string {
  const raw = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}
