import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Check,
  Play,
  Sparkles,
  Wand2,
  Zap,
} from 'lucide-preact';
import { useState } from 'preact/hooks';
import { api, post, put } from '../../api/http';
import { notify, selectedWorkspace } from '../../shared/navigation';
import type { Model, Prompt, PromptVersion } from '../../shared/types';
import {
  Button,
  CopyButton,
  Empty,
  ErrorState,
  FormError,
  Input,
  Loading,
  PageHeader,
  Panel,
  Textarea,
} from '../../shared/ui';

type DiffResult = {
  diff: string;
  template_a: string;
  template_b: string;
};

export function PlaygroundPage() {
  const ws = selectedWorkspace();
  const [selectedPrompt, setSelectedPrompt] = useState<string>('');
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [diffVersionA, setDiffVersionA] = useState<string>('');
  const [diffVersionB, setDiffVersionB] = useState<string>('');
  const [aliasEnv, setAliasEnv] = useState<'dev' | 'staging' | 'production'>(
    'production',
  );
  const [aliasVersion, setAliasVersion] = useState<string>('');
  const [variablesInput, setVariablesInput] = useState<string>(
    '{"input": "Hola, ¿cómo funciona el RAG híbrido?"}',
  );
  const [output, setOutput] = useState<string>('');
  const [tokensUsed, setTokensUsed] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [diffOutput, setDiffOutput] = useState<DiffResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prompts = useQuery({
    queryKey: ['prompts', ws],
    enabled: !!ws,
    queryFn: () => api<Prompt[]>(`/prompts?workspace_id=${ws}`),
  });

  const models = useQuery({
    queryKey: ['models', ws],
    enabled: !!ws,
    queryFn: () => api<Model[]>(`/models?workspace_id=${ws}`),
  });

  const versions = useQuery({
    queryKey: ['versions', selectedPrompt],
    enabled: !!selectedPrompt,
    queryFn: () => api<PromptVersion[]>(`/prompts/${selectedPrompt}/versions`),
  });

  async function runPlayground(e?: Event) {
    if (e) e.preventDefault();
    if (!selectedPrompt || !selectedVersion) return;
    setBusy(true);
    setError(null);
    setOutput('');
    setTokensUsed(null);
    setLatencyMs(null);
    try {
      let parsedVariables: Record<string, unknown> = {};
      try {
        parsedVariables = JSON.parse(variablesInput);
      } catch {
        throw new Error(
          'Las variables deben ser un objeto JSON válido (ej: {"input": "texto"})',
        );
      }

      const res = await post<{
        output: string;
        tokens_used?: number;
        latency_ms?: number;
      }>(`/prompts/${selectedPrompt}/versions/${selectedVersion}/playground`, {
        variables: parsedVariables,
      });
      setOutput(res.output ?? JSON.stringify(res, null, 2));
      setTokensUsed(res.tokens_used ?? null);
      setLatencyMs(res.latency_ms ?? null);
      notify('Ejecución de playground completada');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error en la llamada del playground',
      );
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!busy && selectedPrompt && selectedVersion) {
        void runPlayground();
      }
    }
  }

  async function validateVariables() {
    if (!selectedPrompt || !selectedVersion) return;
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ valid: boolean; variables: string[] }>(
        `/prompts/${selectedPrompt}/versions/${selectedVersion}/validate`,
        {},
      );
      notify(`Variables detectadas: ${res.variables?.join(', ') || 'ninguna'}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al validar prompt');
    } finally {
      setBusy(false);
    }
  }

  async function compareDiff(e: Event) {
    e.preventDefault();
    if (!selectedPrompt || !diffVersionA || !diffVersionB) return;
    setBusy(true);
    setError(null);
    try {
      const res = await post<DiffResult>(`/prompts/${selectedPrompt}/diff`, {
        version_a: diffVersionA,
        version_b: diffVersionB,
      });
      setDiffOutput(res);
      notify('Comparación generada');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al comparar versiones',
      );
    } finally {
      setBusy(false);
    }
  }

  async function assignAlias(e: Event) {
    e.preventDefault();
    if (!selectedPrompt || !aliasVersion) return;
    setBusy(true);
    setError(null);
    try {
      await put(`/prompts/${selectedPrompt}/aliases/${aliasEnv}`, {
        version_id: aliasVersion,
      });
      notify(`Alias "${aliasEnv}" asignado a la versión seleccionada`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al asignar alias');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="GATEWAY / PLAYGROUND"
        title="AI Gateway & Prompt Lab"
        description="Experimenta, ejecuta plantillas parametrizadas con variables {{input}}, compara diffs entre versiones y promueve aliases por entorno."
      />

      <div class="two-col">
        <Panel
          title="Consola de ejecución"
          description="Selecciona un prompt versionado para simular la invocación del modelo en vivo."
        >
          <form class="form-pad" onSubmit={runPlayground}>
            <div class="form-field">
              <label for="pg-prompt">Prompt de la biblioteca</label>
              <select
                id="pg-prompt"
                value={selectedPrompt}
                onChange={(e) => {
                  setSelectedPrompt(e.currentTarget.value);
                  setSelectedVersion('');
                  setOutput('');
                }}
                required
              >
                <option value="">Seleccionar prompt...</option>
                {prompts.data?.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div class="form-field">
              <label for="pg-version">Versión inmutable</label>
              <select
                id="pg-version"
                value={selectedVersion}
                onChange={(e) => setSelectedVersion(e.currentTarget.value)}
                disabled={!selectedPrompt}
                required
              >
                <option value="">Seleccionar versión...</option>
                {versions.data?.map((v) => (
                  <option value={v.id} key={v.id}>
                    v{v.version} · Modelo: {v.model}
                  </option>
                ))}
              </select>
            </div>

            <div onKeyDown={handleKeyDown}>
              <Textarea
                label="Variables de plantilla (JSON)"
                value={variablesInput}
                onInput={setVariablesInput}
                rows={3}
                hint="Variables que reemplazan {{variable}} en la plantilla del prompt."
                required
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px', alignItems: 'center' }}>
              <Button
                type="submit"
                disabled={busy || !selectedPrompt || !selectedVersion}
                loading={busy}
              >
                <Play size={15} /> Ejecutar en Playground
                <kbd class="shortcut-kbd">Ctrl+↵</kbd>
              </Button>
              <Button
                variant="subtle"
                type="button"
                disabled={busy || !selectedPrompt || !selectedVersion}
                onClick={validateVariables}
              >
                <Wand2 size={15} /> Validar variables
              </Button>
            </div>
          </form>
        </Panel>

        <Panel
          title="Respuesta del modelo"
          description="Salida generada por el Gateway LLM a través de los proveedores conectados."
        >
          <div class="form-pad">
            {busy ? (
              <Loading label="Invocando modelo a través del Gateway..." />
            ) : output ? (
              <div class="playground-output-wrap">
                <div
                  class="output-topbar"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                    padding: '8px 12px',
                    background: 'var(--surface-two)',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'center',
                      fontSize: '12px',
                    }}
                  >
                    <span class="status status-good">
                      <span class="status-dot" /> 200 OK
                    </span>
                    {latencyMs != null && (
                      <span class="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        ⚡ {latencyMs} ms
                      </span>
                    )}
                    {tokensUsed != null && (
                      <span class="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        🪙 {tokensUsed} tokens
                      </span>
                    )}
                  </div>
                  <CopyButton text={output} label="Copiar salida" />
                </div>
                <div
                  style={{
                    background: 'var(--surface-two)',
                    border: '1px solid var(--line)',
                    borderRadius: '8px',
                    padding: '16px',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    whiteSpace: 'pre-wrap',
                    minHeight: '180px',
                    maxHeight: '360px',
                    overflowY: 'auto',
                    lineHeight: '1.6',
                  }}
                >
                  {output}
                </div>
              </div>
            ) : (
              <Empty
                title="Sin ejecución reciente"
                description="Selecciona una versión y haz clic en Ejecutar para ver la respuesta en vivo."
              />
            )}
          </div>
        </Panel>
      </div>

      <div class="two-col">
        <Panel
          title="Comparador Diff entre versiones"
          description="Contrasta cambios en plantillas o instrucciones entre dos revisiones."
        >
          <form class="form-pad" onSubmit={compareDiff}>
            <div class="form-field">
              <label for="diff-a">Versión Baseline (A)</label>
              <select
                id="diff-a"
                value={diffVersionA}
                onChange={(e) => setDiffVersionA(e.currentTarget.value)}
                disabled={!selectedPrompt}
                required
              >
                <option value="">Seleccionar versión A...</option>
                {versions.data?.map((v) => (
                  <option value={v.id} key={v.id}>
                    v{v.version} ({v.model})
                  </option>
                ))}
              </select>
            </div>

            <div class="form-field">
              <label for="diff-b">Versión Candidata (B)</label>
              <select
                id="diff-b"
                value={diffVersionB}
                onChange={(e) => setDiffVersionB(e.currentTarget.value)}
                disabled={!selectedPrompt}
                required
              >
                <option value="">Seleccionar versión B...</option>
                {versions.data?.map((v) => (
                  <option value={v.id} key={v.id}>
                    v{v.version} ({v.model})
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="submit"
              disabled={busy || !diffVersionA || !diffVersionB}
            >
              <ArrowLeftRight size={15} /> Comparar diff
            </Button>
          </form>

          {diffOutput && (
            <div
              class="form-pad"
              style={{ borderTop: '1px solid var(--line)' }}
            >
              <small class="eyebrow">DIFERENCIAS DETECTADAS</small>
              <pre
                class="mono"
                style={{
                  background: 'var(--surface-two)',
                  padding: '12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  overflowX: 'auto',
                }}
              >
                {diffOutput.diff ||
                  'No hay diferencias estructurales entre ambas plantillas.'}
              </pre>
            </div>
          )}
        </Panel>

        <Panel
          title="Promoción de aliases por entorno"
          description="Apunta alias lógicos (production, staging, dev) a una versión aprobada para llamadas SDK."
        >
          <form class="form-pad" onSubmit={assignAlias}>
            <div class="form-field">
              <label for="alias-env">Entorno de ejecución</label>
              <select
                id="alias-env"
                value={aliasEnv}
                onChange={(e) =>
                  setAliasEnv(e.currentTarget.value as typeof aliasEnv)
                }
              >
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="dev">Development</option>
              </select>
            </div>

            <div class="form-field">
              <label for="alias-v">Versión asignada</label>
              <select
                id="alias-v"
                value={aliasVersion}
                onChange={(e) => setAliasVersion(e.currentTarget.value)}
                disabled={!selectedPrompt}
                required
              >
                <option value="">Seleccionar versión...</option>
                {versions.data?.map((v) => (
                  <option value={v.id} key={v.id}>
                    v{v.version} ({v.model})
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="submit"
              disabled={busy || !selectedPrompt || !aliasVersion}
            >
              <Check size={15} /> Promocionar alias
            </Button>
          </form>
        </Panel>
      </div>

      <FormError error={error} />
    </>
  );
}
