import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchDictionary,
  saveDictionary,
  fetchClientContext,
  saveClientContext,
  fetchOntology,
} from "../src/utils/projectMemory";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("projectMemory client — dictionary", () => {
  it("fetchDictionary resolves with terms + is_v2_ontology on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            project_slug: "mankassa-app",
            terms: { Русклимат: "Русклимат (поставщик)" },
            is_v2_ontology: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(fetchDictionary("mankassa-app")).resolves.toEqual({
      project_slug: "mankassa-app",
      terms: { Русклимат: "Русклимат (поставщик)" },
      is_v2_ontology: true,
    });
  });

  it("fetchDictionary throws a friendly message for 404 (unconfigured project)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: "Project 'bogus' is not configured" }), {
          status: 404,
        }),
      ),
    );
    await expect(fetchDictionary("bogus")).rejects.toThrow(/не настроен/);
    await expect(fetchDictionary("bogus")).rejects.toThrow(/not configured/);
  });

  it("saveDictionary sends { terms } and resolves with the updated response", async () => {
    let sentBody: unknown = null;
    let sentMethod = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        sentMethod = init?.method ?? "";
        sentBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            project_slug: "Sewing-ERP",
            terms: { Швея: "швея-мотористка" },
            is_v2_ontology: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const result = await saveDictionary("Sewing-ERP", { Швея: "швея-мотористка" });

    expect(sentMethod).toBe("PUT");
    expect(sentBody).toEqual({ terms: { Швея: "швея-мотористка" } });
    expect(result).toEqual({
      project_slug: "Sewing-ERP",
      terms: { Швея: "швея-мотористка" },
      is_v2_ontology: false,
    });
  });

  it("saveDictionary throws a friendly, actionable message for 409 (v2 ontology project)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            detail: "Project 'mankassa-app' uses a v2 ontology; flat-terms write is not supported",
          }),
          { status: 409 },
        ),
      ),
    );
    await expect(saveDictionary("mankassa-app", { a: "b" })).rejects.toThrow(
      /расширенная онтология \(v2\)/,
    );
    await expect(saveDictionary("mankassa-app", { a: "b" })).rejects.toThrow(
      /flat-terms write is not supported/,
    );
  });

  it("saveDictionary throws a friendly message for 404 (unconfigured project)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: "Project 'bogus' is not configured" }), {
          status: 404,
        }),
      ),
    );
    await expect(saveDictionary("bogus", {})).rejects.toThrow(/не настроен/);
  });
});

describe("projectMemory client — client_context", () => {
  it("fetchClientContext resolves with content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ project_slug: "moliyakg", content: "# Клиент\n\nКонтекст проекта" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    await expect(fetchClientContext("moliyakg")).resolves.toEqual({
      project_slug: "moliyakg",
      content: "# Клиент\n\nКонтекст проекта",
    });
  });

  it("fetchClientContext throws a friendly message for 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: "Project 'bogus' is not configured" }), {
          status: 404,
        }),
      ),
    );
    await expect(fetchClientContext("bogus")).rejects.toThrow(/не настроен/);
  });

  it("saveClientContext sends { content } via PUT and resolves with the updated response", async () => {
    let sentBody: unknown = null;
    let sentMethod = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        sentMethod = init?.method ?? "";
        sentBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({ project_slug: "moliyakg", content: "# Обновлённый контекст" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const result = await saveClientContext("moliyakg", "# Обновлённый контекст");

    expect(sentMethod).toBe("PUT");
    expect(sentBody).toEqual({ content: "# Обновлённый контекст" });
    expect(result).toEqual({ project_slug: "moliyakg", content: "# Обновлённый контекст" });
  });
});

describe("projectMemory client — ontology", () => {
  it("fetchOntology resolves with the serialized DomainOntology", async () => {
    const ontology = {
      version: "2",
      domain: "accounting",
      flat_terms: {},
      categories: { products: [{ canonical: "СЗВ-М", stt_variants: ["эсзэвэм"] }] },
      people: [{ name: "Иван", role: "директор", aliases: ["Ваня"] }],
      business_entities: [{ canonical: "Русклимат", stt_variants: ["рус климат"] }],
      business_processes: ["закрытие месяца"],
      pain_signals: ["долгое согласование"],
      speech_act_markers: { commitment: ["сделаю", "берём в работу"] },
      client_meta: {
        primary_currency: "RUB",
        industry: "climate equipment",
        accounting_systems_used: ["1C"],
      },
      known_pain_points: ["ручной ввод накладных"],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ project_slug: "mankassa-app", ontology }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(fetchOntology("mankassa-app")).resolves.toEqual({
      project_slug: "mankassa-app",
      ontology,
    });
  });

  it("fetchOntology throws a friendly message for 404 (unconfigured project)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: "Project 'bogus' is not configured" }), {
          status: 404,
        }),
      ),
    );
    await expect(fetchOntology("bogus")).rejects.toThrow(/не настроен/);
  });
});
