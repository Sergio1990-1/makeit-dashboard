import { useCallback, useEffect, useState } from "react";
import type { ProjectConfig } from "../../../types";
import {
  fetchDictionary,
  saveDictionary,
  fetchClientContext,
  saveClientContext,
  fetchOntology,
  type DictionaryResponse,
  type ClientContextResponse,
  type DomainOntology,
} from "../../../utils/projectMemory";

interface Props {
  projects: ProjectConfig[];
}

const STORAGE = {
  project: "pmv:lastProject",
};

/** Mirrors `TranscriptsView`'s slug derivation — `ProjectConfig.repo` is
 *  already the bare repo name (no `owner/`), but `.split("/").pop()` is kept
 *  for consistency with every other consumer that derives a pipeline
 *  `project_slug` from a possibly-qualified project string (e.g.
 *  `PipelineView.tsx`'s `selectedProjectLabel`). */
function toSlug(repo: string): string {
  return repo.split("/").pop() || repo;
}

export function ProjectMemoryView({ projects }: Props) {
  const [selectedProject, setSelectedProject] = useState<string>(() => {
    return localStorage.getItem(STORAGE.project) || projects[0]?.repo || "";
  });
  useEffect(() => {
    localStorage.setItem(STORAGE.project, selectedProject);
  }, [selectedProject]);

  const slug = toSlug(selectedProject);

  // ── Dictionary state ──
  const [dictionary, setDictionary] = useState<DictionaryResponse | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictError, setDictError] = useState<string | null>(null);
  const [dictSaving, setDictSaving] = useState(false);

  // Add/edit term form state
  const [newTermKey, setNewTermKey] = useState("");
  const [newTermValue, setNewTermValue] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  // ── client_context state ──
  const [clientContext, setClientContext] = useState<ClientContextResponse | null>(null);
  const [contextDraft, setContextDraft] = useState("");
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [contextSaving, setContextSaving] = useState(false);
  const [contextSavedAt, setContextSavedAt] = useState<number | null>(null);

  // ── ontology state (read-only) ──
  const [ontology, setOntology] = useState<DomainOntology | null>(null);
  const [ontologyLoading, setOntologyLoading] = useState(false);
  const [ontologyError, setOntologyError] = useState<string | null>(null);

  const loadDictionary = useCallback(async (projectSlug: string) => {
    setDictLoading(true);
    setDictError(null);
    try {
      const data = await fetchDictionary(projectSlug);
      setDictionary(data);
    } catch (err) {
      setDictionary(null);
      setDictError(String(err instanceof Error ? err.message : err));
    } finally {
      setDictLoading(false);
    }
  }, []);

  const loadClientContext = useCallback(async (projectSlug: string) => {
    setContextLoading(true);
    setContextError(null);
    try {
      const data = await fetchClientContext(projectSlug);
      setClientContext(data);
      setContextDraft(data.content);
    } catch (err) {
      setClientContext(null);
      setContextDraft("");
      setContextError(String(err instanceof Error ? err.message : err));
    } finally {
      setContextLoading(false);
    }
  }, []);

  const loadOntology = useCallback(async (projectSlug: string) => {
    setOntologyLoading(true);
    setOntologyError(null);
    try {
      const data = await fetchOntology(projectSlug);
      setOntology(data.ontology);
    } catch (err) {
      setOntology(null);
      setOntologyError(String(err instanceof Error ? err.message : err));
    } finally {
      setOntologyLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!slug) return;
    setEditingKey(null);
    setNewTermKey("");
    setNewTermValue("");
    setContextSavedAt(null);
    void loadDictionary(slug);
    void loadClientContext(slug);
    void loadOntology(slug);
  }, [slug, loadDictionary, loadClientContext, loadOntology]);

  const isV2 = dictionary?.is_v2_ontology ?? false;

  const handleAddTerm = useCallback(async () => {
    if (!dictionary || isV2) return;
    const key = newTermKey.trim();
    const value = newTermValue.trim();
    if (!key || !value) return;
    setDictSaving(true);
    setDictError(null);
    try {
      const nextTerms = { ...dictionary.terms, [key]: value };
      const updated = await saveDictionary(slug, nextTerms);
      setDictionary(updated);
      setNewTermKey("");
      setNewTermValue("");
    } catch (err) {
      setDictError(String(err instanceof Error ? err.message : err));
    } finally {
      setDictSaving(false);
    }
  }, [dictionary, isV2, newTermKey, newTermValue, slug]);

  const handleStartEdit = useCallback((key: string, value: string) => {
    setEditingKey(key);
    setEditingValue(value);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingKey(null);
    setEditingValue("");
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!dictionary || isV2 || editingKey === null) return;
    const value = editingValue.trim();
    if (!value) return;
    setDictSaving(true);
    setDictError(null);
    try {
      const nextTerms = { ...dictionary.terms, [editingKey]: value };
      const updated = await saveDictionary(slug, nextTerms);
      setDictionary(updated);
      setEditingKey(null);
      setEditingValue("");
    } catch (err) {
      setDictError(String(err instanceof Error ? err.message : err));
    } finally {
      setDictSaving(false);
    }
  }, [dictionary, isV2, editingKey, editingValue, slug]);

  const handleDeleteTerm = useCallback(
    async (key: string) => {
      if (!dictionary || isV2) return;
      setDictSaving(true);
      setDictError(null);
      try {
        const nextTerms = { ...dictionary.terms };
        delete nextTerms[key];
        const updated = await saveDictionary(slug, nextTerms);
        setDictionary(updated);
        if (editingKey === key) {
          setEditingKey(null);
          setEditingValue("");
        }
      } catch (err) {
        setDictError(String(err instanceof Error ? err.message : err));
      } finally {
        setDictSaving(false);
      }
    },
    [dictionary, isV2, slug, editingKey],
  );

  const handleSaveContext = useCallback(async () => {
    setContextSaving(true);
    setContextError(null);
    try {
      const updated = await saveClientContext(slug, contextDraft);
      setClientContext(updated);
      setContextDraft(updated.content);
      setContextSavedAt(Date.now());
    } catch (err) {
      setContextError(String(err instanceof Error ? err.message : err));
    } finally {
      setContextSaving(false);
    }
  }, [slug, contextDraft]);

  const contextDirty = clientContext !== null && contextDraft !== clientContext.content;
  const termEntries = dictionary ? Object.entries(dictionary.terms) : [];

  return (
    <div className="v4-content">
      <div className="v4-ph">
        <div>
          <h1>Память проекта</h1>
          <div className="v4-sub">Словарь терминов, client_context и онтология для транскрипции</div>
        </div>
      </div>

      <div style={{ height: 10 }} />

      <div className="v4-pmv-toolbar">
        <label className="v4-tpc-control-field">
          <span className="v4-tpc-control-key">Проект</span>
          <select
            className="v4-pl-input"
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.repo} value={p.repo}>
                {p.repo}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ height: 16 }} />

      {/* ── Dictionary ── */}
      <div className="v4-panel">
        <div className="v4-panel-h">
          <div className="v4-panel-t">
            Словарь терминов
            {isV2 && <span className="v4-tag">v2 онтология</span>}
          </div>
        </div>

        <div className="v4-pmv-body">
          {dictLoading && <div className="v4-empty">Загрузка словаря…</div>}
          {dictError && <div className="v4-error">{dictError}</div>}

          {!dictLoading && dictionary && (
            <>
              {isV2 && (
                <div className="v4-pmv-note">
                  У этого проекта расширенная онтология (v2) — редактирование через этот
                  интерфейс пока не поддерживается. Ниже показаны производные термины
                  только для чтения.
                </div>
              )}

              {termEntries.length === 0 && (
                <div className="v4-empty">Термины ещё не добавлены</div>
              )}

              {termEntries.length > 0 && (
                <table className="v4-pmv-table">
                  <thead>
                    <tr>
                      <th>Термин</th>
                      <th>Значение</th>
                      {!isV2 && <th aria-label="Действия" />}
                    </tr>
                  </thead>
                  <tbody>
                    {termEntries.map(([key, value]) => (
                      <tr key={key}>
                        <td>{key}</td>
                        <td>
                          {editingKey === key ? (
                            <input
                              className="v4-pl-input"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              aria-label={`Значение для ${key}`}
                            />
                          ) : (
                            value
                          )}
                        </td>
                        {!isV2 && (
                          <td className="v4-pmv-actions">
                            {editingKey === key ? (
                              <>
                                <button
                                  type="button"
                                  className="v4-btn v4-btn--pri"
                                  disabled={dictSaving || !editingValue.trim()}
                                  onClick={handleSaveEdit}
                                >
                                  Сохранить
                                </button>
                                <button
                                  type="button"
                                  className="v4-btn"
                                  disabled={dictSaving}
                                  onClick={handleCancelEdit}
                                >
                                  Отмена
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="v4-btn"
                                  disabled={dictSaving}
                                  onClick={() => handleStartEdit(key, value)}
                                >
                                  Редактировать
                                </button>
                                <button
                                  type="button"
                                  className="v4-btn"
                                  style={{ color: "var(--mk-danger-strong)" }}
                                  disabled={dictSaving}
                                  onClick={() => handleDeleteTerm(key)}
                                >
                                  Удалить
                                </button>
                              </>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {!isV2 && (
                <div className="v4-pmv-add-row">
                  <input
                    className="v4-pl-input"
                    placeholder="Термин (например «Русклимат»)"
                    value={newTermKey}
                    onChange={(e) => setNewTermKey(e.target.value)}
                    aria-label="Новый термин"
                  />
                  <input
                    className="v4-pl-input"
                    placeholder="Значение / канонический вид"
                    value={newTermValue}
                    onChange={(e) => setNewTermValue(e.target.value)}
                    aria-label="Значение нового термина"
                  />
                  <button
                    type="button"
                    className="v4-btn v4-btn--pri"
                    disabled={dictSaving || !newTermKey.trim() || !newTermValue.trim()}
                    onClick={handleAddTerm}
                  >
                    {dictSaving ? "Сохранение…" : "Добавить"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ height: 16 }} />

      {/* ── client_context.md ── */}
      <div className="v4-panel">
        <div className="v4-panel-h">
          <div className="v4-panel-t">client_context.md</div>
          <div className="v4-panel-actions">
            {contextSavedAt !== null && !contextDirty && (
              <span className="v4-panel-meta">Сохранено</span>
            )}
            <button
              type="button"
              className="v4-btn v4-btn--pri"
              disabled={contextSaving || contextLoading || !contextDirty}
              onClick={handleSaveContext}
            >
              {contextSaving ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </div>
        <div className="v4-pmv-body">
          {contextLoading && <div className="v4-empty">Загрузка client_context…</div>}
          {contextError && <div className="v4-error">{contextError}</div>}
          {!contextLoading && clientContext !== null && (
            <textarea
              className="v4-pmv-context-textarea"
              value={contextDraft}
              onChange={(e) => setContextDraft(e.target.value)}
              spellCheck={false}
              aria-label="client_context markdown редактор"
              rows={16}
            />
          )}
        </div>
      </div>

      <div style={{ height: 16 }} />

      {/* ── Ontology (read-only) ── */}
      <div className="v4-panel">
        <div className="v4-panel-h">
          <div className="v4-panel-t">
            Онтология
            <span className="v4-tag">только чтение</span>
          </div>
        </div>
        <div className="v4-pmv-body">
          {ontologyLoading && <div className="v4-empty">Загрузка онтологии…</div>}
          {ontologyError && <div className="v4-error">{ontologyError}</div>}
          {!ontologyLoading && ontology && (
            <div className="v4-pmv-ontology">
              <div className="v4-pmv-ontology-meta">
                <span className="v4-panel-meta">версия: {ontology.version}</span>
                {ontology.domain && <span className="v4-panel-meta">домен: {ontology.domain}</span>}
              </div>

              {ontology.client_meta && (
                <section>
                  <h3>Клиент</h3>
                  <ul>
                    {ontology.client_meta.industry && (
                      <li>Индустрия: {ontology.client_meta.industry}</li>
                    )}
                    {ontology.client_meta.primary_currency && (
                      <li>Валюта: {ontology.client_meta.primary_currency}</li>
                    )}
                    {ontology.client_meta.accounting_systems_used.length > 0 && (
                      <li>
                        Системы учёта: {ontology.client_meta.accounting_systems_used.join(", ")}
                      </li>
                    )}
                  </ul>
                </section>
              )}

              <section>
                <h3>Люди ({ontology.people.length})</h3>
                {ontology.people.length === 0 && <div className="v4-empty">Нет данных</div>}
                {ontology.people.length > 0 && (
                  <ul>
                    {ontology.people.map((person) => (
                      <li key={person.name}>
                        <b>{person.name}</b>
                        {person.role ? ` — ${person.role}` : ""}
                        {person.aliases.length > 0 && ` (${person.aliases.join(", ")})`}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3>Организации ({ontology.business_entities.length})</h3>
                {ontology.business_entities.length === 0 && <div className="v4-empty">Нет данных</div>}
                {ontology.business_entities.length > 0 && (
                  <ul>
                    {ontology.business_entities.map((entity) => (
                      <li key={entity.canonical}>
                        <b>{entity.canonical}</b>
                        {entity.stt_variants.length > 0 && ` (${entity.stt_variants.join(", ")})`}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3>Категории ({Object.keys(ontology.categories).length})</h3>
                {Object.keys(ontology.categories).length === 0 && (
                  <div className="v4-empty">Нет данных</div>
                )}
                {Object.entries(ontology.categories).map(([category, terms]) => (
                  <div key={category} className="v4-pmv-ontology-category">
                    <b>{category}</b>
                    <ul>
                      {terms.map((t) => (
                        <li key={t.canonical}>
                          {t.canonical}
                          {t.stt_variants.length > 0 && ` (${t.stt_variants.join(", ")})`}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
