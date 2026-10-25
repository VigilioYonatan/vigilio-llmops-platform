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
} from '../../shared/ui';

type Evaluator = { id: string; name: string; kind: string };
type Version = { id: string; version: number; sha256: string };
type Comparison = {
  id: string;
  score_delta: string | null;
  baseline_score: string;
  candidate_score: string;
};
export function QualityPage() {
  const ws = selectedWorkspace();
  const selected = useSignal('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'exact_match' | 'contains' | 'regex'>(
    'exact_match',
  );
  const [baseline, setBaseline] = useState('');
  const [candidate, setCandidate] = useState('');
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [rubric, setRubric] = useState('{}');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useQueryClient();
  const evaluators = useQuery({
    queryKey: ['evaluators', ws],
    enabled: !!ws,
    queryFn: () => api<Evaluator[]>(`/evaluators?workspace_id=${ws}`),
  });
  const versions = useQuery({
    queryKey: ['evaluator-versions', selected.value],
    enabled: !!selected.value,
    queryFn: () => api<Version[]>(`/evaluators/${selected.value}/versions`),
  });
  async function perform(run: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError(null);
    try {
      await run();
      await cache.invalidateQueries();
      notify(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="QUALITY / LAB"
        title="Evaluadores y comparaciones"
        description="Evaluadores deterministas versionados y análisis de regresiones de ejecuciones reales; la puntuación de un juez no calibrado no aprueba una release."
      />
      <div class="two-col">
        <Panel title="Crear evaluador">
          <form
            class="form-pad"
            onSubmit={(e) => {
              e.preventDefault();
              if (ws)
                void perform(
                  () => post('/evaluators', { workspace_id: ws, name, kind }),
                  'Evaluador registrado',
                );
            }}
          >
            <Input
              label="Nombre del evaluador"
              value={name}
              onInput={setName}
              required
            />
            <div class="form-field">
              <label for="evaluator-kind">Tipo</label>
              <select
                id="evaluator-kind"
                value={kind}
                onChange={(e) => setKind(e.currentTarget.value as typeof kind)}
              >
                <option value="exact_match">Coincidencia exacta</option>
                <option value="contains">Contiene texto</option>
                <option value="regex">Expresión regular</option>
              </select>
            </div>
            <Button type="submit" disabled={busy || !ws}>
              Crear evaluador
            </Button>
          </form>
        </Panel>
        <Panel title="Evaluadores del workspace">
          {evaluators.isPending ? (
            <Loading />
          ) : evaluators.error ? (
            <ErrorState error={evaluators.error} />
          ) : !evaluators.data?.length ? (
            <Empty title="Sin evaluadores" />
          ) : (
            <div class="list-stack">
              {evaluators.data.map((v) => (
                <button
                  class={`list-item-button ${selected.value === v.id ? 'selected' : ''}`}
                  type="button"
                  key={v.id}
                  onClick={() => (selected.value = v.id)}
                >
                  <span>
                    <b>{v.name}</b>
                    <small>{v.kind}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>
      {selected.value && (
        <Panel title="Versiones del evaluador">
          <form
            class="form-pad"
            onSubmit={(e) => {
              e.preventDefault();
              void perform(
                () =>
                  post(`/evaluators/${selected.value}/versions`, {
                    rubric: JSON.parse(rubric) as unknown,
                  }),
                'Versión inmutable registrada',
              );
            }}
          >
            <Input
              label="Rúbrica JSON"
              value={rubric}
              onInput={setRubric}
              required
            />
            <Button type="submit" disabled={busy}>
              Crear nueva versión
            </Button>
          </form>
          {versions.isPending ? (
            <Loading />
          ) : versions.error ? (
            <ErrorState error={versions.error} />
          ) : !versions.data?.length ? (
            <Empty title="Sin versiones" />
          ) : (
            <DataTable headers={['Versión', 'Digest']}>
              {versions.data.map((v) => (
                <tr key={v.id}>
                  <td>{v.version}</td>
                  <td class="mono">{v.sha256}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>
      )}
      <Panel
        title="Comparación de ejecuciones"
        description="Usa UUIDs de dos ejecuciones completas del mismo workspace."
      >
        <form
          class="form-pad"
          onSubmit={(e) => {
            e.preventDefault();
            void perform(async () => {
              setComparison(
                await post<Comparison>('/evaluation-comparisons', {
                  baseline_run_id: baseline,
                  candidate_run_id: candidate,
                }),
              );
            }, 'Comparación generada');
          }}
        >
          <Input
            label="Baseline run UUID"
            value={baseline}
            onInput={setBaseline}
            required
          />
          <Input
            label="Candidate run UUID"
            value={candidate}
            onInput={setCandidate}
            required
          />
          <Button disabled={busy} type="submit">
            Comparar versiones
          </Button>
        </form>
        {comparison && (
          <div class="form-pad" role="status">
            <p>
              Baseline: <strong>{comparison.baseline_score}</strong>
            </p>
            <p>
              Candidate: <strong>{comparison.candidate_score}</strong>
            </p>
            <p>
              Delta:{' '}
              <strong>{comparison.score_delta ?? 'sin puntuación'}</strong>
            </p>
          </div>
        )}
      </Panel>
      <FormError error={error} />
    </>
  );
}
