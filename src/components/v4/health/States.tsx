import { Icon } from "./Icon";

// Edge states of the page — separate components so the page-level switch
// stays readable.

export function LoadingState({ repo }: { repo: string }) {
  return (
    <div className="ph-loading">
      <div className="ph-skel-hero">
        <div className="ph-skel-block w120 h28" />
        <div className="ph-skel-tags">
          <div className="ph-skel-block w52 h18" />
          <div className="ph-skel-block w64 h18" />
          <div className="ph-skel-block w48 h18" />
        </div>
        <div className="ph-skel-row">
          <div className="ph-skel-grade" />
          <div className="ph-skel-meta">
            <div className="ph-skel-block w260 h18" />
            <div className="ph-skel-block w100p h12" />
            <div className="ph-skel-block w100p h12" />
            <div className="ph-skel-block w100p h12" />
            <div className="ph-skel-block w100p h12" />
          </div>
        </div>
      </div>
      <div className="ph-skel-msg">
        <div className="ph-skel-spin" />
        Сканирую <span className="v4-mono">{repo || "проект"}</span>… 50 правил по 4 слоям
      </div>
      <div className="ph-skel-rows">
        {[1, 2, 3, 4, 5].map((i) => (
          <div className="ph-skel-finding" key={i}>
            <div className="ph-skel-block w52 h16" />
            <div className="ph-skel-stack">
              <div className="ph-skel-block w70p h14" />
              <div className="ph-skel-block w90p h12" />
            </div>
            <div className="ph-skel-block w90 h28" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface ErrorProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorProps) {
  return (
    <div className="ph-error">
      <div className="ph-error-icon"><Icon name="alert" /></div>
      <h3>Не удалось получить отчёт</h3>
      <p>{message}</p>
      <div className="ph-error-actions">
        <button type="button" className="v4-btn v4-btn--pri" onClick={onRetry}>
          <Icon name="refresh" /> Попробовать снова
        </button>
      </div>
    </div>
  );
}

export function ClassificationMissing({ repo, onRetry }: { repo: string; onRetry: () => void }) {
  return (
    <div className="ph-classmissing">
      <div className="ph-classmissing-art"><Icon name="map" /></div>
      <h3>Проект не зарегистрирован в чек-листе</h3>
      <p>
        Не нашли <span className="v4-mono">{repo}</span> в{" "}
        <span className="v4-mono">Skills/PROJECT_CHECKLIST.yaml</span>. Без классификации (tier / complex / client) непонятно, какие правила к нему применять.
      </p>
      <ol className="ph-classmissing-steps">
        <li>
          Открой{" "}
          <a
            href="https://github.com/Sergio1990-1/makeit-knowledge/blob/main/Skills/PROJECT_CHECKLIST.yaml"
            target="_blank"
            rel="noreferrer"
            className="ph-link"
          >
            makeit-knowledge → PROJECT_CHECKLIST.yaml
          </a>
        </li>
        <li>Добавь блок <span className="v4-mono">{repo}: {`{tier, complex, client}`}</span></li>
        <li>Закоммить — следующий скан подхватит автоматически</li>
      </ol>
      <div className="ph-classmissing-actions">
        <a
          className="v4-btn v4-btn--pri"
          href="https://github.com/Sergio1990-1/makeit-knowledge/blob/main/Skills/PROJECT_CHECKLIST.yaml"
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="ext" /> Открыть PROJECT_CHECKLIST.yaml
        </a>
        <button type="button" className="v4-btn" onClick={onRetry}>
          <Icon name="refresh" /> Перепроверить
        </button>
      </div>
    </div>
  );
}
