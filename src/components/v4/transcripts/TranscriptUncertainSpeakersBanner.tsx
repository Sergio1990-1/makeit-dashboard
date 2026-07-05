interface Props {
  /** Count of speakers currently flagged `uncertain` (see `SpeakerInfo.uncertain`
   *  in `src/utils/transcript.ts`). Caller only renders this banner when > 0. */
  count: number;
}

/**
 * Reminder shown while the transcript still has one or more unresolved
 * speakers (`SpeakerInfo.uncertain === true`, e.g. "SPEAKER_4" never merged
 * into a named participant) — see issue #545: a real BRIEF shipped to a
 * client with an unresolved "Speaker 4" because the merge/rename step in
 * TranscriptSpeakersV4 (#1298) was skipped before finalizing.
 *
 * Unlike `TranscriptStaleBriefBanner`, this is a pure reminder — there's no
 * single action to take (the fix is to review the speakers list above and
 * merge/rename via the existing UI), so no action button here.
 */
export function TranscriptUncertainSpeakersBanner({ count }: Props) {
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
        <b>Есть нераспознанные спикеры</b>
        <span>
          Есть {count} нераспознанных спикеров — проверьте перед отправкой клиенту.
        </span>
      </div>
    </div>
  );
}
