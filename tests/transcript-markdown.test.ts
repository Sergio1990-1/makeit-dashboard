import { describe, expect, it } from "vitest";
import {
  classifyBlockquotes,
  highlightMarkers,
  renderBriefHtml,
} from "../src/utils/transcript-markdown";

describe("highlightMarkers", () => {
  it("wraps [неразборчиво: ...] in a mark with the unclear class", () => {
    const html = highlightMarkers('Клиент сказал [неразборчиво: возможно "да"].');
    expect(html).toContain('<mark class="tpc-marker tpc-marker--unclear">');
    expect(html).toContain("[неразборчиво:");
  });

  it("wraps [противоречие: ...] in a mark with the conflict class", () => {
    const html = highlightMarkers("[противоречие: вариант A, вариант B]");
    expect(html).toContain('<mark class="tpc-marker tpc-marker--conflict">');
  });
});

describe("classifyBlockquotes", () => {
  it("tags a blockquote starting with ⚠️ as tpc-quote--warn", () => {
    const html = classifyBlockquotes(
      "<blockquote>\n<p>⚠️ <strong>Противоречие (открытое):</strong> A vs B</p>\n</blockquote>",
    );
    expect(html).toContain('<blockquote class="tpc-quote--warn">');
  });

  it("tags a blockquote starting with ℹ️ as tpc-quote--info", () => {
    const html = classifyBlockquotes(
      "<blockquote>\n<p>ℹ️ <strong>Разрешённое противоречие:</strong> согласовано</p>\n</blockquote>",
    );
    expect(html).toContain('<blockquote class="tpc-quote--info">');
  });

  it("leaves a blockquote without a leading emoji unclassed", () => {
    const html = classifyBlockquotes("<blockquote>\n<p>Обычная цитата.</p>\n</blockquote>");
    expect(html).not.toContain("tpc-quote--warn");
    expect(html).not.toContain("tpc-quote--info");
    expect(html).toBe("<blockquote>\n<p>Обычная цитата.</p>\n</blockquote>");
  });
});

describe("renderBriefHtml — integration", () => {
  it("keeps the callout class through DOMPurify sanitization (not stripped)", () => {
    const md = "> ⚠️ **Противоречие (открытое):** вариант A против варианта B";
    const html = renderBriefHtml(md);
    // This is the real regression risk: DOMPurify's afterSanitizeAttributes
    // hook strips `class` from every element except an allowlisted set —
    // tightening that allowlist to include blockquote must not accidentally
    // drop the class it was widened FOR.
    expect(html).toContain('class="tpc-quote--warn"');
  });

  it("renders a markdown table as a real <table> with header cells", () => {
    const md = "| Пользователь | Сценарий |\n|---|---|\n| Кристина | Контроль |\n";
    const html = renderBriefHtml(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Пользователь</th>");
    expect(html).toContain("<td>Кристина</td>");
  });

  it("strips a disallowed class value while keeping the mark tag and its allowed class", () => {
    // The BRIEF source is LLM-generated transcript content, not sanitized
    // user input at the point it reaches here — a class value beyond our
    // own tpc-marker--*/tpc-quote--* set must never survive, even riding
    // along on an otherwise-legitimate <mark>. Inline raw HTML in the
    // markdown source (marked passes it through) is the realistic path,
    // not calling DOMPurify directly.
    const html = renderBriefHtml('<mark class="tpc-marker fake-phishing-badge">x</mark>');
    expect(html).toContain("<mark");
    expect(html).toContain("tpc-marker");
    expect(html).not.toContain("fake-phishing-badge");
  });
});
