import { useQuery } from '@tanstack/react-query';
import {
  GitCommit,
  MessageSquare,
  Play,
  RotateCcw,
  Search,
} from 'lucide-preact';
import { useState } from 'preact/hooks';
import { api, post } from '../../api/http';
import { notify, selectedWorkspace } from '../../shared/navigation';
import type { Trace } from '../../shared/types';
import {
  Button,
  CopyButton,
  DataTable,
  Empty,
  ErrorState,
  Loading,
  PageHeader,
  Panel,
  Status,
} from '../../shared/ui';

type Span = {
  span_id: string;
  name: string;
  duration_ms: number;
  status: string;
};

type Feedback = {
  score: number;
  comment?: string;
  created_at: string;
};

export function TracesPage() {
  const ws = selectedWorkspace();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);

  const traces = useQuery({
    queryKey: ['traces', ws],
    enabled: !!ws,
    queryFn: () => api<Trace[]>(`/traces?workspace_id=${ws}&limit=100`),
  });

  const detail = useQuery({
    queryKey: ['trace', selected],
    enabled: !!selected,
    queryFn: () =>
      api<Trace & { attributes: Record<string, string | number | boolean> }>(
        `/traces/${selected}`,
      ),
  });

  const spans = useQuery({
    queryKey: ['trace-spans', selected],
    enabled: !!selected,
    queryFn: () => api<Span[]>(`/traces/${selected}/spans`),
  });

  const feedback = useQuery({
    queryKey: ['trace-feedback', selected],
    enabled: !!selected,
    queryFn: () => api<Feedback[]>(`/traces/${selected}/feedback`),
  });

  async function replayTrace() {
    if (!selected) return;
    setReplaying(true);
    try {
      await post(`/traces/${selected}/replay`, {});
      await traces.refetch();
      notify('Trace re-ejecutada con éxito para reproducción SRE');
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Error al re-ejecutar traza',
        'error',
      );
    } finally {
      setReplaying(false);
    }
  }
  const filtered =
    traces.data?.filter((t) =>
      `${t.trace_id} ${t.model} ${t.status}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <>
      <PageHeader
        eyebrow="OBSERVABILITY / EXPLORER"
        title="Trace Explorer"
        description="Investiga solicitudes por aplicación, modelo, duración y estado, sin exponer prompts por defecto."
      />
      <Panel
        title="Registros recientes"
        description="Metadatos restringidos al workspace seleccionado."
      >
        <div class="table-toolbar">
          <div class="searchbox">
            <Search size={17} />
            <input
              aria-label="Buscar trazas"
              placeholder="Buscar trace ID, modelo o estado"
              value={search}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
          </div>
          <span class="table-count">{filtered.length} resultados</span>
        </div>
        {traces.isPending ? (
          <Loading />
        ) : traces.error ? (
          <ErrorState error={traces.error} />
        ) : !filtered.length ? (
          <Empty
            title="Sin resultados"
            description="Conecta la instrumentación o ajusta la búsqueda."
          />
        ) : (
          <DataTable
            headers={[
              'Trace ID',
              'Modelo',
              'Estado',
              'Latencia',
              'Tokens',
              'Costo',
              'Acción',
            ]}
          >
            {filtered.map((trace) => (
              <tr key={trace.id}>
                <td class="mono">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{trace.trace_id ? trace.trace_id.slice(0, 12) + '…' : trace.id.slice(0, 8)}</span>
                    <CopyButton text={trace.trace_id ?? trace.id} label="Copiar ID" />
                  </div>
                </td>
                <td><b>{trace.model}</b></td>
                <td>
                  <Status value={trace.status} />
                </td>
                <td class="mono">{trace.latency_ms} ms</td>
                <td class="mono">{trace.input_tokens + trace.output_tokens}</td>
                <td class="mono">${Number(trace.estimated_cost_usd).toFixed(5)}</td>
                <td>
                  <button
                    type="button"
                    class="inline-link"
                    onClick={() => setSelected(trace.id)}
                  >
                    Inspeccionar
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
      {selected && (
        <>
          <Panel
            title="Inspección de traza"
            description="Atributos permitidos por la política de captura de metadatos."
            action={
              <Button
                onClick={replayTrace}
                disabled={replaying}
                variant="subtle"
              >
                <RotateCcw size={15} /> Re-ejecutar traza (Replay)
              </Button>
            }
          >
            {detail.isPending ? (
              <Loading />
            ) : detail.error ? (
              <ErrorState error={detail.error} />
            ) : (
              detail.data && (
                <div class="trace-inspector">
                  <div class="trace-details">
                    <div>
                      <small>TRACE ID</small>
                      <b class="mono">{detail.data.trace_id}</b>
                    </div>
                    <div>
                      <small>MODELO</small>
                      <b>{detail.data.model}</b>
                    </div>
                    <div>
                      <small>LATENCIA</small>
                      <b>{detail.data.latency_ms} ms</b>
                    </div>
                    <div>
                      <small>ESTADO</small>
                      <Status value={detail.data.status} />
                    </div>
                  </div>
                  <div class="attributes">
                    <h3>Atributos capturados</h3>
                    {Object.entries(detail.data.attributes ?? {}).length ===
                    0 ? (
                      <p class="muted">Sin atributos adicionales</p>
                    ) : (
                      Object.entries(detail.data.attributes).map(
                        ([key, value]) => (
                          <div key={key} class="attribute-row">
                            <code>{key}</code>
                            <span>{String(value)}</span>
                          </div>
                        ),
                      )
                    )}
                  </div>
                </div>
              )
            )}
          </Panel>

          <div class="two-col">
            <Panel
              title="Spans OpenTelemetry"
              description="Cascada temporal de sub-operaciones dentro de la llamada del LLM."
            >
              {spans.isPending ? (
                <Loading label="Cargando spans..." />
              ) : spans.error ? (
                <ErrorState error={spans.error} />
              ) : !spans.data?.length ? (
                <Empty
                  title="Sin spans secundarios"
                  description="La llamada fue registrada como span raíz."
                />
              ) : (
                <div class="list-stack">
                  {spans.data.map((span) => (
                    <div key={span.span_id} class="activity-item">
                      <span class="activity-icon">
                        <GitCommit size={16} />
                      </span>
                      <div>
                        <b>{span.name}</b>
                        <small class="mono">
                          {span.duration_ms} ms · {span.status}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel
              title="Feedback del usuario SDK"
              description="Valoraciones y comentarios capturados por el SDK de cliente."
            >
              {feedback.isPending ? (
                <Loading label="Cargando feedback..." />
              ) : feedback.error ? (
                <ErrorState error={feedback.error} />
              ) : !feedback.data?.length ? (
                <Empty
                  title="Sin feedback recibido"
                  description="Las llamadas SDK pueden enviar puntuaciones y etiquetas."
                />
              ) : (
                <div class="list-stack">
                  {feedback.data.map((fb, idx) => (
                    <div key={idx} class="activity-item">
                      <span class="activity-icon">
                        <MessageSquare size={16} />
                      </span>
                      <div>
                        <b>Puntuación: {fb.score}/5</b>
                        <small>
                          {fb.comment || 'Sin comentario adicional'}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
