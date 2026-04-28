/** Shared markdown utilities for transcript components. */

import DOMPurify from "dompurify";
import { marked } from "marked";

// Restrict the `class` attribute to <mark> only. Without this hook, every
// element passed by DOMPurify would keep `class` (we used to allow it
// globally), which lets attacker-controlled markdown inject arbitrary
// CSS classes — useful for visual spoofing (e.g. fake quality badge).
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName !== "MARK" && (node as Element).hasAttribute?.("class")) {
    (node as Element).removeAttribute("class");
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

/** Render markdown to sanitized HTML with highlighted markers. */
export function renderBriefHtml(markdown: string): string {
  const raw = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(highlightMarkers(raw), SANITIZE_OPTS);
}

/** Render markdown to sanitized HTML (no marker highlighting). */
export function renderMarkdownHtml(markdown: string): string {
  const raw = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}
