import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  Clock3,
  Coins,
  ShieldCheck,
  Workflow,
} from 'lucide-preact';
import { api } from '../../api/http';
import { navigate, route, selectedWorkspace } from '../../shared/navigation';
import type { Evaluation, Release, Stats, Trace } from '../../shared/types';
import {
  DataTable,
  Empty,
  ErrorState,
  Loading,
  PageHeader,
  Panel,
  Status,
} from '../../shared/ui';

const fmt = (value: number) => new Intl.NumberFormat('es-PE').format(value);
export function DashboardPage() {
  const ws = selectedWorkspace();
  const summary = useQuery({
    queryKey: ['summary', ws],
    enabled: !!ws,
    queryFn: () => api<Stats>(`/traces/summary?workspace_id=${ws}`),
  });
  const traces = useQuery({
    queryKey: ['traces', ws],
    enabled: !!ws,
    queryFn: () => api<Trace[]>(`/traces?workspace_id=${ws}&limit=6`),
  });
  const evals = useQuery({
    queryKey: ['evals', ws],
    enabled: !!ws,
    queryFn: () => api<Evaluation[]>(`/evaluation-runs?workspace_id=${ws}`),
  });
  const releases = useQuery({
    queryKey: ['releases', ws],
    enabled: !!ws,
    queryFn: () => api<Release[]>(`/releases?workspace_id=${ws}`),
  });
  const root = route.value.split('?')[1] ?? '';
  const query = root ? `?${root}` : '';
  return (
    <>
      <PageHeader
        eyebrow="CONTROL PLANE / OVERVIEW"
        title="El estado de tu IA, en un lugar."
        description="Trazabilidad, calidad y decisiones con evidencia en tiempo real."
        action={
          <button
            class="btn btn-subtle"
            onClick={() => {
              void Promise.all([
                summary.refetch(),
                traces.refetch(),
                evals.refetch(),
                releases.refetch(),
              ]);
            }}
          >
            Actualizar datos <ArrowUpRight size={16} />
          </button>
        }
      />
      <div class="hero-panel">
        <div>
          <span class="hero-eyebrow">
            <span class="online-indicator" /> ENTORNO CONECTADO
          </span>
          <h2>
            Operaciones responsables, <em>resultados medibles.</em>
          </h2>
          <p>
            La salud operativa no basta: compara calidad, costo y latencia antes
            de cada publicación.
          </p>
          <button
            class="btn btn-hero"
            onClick={() => navigate(`/app/evaluations${query}`)}
          >
            Abrir Evaluation Lab <ArrowUpRight size={16} />
          </button>
        </div>
        <div class="hero-orbit" aria-hidden="true">
          <div class="orbit orbit-one" />
          <div class="orbit orbit-two" />
          <div class="orbit orbit-three" />
          <div class="orbit-center">
            <Workflow size={30} />
          </div>
        </div>
      </div>
      {summary.error && <ErrorState error={summary.error} />}
      <div class="stat-grid">
        <article class="stat stat-cyan">
          <span>
            Solicitudes / 7 días
            <span class="stat-icon cyan">
              <Activity size={17} />
            </span>
          </span>
          <strong>{fmt(summary.data?.requests ?? 0)}</strong>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <small>Eventos instrumentados</small>
            <span class="stat-trend positive">Activo</span>
          </div>
        </article>
        <article class="stat">
          <span>
            Latencia promedio
            <span class="stat-icon">
              <Clock3 size={17} />
            </span>
          </span>
          <strong>
            {fmt(summary.data?.avg_latency_ms ?? 0)} <small>ms</small>
          </strong>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <small>Solicitudes registradas</small>
            <span class="stat-trend neutral">&lt;300ms SLA</span>
          </div>
        </article>
        <article class="stat stat-amber">
          <span>
            Costo estimado
            <span class="stat-icon amber">
              <Coins size={17} />
            </span>
          </span>
          <strong>
            ${Number(summary.data?.estimated_cost_usd ?? 0).toFixed(4)}
          </strong>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <small>USD · no conciliado</small>
            <span class="stat-trend neutral">FinOps</span>
          </div>
        </article>
        <article class="stat stat-emerald">
          <span>
            Errores detectados
            <span class="stat-icon emerald">
              <ShieldCheck size={17} />
            </span>
          </span>
          <strong>{fmt(summary.data?.errors ?? 0)}</strong>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <small>Errores de trazas / 7 días</small>
            <span class="stat-trend positive">0% Tasa</span>
          </div>
        </article>
      </div>
      <div class="content-grid">
        <Panel
          title="Actividad reciente"
          description="Últimas llamadas registradas en el workspace."
          action={
            <button
              class="inline-link"
              onClick={() => navigate(`/app/traces${query}`)}
            >
              Ver todas <ArrowUpRight size={15} />
            </button>
          }
        >
          {traces.isPending ? (
            <Loading />
          ) : traces.error ? (
            <ErrorState error={traces.error} />
          ) : !traces.data?.length ? (
            <Empty
              title="Aún no hay trazas"
              description="Registra una aplicación y envía la primera traza con tu API key."
            />
          ) : (
            <DataTable headers={['Modelo', 'Estado', 'Latencia', 'Fecha']}>
              {traces.data.map((trace) => (
                <tr key={trace.id}>
                  <td>{trace.model}</td>
                  <td>
                    <Status value={trace.status} />
                  </td>
                  <td>{trace.latency_ms} ms</td>
                  <td>{new Date(trace.created_at).toLocaleString('es-PE')}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>
        <Panel
          title="Release pipeline"
          description="Publicaciones y controles de calidad."
          action={
            <button
              class="inline-link"
              onClick={() => navigate(`/app/releases${query}`)}
            >
              Gestionar <ArrowUpRight size={15} />
            </button>
          }
        >
          {releases.isPending ? (
            <Loading />
          ) : releases.error ? (
            <ErrorState error={releases.error} />
          ) : !releases.data?.length ? (
            <Empty
              title="Sin releases"
              description="Crea un quality gate cuando tengas una evaluación completada."
            />
          ) : (
            <div class="activity-list">
              {releases.data.slice(0, 5).map((release) => (
                <div class="activity-item" key={release.id}>
                  <span class="activity-icon">
                    <ShieldCheck size={17} />
                  </span>
                  <div>
                    <b>Release {release.id.slice(0, 8)}</b>
                    <small>
                      {release.created_at
                        ? new Date(release.created_at).toLocaleDateString(
                            'es-PE',
                          )
                        : '—'}
                    </small>
                  </div>
                  <Status value={release.status} />
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
      <Panel
        title="Evaluaciones más recientes"
        description="Resultados reproducibles del laboratorio LLMOps."
      >
        {evals.isPending ? (
          <Loading />
        ) : evals.error ? (
          <ErrorState error={evals.error} />
        ) : !evals.data?.length ? (
          <Empty
            title="Sin evaluaciones"
            description="Agrega casos a un dataset y crea tu primera ejecución."
          />
        ) : (
          <DataTable
            headers={['Ejecución', 'Calidad exact-match', 'Casos', 'Estado']}
          >
            {evals.data.slice(0, 6).map((item) => (
              <tr key={item.id}>
                <td class="mono">{item.id.slice(0, 12)}</td>
                <td>
                  {item.score === null
                    ? '—'
                    : `${(Number(item.score) * 100).toFixed(1)}%`}
                </td>
                <td>
                  {item.passed_cases}/{item.total_cases}
                </td>
                <td>
                  <Status value={item.status} />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
    </>
  );
}
