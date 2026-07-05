import { useCallback, useEffect, useState } from "react";
import {
  fetchTranscriptSpeakers,
  mergeTranscriptSpeakers,
  type SpeakerInfo,
} from "../../../utils/transcript";

interface Props {
  taskId: string;
  /** Called after a successful merge — the caller should refetch
   *  `fetchTranscriptResult` since normalized_transcript/brief_stale
   *  changed on the backend. */
  onMerged?: () => void;
  /** Called whenever this panel loads/reloads its own SpeakersResult, so
   *  the parent can combine `speakers.brief_stale` with `result.brief_stale`
   *  (see TranscriptsView — either source can lag right after a merge). */
  onBriefStaleChange?: (stale: boolean) => void;
  /** Called whenever this panel loads/reloads its own SpeakersResult, with
   *  the count of speakers currently flagged `uncertain` — lets the parent
   *  show a reminder banner before the BRIEF is finalized (#545). Mirrors
   *  `onBriefStaleChange` above. */
  onUncertainCountChange?: (count: number) => void;
}

export function TranscriptSpeakersV4({
  taskId,
  onMerged,
  onBriefStaleChange,
  onUncertainCountChange,
}: Props) {
  const [speakers, setSpeakers] = useState<SpeakerInfo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [canonicalName, setCanonicalName] = useState("");
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchTranscriptSpeakers(taskId);
      setSpeakers(data.speakers);
      onBriefStaleChange?.(data.brief_stale);
      onUncertainCountChange?.(data.speakers.filter((s) => s.uncertain).length);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
    // onBriefStaleChange/onUncertainCountChange intentionally excluded —
    // TranscriptsView passes stable setState functions, and including them
    // would only matter if the caller passed a new closure each render (it
    // doesn't here).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  useEffect(() => {
    setSpeakers(null);
    setSelectedIds(new Set());
    setCanonicalName("");
    setMergeError(null);
    load();
  }, [load]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleMerge = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const name = canonicalName.trim();
    if (ids.length === 0 || !name) return;
    setMerging(true);
    setMergeError(null);
    try {
      await mergeTranscriptSpeakers(taskId, name, ids);
      setSelectedIds(new Set());
      setCanonicalName("");
      await load();
      onMerged?.();
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : String(err));
    } finally {
      setMerging(false);
    }
  }, [taskId, selectedIds, canonicalName, load, onMerged]);

  const canSubmit = selectedIds.size > 0 && canonicalName.trim().length > 0 && !merging;
  const actionLabel = selectedIds.size > 1 ? "Объединить" : "Переименовать";

  return (
    <div className="v4-panel v4-tpc-speakers-panel">
      <div className="v4-panel-h">
        <button
          type="button"
          className="v4-tpc-accordion-toggle"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((v) => !v)}
        >
          <span className={`v4-tpc-accordion-arrow ${!collapsed ? "is-open" : ""}`}>▸</span>
          Спикеры{speakers ? ` (${speakers.length})` : ""}
        </button>
      </div>

      {!collapsed && (
        <>
          {loading && <div className="v4-empty">Загрузка спикеров…</div>}

          {loadError && !loading && <div className="v4-error">{loadError}</div>}

          {speakers && !loading && (
            <>
              <ul className="v4-tpc-speaker-list">
                {speakers.map((s) => (
                  <li key={s.id} className="v4-tpc-speaker-card">
                    <label className="v4-tpc-speaker-select">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggleSelected(s.id)}
                        aria-label={`Выбрать спикера ${s.display_name}`}
                      />
                    </label>
                    <div className="v4-tpc-speaker-body">
                      <div className="v4-tpc-speaker-head">
                        <span className="v4-tpc-speaker-name">{s.display_name}</span>
                        <span className="v4-pl-mono v4-tpc-text-muted v4-tpc-speaker-id">
                          {s.id}
                        </span>
                        {s.uncertain && (
                          <span className="v4-tpc-counter v4-tpc-counter--warn">не опознан</span>
                        )}
                        <span className="v4-tpc-text-muted v4-tpc-speaker-count">
                          {s.segment_count} реплик
                        </span>
                      </div>
                      {s.quotes.length > 0 && (
                        <ul className="v4-tpc-speaker-quotes">
                          {s.quotes.map((q, i) => (
                            <li key={i} className="v4-tpc-speaker-quote">
                              <span className="v4-pl-mono v4-tpc-speaker-quote-ts">
                                {q.timestamp}
                              </span>
                              <span className="v4-tpc-speaker-quote-text">{q.text}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {speakers.length > 0 && (
                <div className="v4-tpc-speaker-merge">
                  <input
                    type="text"
                    className="v4-pl-input"
                    placeholder="Имя (например, Иван)"
                    value={canonicalName}
                    onChange={(e) => setCanonicalName(e.target.value)}
                    aria-label="Итоговое имя для выбранных спикеров"
                  />
                  <button
                    type="button"
                    className="v4-btn v4-btn--pri"
                    disabled={!canSubmit}
                    onClick={handleMerge}
                  >
                    {merging ? "Сохранение…" : actionLabel}
                  </button>
                </div>
              )}

              {mergeError && <div className="v4-error">{mergeError}</div>}
            </>
          )}
        </>
      )}
    </div>
  );
}
