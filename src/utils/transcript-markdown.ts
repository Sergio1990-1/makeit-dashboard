/** Shared markdown utilities for transcript components. */

import DOMPurify from "dompurify";
import { marked } from "marked";

const SANITIZE_OPTS = { ADD_TAGS: ["mark" as const], ADD_ATTR: ["class"] };

/** Highlight [неразборчиво: ...] and [противоречие: ...] markers in raw HTML. */
export function highlightMarkers(html: string): string {
  return html
    .replace(
      /\[неразборчиво:[^\]]*\]/gi,
      (m) => `<mark class="tpc-marker tpc-marker--unclear">${m}</mark>`,
    )
    .replace(
      /\[противоречие:[^\]]*\]/gi,
      (m) => `<mark class="tpc-marker tpc-marker--conflict">${m}</mark>`,
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
