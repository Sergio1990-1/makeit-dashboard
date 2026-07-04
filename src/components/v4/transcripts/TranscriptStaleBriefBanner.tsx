import { useCallback, useState } from "react";

interface Props {
  /** Perform the regenerate call + switch the view to polling on success
   *  (POST /transcript/{job_id}/regenerate-brief). Errors (404/409/422)
   *  are NOT caught by the caller — this component owns its own
   *  loading/error state, matching TranscriptBriefV4's onContinueToBrief
   *  handling, so a 409 (e.g. a concurrent request already started one)
   *  shows inline instead of becoming an unhandled rejection. */
  onRegenerate: () => Promise<void>;
}

/**
 * Shown when a speaker merge (#1298) has invalidated an existing BRIEF —
 * combines `TranscriptResult.brief_stale` and the speakers panel's own
 * `SpeakersResult.brief_stale` (see TranscriptsView's `briefStale`), since
 * either source alone can lag right after a merge. Never silently treats
 * the old BRIEF as current; the only way past this is to regenerate it
 * (#1299 `POST /transcript/{job_id}/regenerate-brief`).
 */
export function TranscriptStaleBriefBanner({ onRegenerate }: Props) {
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    setRegenerating(true);
    setError(null);
    try {
      await onRegenerate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegenerating(false);
    }
  }, [onRegenerate]);

  return (
    <div className="v4-banner v4-banner--warn" style={{ marginTop: 14 }}>
      <div className="v4-banner-bi">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <div className="v4-banner-bt">
        <b>BRIEF устарел</b>
        <span>Спикеры были объединены/переименованы после генерации BRIEF — текст ниже больше не отражает текущие имена.</span>
        {error && <span style={{ display: "block", color: "var(--mk-danger-strong)" }}>{error}</span>}
      </div>
      <div className="v4-banner-bact">
        <button
          type="button"
          className="v4-btn v4-btn--pri"
          disabled={regenerating}
          onClick={handleClick}
        >
          {regenerating ? "Пересборка…" : "Пересобрать BRIEF"}
        </button>
      </div>
    </div>
  );
}
