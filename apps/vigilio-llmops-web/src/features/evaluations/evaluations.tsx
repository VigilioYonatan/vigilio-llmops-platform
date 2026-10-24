import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlayCircle, RefreshCcw } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { api, post } from '../../api/http';
import { notify, selectedWorkspace } from '../../shared/navigation';
import type {
  Dataset,
  Evaluation,
  Prompt,
  PromptVersion,
} from '../../shared/types';
import {
  Button,
  DataTable,
  Empty,
  ErrorState,
  FormError,
  Loading,
  PageHeader,
  Panel,
  Status,
} from '../../shared/ui';
export function EvaluationsPage() {
  const ws = selectedWorkspace();
  const client = useQueryClient();
  const [dataset, setDataset] = useState('');
  const [prompt, setPrompt] = useState('');
  const [version, setVersion] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runs = useQuery({
    queryKey: ['evals', ws],
    enabled: !!ws,
    queryFn: () => api<Evaluation[]>(`/evaluation-runs?workspace_id=${ws}`),
    refetchInterval: 10000,
  });
  const datasets = useQuery({
    queryKey: ['datasets', ws],
    enabled: !!ws,
    queryFn: () => api<Dataset[]>(`/datasets?workspace_id=${ws}`),
  });
  const prompts = useQuery({
    queryKey: ['prompts', ws],
    enabled: !!ws,
    queryFn: () => api<Prompt[]>(`/prompts?workspace_id=${ws}`),
  });
  const versions = useQuery({
    queryKey: ['versions', prompt],
    enabled: !!prompt,
    queryFn: () => api<PromptVersion[]>(`/prompts/${prompt}/versions`),
  });
  const results = useQuery({
    queryKey: ['eval-results', selected],
    enabled: !!selected,
    queryFn: () =>
      api<
        Array<{
          id: string;
          passed: boolean;
          actual_output: string;
          notes: string | null;
        }>
      >(`/evaluation-runs/${selected}/results`),
  });
  async function create(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/evaluation-runs', {
        workspace_id: ws,
        dataset_id: dataset,
        prompt_version_id: version,
      });
      await client.invalidateQueries({ queryKey: ['evals', ws] });
      notify('Evaluación encolada');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="EVALUATION / LAB"
        title="Evaluation Lab"
        description="Compara salidas reales del modelo con datasets reproducibles; ningún resultado se inventa."
        action={
          <Button
            variant="subtle"
            onClick={() => {
              void runs.refetch();
            }}
          >
            <RefreshCcw size={16} /> Refrescar
          </Button>
        }
      />
      <Panel
        title="Nueva evaluación"
        description="El worker llamará al modelo Ollama configurado y evaluará exact-match. Puede fallar si no hay modelo."
      >
        <form class="form-pad eval-form" onSubmit={create}>
          <div class="form-field">
            <label for="dataset">Dataset</label>
            <select
              id="dataset"
              required
              value={dataset}
              onChange={(e) => setDataset(e.currentTarget.value)}
            >
              <option value="">Seleccionar dataset</option>
              {datasets.data?.map((ds) => (
                <option value={ds.id} key={ds.id}>
                  {ds.name} ({ds.case_count ?? 0} casos)
                </option>
              ))}
            </select>
          </div>
          <div class="form-field">
            <label for="prompt">Prompt</label>
            <select
              id="prompt"
              required
              value={prompt}
              onChange={(e) => {
                setPrompt(e.currentTarget.value);
                setVersion('');
              }}
            >
              <option value="">Seleccionar prompt</option>
              {prompts.data?.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div class="form-field">
            <label for="version">Versión</label>
            <select
              id="version"
              required
              value={version}
              onChange={(e) => setVersion(e.currentTarget.value)}
            >
              <option value="">Seleccionar versión</option>
              {versions.data?.map((v) => (
                <option value={v.id} key={v.id}>
                  v{v.version} · {v.model}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={!ws || busy || !version || !dataset}>
            <PlayCircle size={17} /> Ejecutar evaluación
          </Button>
          <FormError error={error} />
        </form>
      </Panel>
      <Panel
        title="Historial de ejecuciones"
        description="Resultados, casos y estado persistido por el worker."
      >
        {runs.isPending ? (
          <Loading />
        ) : runs.error ? (
          <ErrorState error={runs.error} />
        ) : !runs.data?.length ? (
          <Empty title="No hay evaluaciones" />
        ) : (
          <DataTable
            headers={['Ejecución', 'Estado', 'Calidad', 'Casos', 'Acción']}
          >
            {runs.data.map((run) => (
              <tr key={run.id}>
                <td class="mono">{run.id.slice(0, 10)}</td>
                <td>
                  <Status value={run.status} />
                </td>
                <td>
                  {run.score === null
                    ? '—'
                    : `${(Number(run.score) * 100).toFixed(1)}%`}
                </td>
                <td>
                  {run.passed_cases}/{run.total_cases}
                </td>
                <td>
                  <button
                    class="inline-link"
                    onClick={() => setSelected(run.id)}
                  >
                    Ver resultados
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
      {selected && (
        <Panel
          title={`Resultados · ${selected.slice(0, 12)}`}
          description="Respuestas observadas y veredicto determinista."
        >
          {results.isPending ? (
            <Loading />
          ) : results.error ? (
            <ErrorState error={results.error} />
          ) : !results.data?.length ? (
            <Empty title="Resultados pendientes" />
          ) : (
            <DataTable headers={['Resultado', 'Salida del modelo']}>
              {results.data.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Status value={item.passed ? 'passed' : 'failed'} />
                  </td>
                  <td class="wrap-text">{item.actual_output}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>
      )}
    </>
  );
}
