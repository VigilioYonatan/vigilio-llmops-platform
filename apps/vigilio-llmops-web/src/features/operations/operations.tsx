import { useSignal } from '@preact/signals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'preact/hooks';
import { api, post } from '../../api/http';
import { notify, selectedWorkspace } from '../../shared/navigation';
import {
  Button,
  DataTable,
  Empty,
  ErrorState,
  FormError,
  Input,
  Loading,
  PageHeader,
  Panel,
  Status,
  Textarea,
} from '../../shared/ui';

type Rule = {
  id: string;
  name: string;
  metric: string;
  threshold: string;
  enabled: boolean;
};
type Alert = {
  id: string;
  title: string;
  severity: string;
  acknowledged_at: string | null;
  created_at: string;
};
type Incident = {
  id: string;
  title: string;
  severity: string;
  status: string;
  created_at: string;
};
export function OperationsPage() {
  const ws = selectedWorkspace();
  const cache = useQueryClient();
  const selectedIncident = useSignal('');
  const rules = useQuery({
    queryKey: ['rules', ws],
    enabled: !!ws,
    queryFn: () => api<Rule[]>(`/alert-rules?workspace_id=${ws}`),
  });
  const alerts = useQuery({
    queryKey: ['alerts', ws],
    enabled: !!ws,
    queryFn: () => api<Alert[]>(`/alerts?workspace_id=${ws}`),
  });
  const incidents = useQuery({
    queryKey: ['incidents', ws],
    enabled: !!ws,
    queryFn: () => api<Incident[]>(`/incidents?workspace_id=${ws}`),
  });
  const detail = useQuery({
    queryKey: ['incident-detail', selectedIncident.value],
    enabled: !!selectedIncident.value,
    queryFn: () =>
      api<{ timeline: { message: string; created_at: string }[] }>(
        `/incidents/${selectedIncident.value}`,
      ),
  });
  const [name, setName] = useState('');
  const [metric, setMetric] = useState<
    'error_rate' | 'latency_p95_ms' | 'cost_usd'
  >('error_rate');
  const [threshold, setThreshold] = useState('0.05');
  const [runbook, setRunbook] = useState(
    'https://example.com/runbooks/llm-alert',
  );
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<'sev1' | 'sev2' | 'sev3'>('sev2');
  const [message, setMessage] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [correction, setCorrection] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function change(run: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError(null);
    try {
      await run();
      await cache.invalidateQueries();
      notify(msg);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo realizar la operación',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="SRE / INCIDENTS"
        title="Alertas e incidentes"
        description="Reglas por métricas, detección sobre eventos, reconocimiento de alertas, registro de incidentes y acciones correctivas."
      />
      <div class="two-col">
        <Panel title="Nueva regla de alerta">
          <form
            class="form-pad"
            onSubmit={(e) => {
              e.preventDefault();
              if (ws)
                void change(
                  () =>
                    post('/alert-rules', {
                      workspace_id: ws,
                      name,
                      metric,
                      comparator: 'gt',
                      threshold: Number(threshold),
                      runbook_url: runbook,
                    }),
                  'Regla guardada',
                );
            }}
          >
            <Input
              label="Nombre de regla"
              value={name}
              onInput={setName}
              required
            />
            <div class="form-field">
              <label for="alert-metric">Métrica</label>
              <select
                id="alert-metric"
                value={metric}
                onChange={(e) =>
                  setMetric(e.currentTarget.value as typeof metric)
                }
              >
                <option value="error_rate">Error rate</option>
                <option value="latency_p95_ms">Latencia p95 (ms)</option>
                <option value="cost_usd">Costo USD</option>
              </select>
            </div>
            <Input
              label="Umbral"
              type="number"
              value={threshold}
              onInput={setThreshold}
              required
            />
            <Input
              label="Runbook HTTPS"
              type="url"
              value={runbook}
              onInput={setRunbook}
              required
            />
            <Button type="submit" disabled={!ws || busy}>
              Crear regla
            </Button>
          </form>
        </Panel>
        <Panel title="Reglas configuradas">
          {rules.isPending ? (
            <Loading />
          ) : rules.error ? (
            <ErrorState error={rules.error} />
          ) : !rules.data?.length ? (
            <Empty title="No hay reglas" />
          ) : (
            <DataTable headers={['Nombre', 'Métrica', 'Umbral', 'Estado']}>
              {rules.data.map((v) => (
                <tr key={v.id}>
                  <td>{v.name}</td>
                  <td>{v.metric}</td>
                  <td>{v.threshold}</td>
                  <td>
                    <Status value={v.enabled ? 'active' : 'disabled'} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>
      </div>
      <Panel title="Alertas recientes">
        {alerts.isPending ? (
          <Loading />
        ) : alerts.error ? (
          <ErrorState error={alerts.error} />
        ) : !alerts.data?.length ? (
          <Empty
            title="Sin alertas"
            description="Los eventos nuevos se comparan con las reglas activas."
          />
        ) : (
          <DataTable headers={['Evento', 'Severidad', 'Creada', 'Acción']}>
            {alerts.data.map((v) => (
              <tr key={v.id}>
                <td>{v.title}</td>
                <td>{v.severity}</td>
                <td>{new Date(v.created_at).toLocaleString()}</td>
                <td>
                  {v.acknowledged_at ? (
                    <Status value="acknowledged" />
                  ) : (
                    <button
                      class="inline-link"
                      disabled={busy}
                      onClick={() =>
                        void change(
                          () => post(`/alerts/${v.id}/acknowledge`, {}),
                          'Alerta reconocida',
                        )
                      }
                    >
                      Reconocer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
      <div class="two-col">
        <Panel title="Registrar incidente">
          <form
            class="form-pad"
            onSubmit={(e) => {
              e.preventDefault();
              if (ws)
                void change(
                  () =>
                    post('/incidents', { workspace_id: ws, title, severity }),
                  'Incidente creado',
                );
            }}
          >
            <Input
              label="Título del incidente"
              value={title}
              onInput={setTitle}
              required
            />
            <div class="form-field">
              <label for="severity">Severidad</label>
              <select
                id="severity"
                value={severity}
                onChange={(e) =>
                  setSeverity(e.currentTarget.value as typeof severity)
                }
              >
                <option value="sev1">SEV1 · Crítica</option>
                <option value="sev2">SEV2 · Alta</option>
                <option value="sev3">SEV3 · Baja</option>
              </select>
            </div>
            <Button disabled={!ws || busy} type="submit">
              Abrir incidente
            </Button>
          </form>
        </Panel>
        <Panel title="Incidentes abiertos y cerrados">
          {incidents.isPending ? (
            <Loading />
          ) : incidents.error ? (
            <ErrorState error={incidents.error} />
          ) : !incidents.data?.length ? (
            <Empty title="Sin incidentes" />
          ) : (
            <div class="list-stack">
              {incidents.data.map((v) => (
                <button
                  type="button"
                  key={v.id}
                  class={`list-item-button ${selectedIncident.value === v.id ? 'selected' : ''}`}
                  onClick={() => (selectedIncident.value = v.id)}
                >
                  <span>
                    <b>{v.title}</b>
                    <small>
                      {v.severity} · {v.status}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>
      {selectedIncident.value && (
        <Panel
          title="Bitácora y resolución"
          description="La causa raíz y acción correctiva se conservan en la auditoría."
        >
          <div class="form-pad">
            {detail.isPending ? (
              <Loading />
            ) : detail.error ? (
              <ErrorState error={detail.error} />
            ) : (
              <ul>
                {(detail.data?.timeline ?? []).map((v, i) => (
                  <li key={i}>
                    {new Date(v.created_at).toLocaleString()} · {v.message}
                  </li>
                ))}
              </ul>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void change(
                  () =>
                    post(`/incidents/${selectedIncident.value}/events`, {
                      message,
                    }),
                  'Evento registrado',
                );
              }}
            >
              <Input
                label="Nota de seguimiento"
                value={message}
                onInput={setMessage}
                required
              />
              <Button disabled={busy} type="submit">
                Añadir evento
              </Button>
            </form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void change(
                  () =>
                    post(`/incidents/${selectedIncident.value}/resolve`, {
                      root_cause: rootCause,
                      corrective_action: correction,
                    }),
                  'Incidente resuelto',
                );
              }}
            >
              <Textarea
                label="Causa raíz"
                value={rootCause}
                onInput={setRootCause}
              />
              <Textarea
                label="Acción correctiva"
                value={correction}
                onInput={setCorrection}
              />
              <Button
                disabled={
                  busy || rootCause.length < 10 || correction.length < 10
                }
                type="submit"
              >
                Resolver incidente
              </Button>
            </form>
          </div>
        </Panel>
      )}
      <FormError error={error} />
    </>
  );
}
