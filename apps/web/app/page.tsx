import { getBackendHealthView } from "../lib/backend-health";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const health = await getBackendHealthView();

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Ralph Skeleton</p>
        <h1>Production skeleton is live.</h1>
        <p className="lede">
          This page is served by Vercel and renders the live Railway backend status on each request.
        </p>
      </section>

      <section className={`status-card ${health.available ? "healthy" : "degraded"}`}>
        <div className="status-header">
          <div>
            <p className="label">Backend status</p>
            <h2>{health.available ? health.status : "unavailable"}</h2>
          </div>
          <p className="pill">{health.available ? "Railway reachable" : "backend degraded"}</p>
        </div>

        <dl className="status-grid">
          <div>
            <dt>Service</dt>
            <dd>{health.service}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{health.version}</dd>
          </div>
          <div>
            <dt>Checked at</dt>
            <dd>{health.timestamp}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{health.source}</dd>
          </div>
        </dl>

        <p className="message">{health.message}</p>
      </section>
    </main>
  );
}
