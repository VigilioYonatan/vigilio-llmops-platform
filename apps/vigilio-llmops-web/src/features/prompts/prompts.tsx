import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookText, GitBranchPlus } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { api, post } from '../../api/http';
import { notify, selectedWorkspace } from '../../shared/navigation';
import type { Prompt, PromptVersion } from '../../shared/types';
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
  Textarea,
} from '../../shared/ui';
export function PromptsPage() {
  const ws = selectedWorkspace();
  const client = useQueryClient();
  const prompts = useQuery({
    queryKey: ['prompts', ws],
    enabled: !!ws,
    queryFn: () => api<Prompt[]>(`/prompts?workspace_id=${ws}`),
  });
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [template, setTemplate] = useState(
    'Eres un asistente preciso. Responde a: {{input}}',
  );
  const [model, setModel] = useState('llama3.2');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const versions = useQuery({
    queryKey: ['versions', selected],
    enabled: !!selected,
    queryFn: () => api<PromptVersion[]>(`/prompts/${selected}/versions`),
  });
  async function create(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const p = await post<{ id: string }>('/prompts', {
        workspace_id: ws,
        name,
        description,
      });
      await client.invalidateQueries({ queryKey: ['prompts', ws] });
      setName('');
      setDescription('');
      setSelected(p.id);
      notify('Prompt registrado');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  }
  async function version(e: Event) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await post(`/prompts/${selected}/versions`, {
        template,
        model,
        parameters: { temperature: 0 },
      });
      await client.invalidateQueries({ queryKey: ['versions', selected] });
      await client.invalidateQueries({ queryKey: ['prompts', ws] });
      notify('Versión inmutable creada');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="REGISTRY / PROMPT STUDIO"
        title="Prompts versionados"
        description="Mantén un historial auditable de instrucciones, modelos y configuraciones."
      />
      <div class="two-col">
        <Panel
          title="Nuevo prompt"
          description="Identidad lógica, independiente de sus versiones inmutables."
        >
          <form class="form-pad" onSubmit={create}>
            <Input
              label="Nombre del prompt"
              value={name}
              onInput={setName}
              required
              placeholder="support-responder"
            />
            <Textarea
              label="Descripción"
              value={description}
              onInput={setDescription}
              rows={2}
            />
            <FormError error={error} />
            <Button type="submit" disabled={busy || !ws}>
              <BookText size={16} /> Crear prompt
            </Button>
          </form>
        </Panel>
        <Panel
          title="Biblioteca"
          description="Selecciona un prompt para publicar una versión."
        >
          {prompts.isPending ? (
            <Loading />
          ) : prompts.error ? (
            <ErrorState error={prompts.error} />
          ) : !prompts.data?.length ? (
            <Empty title="La biblioteca está vacía" />
          ) : (
            <div class="list-stack">
              {prompts.data.map((prompt) => (
                <button
                  class={`list-item-button ${prompt.id === selected ? 'selected' : ''}`}
                  key={prompt.id}
                  onClick={() => setSelected(prompt.id)}
                >
                  <span class="item-icon">
                    <BookText size={18} />
                  </span>
                  <span>
                    <b>{prompt.name}</b>
                    <small>
                      Versión #{prompt.latest_version ?? 0} ·{' '}
                      {prompt.description ?? 'Sin descripción'}
                    </small>
                  </span>
                  <span class="list-chevron">›</span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>
      {selected && (
        <div class="two-col">
          <Panel
            title="Crear versión"
            description="Usa {{input}} para insertar el input del dataset al evaluar."
          >
            <form class="form-pad" onSubmit={version}>
              <Input
                label="Modelo Ollama permitido"
                value={model}
                onInput={setModel}
                required
              />
              <Textarea
                label="Plantilla del prompt"
                value={template}
                onInput={setTemplate}
                rows={9}
              />
              <Button type="submit" disabled={busy}>
                <GitBranchPlus size={16} /> Registrar versión
              </Button>
            </form>
          </Panel>
          <Panel
            title="Historial inmutable"
            description="Cada versión tiene un hash reproducible del contenido."
          >
            {versions.isPending ? (
              <Loading />
            ) : versions.error ? (
              <ErrorState error={versions.error} />
            ) : !versions.data?.length ? (
              <Empty title="Sin versiones" />
            ) : (
              <DataTable headers={['Versión', 'Modelo', 'Hash']}>
                {versions.data.map((item) => (
                  <tr key={item.id}>
                    <td>v{item.version}</td>
                    <td>{item.model}</td>
                    <td class="mono">{item.sha256?.slice(0, 14) ?? '—'}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
