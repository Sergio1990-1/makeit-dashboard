import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { ProjectMemoryView } from "../src/components/v4/projectmemory/ProjectMemoryView";
import type { ProjectConfig } from "../src/types";
import type {
  DictionaryResponse,
  ClientContextResponse,
  OntologyResponse,
} from "../src/utils/projectMemory";

const PROJECTS: ProjectConfig[] = [
  { repo: "Sewing-ERP", client: "Свой проект", owner: "Sergio1990-1", budget: 0, paid: 0 },
  { repo: "mankassa-app", client: "Сергей", owner: "Sergio1990-1", budget: 0, paid: 0 },
];

function dictResponse(overrides: Partial<DictionaryResponse> = {}): DictionaryResponse {
  return {
    project_slug: "Sewing-ERP",
    terms: { Швея: "швея-мотористка" },
    is_v2_ontology: false,
    ...overrides,
  };
}

function contextResponse(overrides: Partial<ClientContextResponse> = {}): ClientContextResponse {
  return {
    project_slug: "Sewing-ERP",
    content: "# Клиент\n\nШвейный цех",
    ...overrides,
  };
}

function ontologyResponse(overrides: Partial<OntologyResponse["ontology"]> = {}): OntologyResponse {
  return {
    project_slug: "Sewing-ERP",
    ontology: {
      version: "1",
      domain: null,
      flat_terms: {},
      categories: {},
      people: [],
      business_entities: [],
      business_processes: [],
      pain_signals: [],
      speech_act_markers: {},
      client_meta: null,
      known_pain_points: [],
      ...overrides,
    },
  };
}

/** Stubs `fetch` to route GET/PUT for the 3 endpoints this view calls, driven
 *  by small per-test overrides so each test only specifies what it cares
 *  about. Mirrors the routing-stub style already used across this repo's
 *  view-level tests where multiple endpoints are hit on mount. */
function stubFetch(opts: {
  dictionary?: DictionaryResponse | { status: number; detail: string };
  clientContext?: ClientContextResponse | { status: number; detail: string };
  ontology?: OntologyResponse | { status: number; detail: string };
  onPutDictionary?: (body: unknown) => DictionaryResponse | { status: number; detail: string };
  onPutContext?: (body: unknown) => ClientContextResponse;
}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url.includes("/dictionary")) {
      if (method === "PUT" && opts.onPutDictionary) {
        const body = JSON.parse(String(init?.body));
        const result = opts.onPutDictionary(body);
        if ("status" in result) {
          return new Response(JSON.stringify({ detail: result.detail }), { status: result.status });
        }
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      const d = opts.dictionary ?? dictResponse();
      if ("status" in d) return new Response(JSON.stringify({ detail: d.detail }), { status: d.status });
      return new Response(JSON.stringify(d), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/client-context")) {
      if (method === "PUT" && opts.onPutContext) {
        const body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify(opts.onPutContext(body)), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      const c = opts.clientContext ?? contextResponse();
      if ("status" in c) return new Response(JSON.stringify({ detail: c.detail }), { status: c.status });
      return new Response(JSON.stringify(c), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/ontology")) {
      const o = opts.ontology ?? ontologyResponse();
      if ("status" in o) return new Response(JSON.stringify({ detail: o.detail }), { status: o.status });
      return new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ProjectMemoryView — dictionary", () => {
  it("renders curated terms for the selected project", async () => {
    stubFetch({ dictionary: dictResponse({ terms: { Русклимат: "поставщик Русклимат" } }) });
    render(<ProjectMemoryView projects={PROJECTS} />);

    await waitFor(() => expect(screen.getByText("Русклимат")).toBeTruthy());
    expect(screen.getByText("поставщик Русклимат")).toBeTruthy();
  });

  it("adds a new term via the add-term form", async () => {
    let currentTerms: Record<string, string> = {};
    stubFetch({
      dictionary: dictResponse({ terms: {} }),
      onPutDictionary: (body) => {
        currentTerms = (body as { terms: Record<string, string> }).terms;
        return dictResponse({ terms: currentTerms });
      },
    });
    render(<ProjectMemoryView projects={PROJECTS} />);

    await waitFor(() => expect(screen.getByText("Термины ещё не добавлены")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Новый термин"), { target: { value: "Русклимат" } });
    fireEvent.change(screen.getByLabelText("Значение нового термина"), {
      target: { value: "поставщик Русклимат" },
    });
    fireEvent.click(screen.getByText("Добавить"));

    await waitFor(() => expect(screen.getByText("Русклимат")).toBeTruthy());
    expect(currentTerms).toEqual({ Русклимат: "поставщик Русклимат" });
  });

  it("edits an existing term in place", async () => {
    let currentTerms: Record<string, string> = { Швея: "швея-мотористка" };
    stubFetch({
      dictionary: dictResponse({ terms: currentTerms }),
      onPutDictionary: (body) => {
        currentTerms = (body as { terms: Record<string, string> }).terms;
        return dictResponse({ terms: currentTerms });
      },
    });
    render(<ProjectMemoryView projects={PROJECTS} />);

    await waitFor(() => expect(screen.getByText("Швея")).toBeTruthy());
    fireEvent.click(screen.getByText("Редактировать"));

    const input = screen.getByLabelText("Значение для Швея");
    fireEvent.change(input, { target: { value: "швея (обновлено)" } });
    // "Сохранить" also labels the client_context panel's save button — scope
    // to the enabled one (the dictionary row's save button, since the
    // client_context textarea hasn't been touched in this test).
    const saveButtons = screen.getAllByText("Сохранить");
    const rowSave = saveButtons.find((b) => !(b as HTMLButtonElement).disabled);
    fireEvent.click(rowSave!);

    await waitFor(() => expect(screen.getByText("швея (обновлено)")).toBeTruthy());
    expect(currentTerms).toEqual({ Швея: "швея (обновлено)" });
  });

  it("deletes a term", async () => {
    let currentTerms: Record<string, string> = { Швея: "швея-мотористка" };
    stubFetch({
      dictionary: dictResponse({ terms: currentTerms }),
      onPutDictionary: (body) => {
        currentTerms = (body as { terms: Record<string, string> }).terms;
        return dictResponse({ terms: currentTerms });
      },
    });
    render(<ProjectMemoryView projects={PROJECTS} />);

    await waitFor(() => expect(screen.getByText("Швея")).toBeTruthy());
    fireEvent.click(screen.getByText("Удалить"));

    await waitFor(() => expect(screen.getByText("Термины ещё не добавлены")).toBeTruthy());
    expect(currentTerms).toEqual({});
  });

  it("disables add/edit/delete and shows an explanatory note when is_v2_ontology is true", async () => {
    stubFetch({
      dictionary: dictResponse({
        terms: { Русклимат: "поставщик Русклимат" },
        is_v2_ontology: true,
      }),
    });
    render(<ProjectMemoryView projects={PROJECTS} />);

    await waitFor(() => expect(screen.getByText("Русклимат")).toBeTruthy());
    expect(
      screen.getByText(/расширенная онтология \(v2\)/),
    ).toBeTruthy();
    expect(screen.queryByText("Добавить")).toBeNull();
    expect(screen.queryByText("Редактировать")).toBeNull();
    expect(screen.queryByText("Удалить")).toBeNull();
    expect(screen.getByText("v2 онтология")).toBeTruthy();
  });

  it("shows the 409 backend detail inline (not a crash) when saving is rejected for a v2-ontology project", async () => {
    stubFetch({
      dictionary: dictResponse({ terms: {}, is_v2_ontology: false }),
      onPutDictionary: () => ({
        status: 409,
        detail: "Project 'mankassa-app' uses a v2 ontology; flat-terms write is not supported",
      }),
    });
    render(<ProjectMemoryView projects={PROJECTS} />);

    await waitFor(() => expect(screen.getByText("Термины ещё не добавлены")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Новый термин"), { target: { value: "Тест" } });
    fireEvent.change(screen.getByLabelText("Значение нового термина"), { target: { value: "тест" } });
    fireEvent.click(screen.getByText("Добавить"));

    await waitFor(() =>
      expect(screen.getByText(/flat-terms write is not supported/)).toBeTruthy(),
    );
    // The rest of the screen (project selector, client-context panel) is still there.
    expect(screen.getByText("client_context.md")).toBeTruthy();
  });

  it("shows an inline error for an unconfigured project (404) without crashing the screen", async () => {
    stubFetch({ dictionary: { status: 404, detail: "Project 'bogus' is not configured" } });
    render(<ProjectMemoryView projects={PROJECTS} />);

    await waitFor(() => expect(screen.getByText(/не настроен/)).toBeTruthy());
    // Other panels still render.
    expect(screen.getByText("client_context.md")).toBeTruthy();
    expect(screen.getByText("Онтология")).toBeTruthy();
  });
});

describe("ProjectMemoryView — client_context", () => {
  it("loads and edits client_context markdown, then saves", async () => {
    let savedContent = "";
    stubFetch({
      clientContext: contextResponse({ content: "# Изначальный контекст" }),
      onPutContext: (body) => {
        savedContent = (body as { content: string }).content;
        return contextResponse({ content: savedContent });
      },
    });
    render(<ProjectMemoryView projects={PROJECTS} />);

    const textarea = await screen.findByLabelText("client_context markdown редактор");
    expect((textarea as HTMLTextAreaElement).value).toBe("# Изначальный контекст");

    fireEvent.change(textarea, { target: { value: "# Обновлённый контекст" } });
    const saveButtons = screen.getAllByText("Сохранить");
    // Only the client_context panel's Save button should be enabled at this point.
    const contextSave = saveButtons.find((b) => !(b as HTMLButtonElement).disabled);
    expect(contextSave).toBeTruthy();
    fireEvent.click(contextSave!);

    await waitFor(() => expect(savedContent).toBe("# Обновлённый контекст"));
  });
});

describe("ProjectMemoryView — ontology (read-only)", () => {
  it("renders people, business_entities, categories and client_meta read-only", async () => {
    stubFetch({
      ontology: ontologyResponse({
        version: "2",
        domain: "accounting",
        people: [{ name: "Иван", role: "директор", aliases: ["Ваня"] }],
        business_entities: [{ canonical: "Русклимат", stt_variants: ["рус климат"] }],
        categories: { products: [{ canonical: "СЗВ-М", stt_variants: ["эсзэвэм"] }] },
        client_meta: {
          primary_currency: "RUB",
          industry: "climate equipment",
          accounting_systems_used: ["1C"],
        },
      }),
    });
    render(<ProjectMemoryView projects={PROJECTS} />);

    await waitFor(() => expect(screen.getByText("Люди (1)")).toBeTruthy());
    expect(screen.getByText(/Иван/)).toBeTruthy();
    expect(screen.getByText("Организации (1)")).toBeTruthy();
    expect(screen.getByText(/Русклимат/)).toBeTruthy();
    expect(screen.getByText("Категории (1)")).toBeTruthy();
    expect(screen.getByText(/СЗВ-М/)).toBeTruthy();
    expect(screen.getByText(/climate equipment/)).toBeTruthy();
    // read-only tag present, no edit affordances anywhere in the ontology panel
    expect(screen.getByText("только чтение")).toBeTruthy();
  });

  it("shows an inline error when ontology fails to load, without blocking the other panels", async () => {
    stubFetch({ ontology: { status: 404, detail: "Project 'bogus' is not configured" } });
    render(<ProjectMemoryView projects={PROJECTS} />);

    await waitFor(() => expect(screen.getByText(/не настроен/)).toBeTruthy());
    expect(screen.getByText("client_context.md")).toBeTruthy();
    expect(screen.getByText("Словарь терминов")).toBeTruthy();
  });
});

describe("ProjectMemoryView — project selector", () => {
  it("reloads all three sections when switching the selected project", async () => {
    const fetchMock = stubFetch({
      dictionary: dictResponse({ project_slug: "Sewing-ERP", terms: { A: "a" } }),
    });
    render(<ProjectMemoryView projects={PROJECTS} />);

    await waitFor(() => expect(screen.getByText("A")).toBeTruthy());
    const initialCalls = fetchMock.mock.calls.length;

    const select = screen.getByLabelText("Проект") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "mankassa-app" } });

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(initialCalls));
  });
});
