import { useSignal } from '@preact/signals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Plus, ShieldCheck, Trash2, Upload } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { api, post, remove } from '../../api/http';
import { notify, selectedWorkspace } from '../../shared/navigation';
import type { Dataset, DatasetCase } from '../../shared/types';
import {
  Button,
  ConfirmDialog,
  Empty,
  ErrorState,
  FormError,
  Input,
  Loading,
  PageHeader,
  Panel,
  Textarea,
} from '../../shared/ui';

type DatasetVersion = {
  id: string;
  version: number;
  case_count: number;
  sha256: string;
  created_at: string;
};

export function DatasetsPage() {
  const ws = selectedWorkspace();
  const client = useQueryClient();
  const datasets = useQuery({
    queryKey: ['datasets', ws],
    enabled: !!ws,
    queryFn: () => api<Dataset[]>(`/datasets?workspace_id=${ws}`),
  });
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [expected, setExpected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmModal = useSignal<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const cases = useQuery({
    queryKey: ['dataset-cases', selected],
    enabled: !!selected,
    queryFn: () => api<DatasetCase[]>(`/datasets/${selected}/cases`),
  });

  const versions = useQuery({
    queryKey: ['dataset-versions', selected],
    enabled: !!selected,
    queryFn: () => api<DatasetVersion[]>(`/datasets/${selected}/versions`),
  });

  async function create(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const ds = await post<{ id: string }>('/datasets', {
        workspace_id: ws,
        name,
      });
      await client.invalidateQueries({ queryKey: ['datasets', ws] });
      setSelected(ds.id);
      setName('');
      notify('Dataset creado');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function add(e: Event) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await post(`/datasets/${selected}/cases`, {
        input,
        expected_output: expected,
      });
      setInput('');
      setExpected('');
      await client.invalidateQueries({ queryKey: ['dataset-cases', selected] });
      await client.invalidateQueries({ queryKey: ['datasets', ws] });
      notify('Caso guardado');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  function requestDeleteCase(id: string) {
    if (!selected) return;
    confirmModal.value = {
      title: 'Eliminar caso de prueba',
      message: '¿Estás seguro de que deseas eliminar este caso del dataset?',
      onConfirm: () => {
        void (async () => {
          try {
            await remove(`/datasets/${selected}/cases/${id}`);
            await cases.refetch();
            notify('Caso eliminado');
          } catch (err) {
            notify(err instanceof Error ? err.message : 'Error', 'error');
          }
        })();
      },
    };
  }

  async function freezeSnapshot() {
    if (!selected) return;
    setBusy(true);
    try {
      await post(`/datasets/${selected}/versions`, {});
      await versions.refetch();
      await client.invalidateQueries({ queryKey: ['datasets', ws] });
      notify('Versión congelada e inmutable creada');
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Error al congelar dataset',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="EVALUATION / DATASETS"
        title="Datasets de regresión"
        description="Define preguntas, respuestas esperadas y escenarios reproducibles para tus evaluaciones."
      />
      <div class="two-col">
        <Panel
          title="Nuevo dataset"
          description="Agrupa casos bajo una versión de conjunto auditable."
        >
          <form class="form-pad" onSubmit={create}>
            <Input
              label="Nombre"
              value={name}
              onInput={setName}
              required
              placeholder="hr-regression"
            />
            <FormError error={error} />
            <Button type="submit" disabled={busy || !ws}>
              <Database size={16} /> Crear dataset
            </Button>
          </form>
        </Panel>
        <Panel
          title="Tus datasets"
          description="Selecciona uno para administrar sus casos."
        >
          {datasets.isPending ? (
            <Loading />
          ) : datasets.error ? (
            <ErrorState error={datasets.error} />
          ) : !datasets.data?.length ? (
            <Empty title="Sin datasets" />
          ) : (
            <div class="list-stack">
              {datasets.data.map((ds) => (
                <button
                  type="button"
                  class={`list-item-button ${selected === ds.id ? 'selected' : ''}`}
                  key={ds.id}
                  onClick={() => setSelected(ds.id)}
                >
                  <span class="item-icon">
                    <Database size={18} />
                  </span>
                  <span>
                    <b>{ds.name}</b>
                    <small>{ds.case_count ?? 0} casos</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>
      {selected && (
        <>
          <div class="two-col">
            <Panel
              title="Agregar caso de prueba"
              description="Exact match determinista, con normalización Unicode y espacios."
            >
              <form class="form-pad" onSubmit={add}>
                <Textarea
                  label="Pregunta / input"
                  value={input}
                  onInput={setInput}
                  required
                />
                <Textarea
                  label="Respuesta esperada"
                  value={expected}
                  onInput={setExpected}
                  required
                />
                <Button type="submit" disabled={busy}>
                  <Plus size={16} /> Agregar caso
                </Button>
              </form>
            </Panel>
            <Panel
              title="Casos de prueba"
              description="El contenido puede ser sensible; evita incorporar datos personales."
            >
              {cases.isPending ? (
                <Loading />
              ) : cases.error ? (
                <ErrorState error={cases.error} />
              ) : !cases.data?.length ? (
                <Empty title="Sin casos" />
              ) : (
                <div class="list-stack case-stack">
                  {cases.data.map((item) => (
                    <article class="case-item" key={item.id}>
                      <small>INPUT</small>
                      <p>{item.input}</p>
                      <small>RESPUESTA ESPERADA</small>
                      <p>{item.expected_output}</p>
                      <button
                        type="button"
                        class="inline-link danger-link"
                        onClick={() => {
                          requestDeleteCase(item.id);
                        }}
                      >
                        <Trash2 size={14} /> Eliminar
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </Panel>
          </div>
          <Panel
            title="Snapshots inmutables de dataset"
            description="Congela el conjunto actual para que las evaluaciones y quality gates sean 100% reproducibles."
            action={
              <Button
                onClick={freezeSnapshot}
                disabled={busy || !cases.data?.length}
              >
                <ShieldCheck size={16} /> Congelar versión snapshot
              </Button>
            }
          >
            {versions.isPending ? (
              <Loading />
            ) : versions.error ? (
              <ErrorState error={versions.error} />
            ) : !versions.data?.length ? (
              <Empty
                title="Sin snapshots congelados"
                description="Genera el primer snapshot para fijar una versión auditable."
              />
            ) : (
              <div class="list-stack">
                {versions.data.map((v) => (
                  <div key={v.id} class="activity-item">
                    <span class="activity-icon">
                      <Database size={16} />
                    </span>
                    <div>
                      <b>
                        Versión #{v.version} ({v.case_count} casos)
                      </b>
                      <small class="mono">
                        Digest: {v.sha256?.slice(0, 16) ?? '—'}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}
      <ConfirmDialog
        open={!!confirmModal.value}
        title={confirmModal.value?.title ?? ''}
        message={confirmModal.value?.message ?? ''}
        onConfirm={() => {
          const action = confirmModal.value?.onConfirm;
          confirmModal.value = null;
          action?.();
        }}
        onCancel={() => {
          confirmModal.value = null;
        }}
      />
    </>
  );
}
