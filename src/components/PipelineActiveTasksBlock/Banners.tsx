export function StoppingBanner({ count }: { count: number }) {
  return (
    <div className="pl2-banner pl2-banner--stopping" role="status">
      <span className="pl2-banner-dot" />
      Останавливаю после текущих задач… <b style={{ marginLeft: 2 }}>{count} в работе</b>
    </div>
  );
}

export function LookingBanner() {
  return (
    <div className="pl2-banner pl2-banner--empty" role="status">
      <span className="pl2-banner-spin" />
      Подбираю следующие задачи…
    </div>
  );
}

export function SkeletonRow({ width }: { width: number }) {
  return (
    <div className="pl2-skeleton-row">
      <div className="pl2-skeleton-bar" style={{ width: 36 }} />
      <div className="pl2-skeleton-bar" style={{ width, flex: 1 }} />
      <div className="pl2-skeleton-bar" style={{ width: 70 }} />
      <div className="pl2-skeleton-bar" style={{ width: 60 }} />
    </div>
  );
}
