import type { ProjectHubData } from "../../../../types/hub";
import { DoraCards } from "../DoraCards";
import { OnboardingChecklist } from "../OnboardingChecklist";

interface Props {
  data: ProjectHubData;
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <section className="v4-hub-delivery-card" aria-label={title}>
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

function CustomerHealthPanel({ data }: { data: ProjectHubData["customerHealth"] }) {
  if (!data) {
    return (
      <EmptyPanel
        title="Customer Health"
        body="Score появится после расчёта sentiment, cadence, delivery и paid-сигналов."
      />
    );
  }

  return (
    <section className="v4-hub-delivery-card" aria-labelledby="v4-delivery-customer-title">
      <h3 id="v4-delivery-customer-title">Customer Health</h3>
      <div className={`v4-delivery-gauge v4-delivery-gauge--${data.tier}`}>
        <span>{Math.round(data.score)}</span>
        <small>/100</small>
      </div>
      <p>Обновлено {new Date(data.updatedAt).toLocaleDateString("ru-RU")}</p>
    </section>
  );
}

function DigestPanel({ data, onGenerate }: { data: ProjectHubData["digest"]; onGenerate: () => Promise<void> }) {
  if (!data) {
    return (
      <section className="v4-hub-delivery-card" aria-labelledby="v4-delivery-digest-title">
        <h3 id="v4-delivery-digest-title">Project Digest</h3>
        <p>Еженедельный digest ещё не сгенерирован.</p>
        <button type="button" className="v4-btn" onClick={() => void onGenerate()}>
          Сгенерировать digest
        </button>
      </section>
    );
  }

  return (
    <section className="v4-hub-delivery-card" aria-labelledby="v4-delivery-digest-title">
      <div className="v4-hub-delivery-card-head">
        <h3 id="v4-delivery-digest-title">Project Digest</h3>
        <span>{data.week}</span>
      </div>
      <p className="v4-delivery-digest-meta">
        Сгенерирован {new Date(data.generatedAt).toLocaleDateString("ru-RU")}
      </p>
      <pre className="v4-delivery-digest-preview">{data.markdown}</pre>
      <button type="button" className="v4-btn" onClick={() => void onGenerate()}>
        Обновить digest
      </button>
    </section>
  );
}

/**
 * Delivery tab for Epic-012: DORA metrics, Project Digest, Customer Health
 * and Onboarding Readiness. Data stays owned by useProjectHub; this component
 * only renders available snapshots and resilient empty states.
 */
export function DeliveryTab({ data }: Props) {
  return (
    <div className="v4-hub-delivery">
      <section className="v4-hub-delivery-card v4-hub-delivery-card--wide" aria-labelledby="v4-delivery-dora-title">
        <div className="v4-hub-delivery-card-head">
          <h3 id="v4-delivery-dora-title">DORA metrics</h3>
          <span>30 дней</span>
        </div>
        <DoraCards metrics={data.dora} />
      </section>

      <DigestPanel data={data.digest} onGenerate={data.generateDigest} />
      <CustomerHealthPanel data={data.customerHealth} />

      <section className="v4-hub-delivery-card v4-hub-delivery-card--wide" aria-labelledby="v4-delivery-onboarding-title">
        <h3 id="v4-delivery-onboarding-title">Onboarding Readiness</h3>
        <OnboardingChecklist findings={data.health?.findings ?? []} />
      </section>
    </div>
  );
}

export default DeliveryTab;
