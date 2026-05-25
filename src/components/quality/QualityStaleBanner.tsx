import { useState } from "react";

interface Props {
  generatedAt: string;
  onRefresh: () => void;
}

export function QualityStaleBanner({ generatedAt, onRefresh }: Props) {
  const [mountedAt] = useState(() => Date.now());
  const ageHours = Math.round((mountedAt - new Date(generatedAt).getTime()) / 3.6e6);
  return (
    <div className="quality-stale-banner">
      <span>⚠ Данные не обновлялись {ageHours}ч. Проверь cron на Pipeline Mac.</span>
      <button className="btn-refresh" onClick={onRefresh}>↻ Обновить сейчас</button>
    </div>
  );
}
