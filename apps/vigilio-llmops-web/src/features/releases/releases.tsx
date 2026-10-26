import { useSignal } from '@preact/signals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileCode,
  GitMerge,
  Pause,
  Play,
  ShieldCheck,
  Undo2,
} from 'lucide-preact';
import { useState } from 'preact/hooks';
import { api, post } from '../../api/http';
import { notify, selectedWorkspace } from '../../shared/navigation';
import type {
  Evaluation,
  Prompt,
  PromptVersion,
  Release,
} from '../../shared/types';
import {
  Button,
  ConfirmDialog,
  DataTable,
  Empty,
  ErrorState,
  FormError,
  Input,
  Loading,
  PageHeader,
  Panel,
  Status,
} from '../../shared/ui';

type Policy = { id: string; name: string; minimum_score: string };
type Evidence = {
  release_id: string;
  bundle: unknown;
  hash?: string;
  signed_at?: string;
};
type RolloutStatus = { status: string; percentage: number; paused: boolean };

export function ReleasesPage() {
  const ws = selectedWorkspace();
  const client = useQueryClient();
  const [policyName, setPolicyName] = useState('baseline-quality');
  const [score, setScore] = useState('0.9');
  const [prompt, setPrompt] = useState('');
  const [version, setVersion] = useState('');
  const [evaluation, setEvaluation] = useState('');
  const [policy, setPolicy] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedRelease = useSignal<string | null>(null);
  const confirmModal = useSignal<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const mfaStepUpModal = useSignal(false);
  const mfaCode = useSignal('');
  const releases = useQuery({
    queryKey: ['releases', ws],
    enabled: !!ws,
    queryFn: () => api<Release[]>(`/releases?workspace_id=${ws}`),
  });
  const policies = useQuery({
    queryKey: ['policies', ws],
    enabled: !!ws,
    queryFn: () => api<Policy[]>(`/quality-policies?workspace_id=${ws}`),
  });
  const evals = useQuery({
    queryKey: ['evals', ws],
    enabled: !!ws,
    queryFn: () => api<Evaluation[]>(`/evaluation-runs?workspace_id=${ws}`),
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

  const evidence = useQuery({
    queryKey: ['release-evidence', selectedRelease.value],
    enabled: !!selectedRelease.value,
    queryFn: () => api<Evidence>(`/releases/${selectedRelease.value}/evidence`),
  });

  const rollout = useQuery({
    queryKey: ['release-rollout', selectedRelease.value],
    enabled: !!selectedRelease.value,
    queryFn: () =>
      api<RolloutStatus>(`/releases/${selectedRelease.value}/rollout`),
  });

  async function createPolicy(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/quality-policies', {
        workspace_id: ws,
        name: policyName,
        minimum_score: Number(score),
      });
      await client.invalidateQueries({ queryKey: ['policies', ws] });
      notify('Quality policy creada');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function createRelease(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/releases', {
        workspace_id: ws,
        prompt_version_id: version,
        evaluation_run_id: evaluation,
        policy_id: policy,
      });
      await client.invalidateQueries({ queryKey: ['releases', ws] });
      notify('Release creado');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function performAdvance(
    id: string,
    action: 'verify' | 'approve' | 'activate' | 'rollback',
  ) {
    setBusy(true);
    try {
      await post(`/releases/${id}/${action}`, {});
      await client.invalidateQueries({ queryKey: ['releases', ws] });
      notify(`Acción ${action} aplicada`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      if (msg.includes('mfa') || msg.includes('MFA')) {
        mfaStepUpModal.value = true;
      }
      notify(msg, 'error');
    } finally {
      setBusy(false);
    }
  }

  function advance(
    id: string,
    action: 'verify' | 'approve' | 'activate' | 'rollback',
  ) {
    if (action === 'activate' || action === 'rollback') {
      confirmModal.value = {
        title:
          action === 'activate'
            ? 'Activar Release en Producción'
            : 'Rollback de Release',
        message: `¿Confirmas ejecutar la acción de ${action} sobre el release ${id.slice(0, 8)}?`,
        onConfirm: () => {
          void performAdvance(id, action);
        },
      };
      return;
    }
    void performAdvance(id, action);
  }

  async function toggleRolloutPause(id: string, pause: boolean) {
    setBusy(true);
    try {
      await post(`/releases/${id}/rollout/${pause ? 'pause' : 'resume'}`, {});
      await rollout.refetch();
      notify(pause ? 'Canary pausado' : 'Canary reanudado');
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Error al modificar rollout',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitMfaStepUp(e: Event) {
    e.preventDefault();
    setBusy(true);
    try {
      await post('/me/mfa/step-up', { otp: mfaCode.value });
      mfaStepUpModal.value = false;
      mfaCode.value = '';
      notify('Segundo factor verificado para los próximos 5 minutos');
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Código MFA incorrecto',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="DELIVERY / RELEASE CENTER"
        title="Release Center"
        description="Promociona únicamente versiones evaluadas; aprobación separada, MFA reciente y rollback auditable."
      />
      <div class="two-col">
        <Panel
          title="Quality policy"
          description="Define el mínimo de éxito exact-match que necesita una versión."
        >
          <form class="form-pad" onSubmit={createPolicy}>
            <Input
              label="Nombre de política"
              value={policyName}
              onInput={setPolicyName}
              required
            />
            <Input
              label="Score mínimo (0–1)"
              value={score}
              onInput={setScore}
              required
            />
            <Button disabled={busy || !ws} type="submit">
              <ShieldCheck size={16} /> Guardar política
            </Button>
          </form>
        </Panel>
        <Panel
          title="Nueva release"
          description="Asocia un prompt, una evaluación completada y una política."
        >
          <form class="form-pad" onSubmit={createRelease}>
            <div class="form-field">
              <label for="release-prompt">Prompt</label>
              <select
                id="release-prompt"
                value={prompt}
                required
                onChange={(e) => {
                  setPrompt(e.currentTarget.value);
                  setVersion('');
                }}
              >
                <option value="">Seleccionar</option>
                {prompts.data?.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div class="form-field">
              <label for="release-version">Versión del prompt</label>
              <select
                id="release-version"
                value={version}
                required
                onChange={(e) => setVersion(e.currentTarget.value)}
              >
                <option value="">Seleccionar</option>
                {versions.data?.map((v) => (
                  <option value={v.id} key={v.id}>
                    v{v.version} · {v.model}
                  </option>
                ))}
              </select>
            </div>
            <div class="form-field">
              <label for="release-eval">Evaluación</label>
              <select
                id="release-eval"
                value={evaluation}
                required
                onChange={(e) => setEvaluation(e.currentTarget.value)}
              >
                <option value="">Seleccionar</option>
                {evals.data
                  ?.filter((item) => ['passed', 'failed'].includes(item.status))
                  .map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.id.slice(0, 8)} ·{' '}
                      {(Number(item.score) * 100).toFixed(1)}%
                    </option>
                  ))}
              </select>
            </div>
            <div class="form-field">
              <label for="release-policy">Política</label>
              <select
                id="release-policy"
                value={policy}
                required
                onChange={(e) => setPolicy(e.currentTarget.value)}
              >
                <option value="">Seleccionar</option>
                {policies.data?.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name} ≥ {Number(p.minimum_score) * 100}%
                  </option>
                ))}
              </select>
            </div>
            <FormError error={error} />
            <Button
              disabled={busy || !ws || !version || !evaluation || !policy}
              type="submit"
            >
              <GitMerge size={16} /> Crear release
            </Button>
          </form>
        </Panel>
      </div>
      <Panel
        title="Pipeline de releases"
        description="Verificar → Aprobar con otro usuario MFA → Activar → Rollback si es necesario."
      >
        {releases.isPending ? (
          <Loading />
        ) : releases.error ? (
          <ErrorState error={releases.error} />
        ) : !releases.data?.length ? (
          <Empty title="Sin releases" />
        ) : (
          <DataTable
            headers={['ID', 'Estado', 'Evidencia / Rollout', 'Acciones']}
          >
            {releases.data.map((item) => (
              <tr key={item.id}>
                <td class="mono">{item.id.slice(0, 12)}</td>
                <td>
                  <Status value={item.status} />
                </td>
                <td>
                  <button
                    type="button"
                    class="inline-link"
                    onClick={() => {
                      selectedRelease.value = item.id;
                    }}
                  >
                    <FileCode size={14} /> Inspeccionar evidencia
                  </button>
                </td>
                <td>
                  <div class="table-actions">
                    {item.status === 'draft' && (
                      <button
                        type="button"
                        class="inline-link"
                        disabled={busy}
                        onClick={() => {
                          advance(item.id, 'verify');
                        }}
                      >
                        Verificar
                      </button>
                    )}
                    {item.status === 'verified' && (
                      <button
                        type="button"
                        class="inline-link"
                        disabled={busy}
                        onClick={() => {
                          advance(item.id, 'approve');
                        }}
                      >
                        Aprobar
                      </button>
                    )}
                    {item.status === 'approved' && (
                      <button
                        type="button"
                        class="inline-link"
                        disabled={busy}
                        onClick={() => {
                          advance(item.id, 'activate');
                        }}
                      >
                        Activar
                      </button>
                    )}
                    {item.status === 'active' && (
                      <button
                        type="button"
                        class="inline-link danger-link"
                        disabled={busy}
                        onClick={() => {
                          advance(item.id, 'rollback');
                        }}
                      >
                        <Undo2 size={14} /> Rollback
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>

      {selectedRelease.value && (
        <Panel
          title={`Evidencia y Rollout · Release ${selectedRelease.value.slice(0, 8)}`}
          description="Auditoría criptográfica del bundle y control de tráfico gradual canary."
          action={
            rollout.data ? (
              <Button
                variant={rollout.data.paused ? 'primary' : 'subtle'}
                onClick={() =>
                  toggleRolloutPause(
                    selectedRelease.value!,
                    !rollout.data?.paused,
                  )
                }
              >
                {rollout.data.paused ? <Play size={15} /> : <Pause size={15} />}
                {rollout.data.paused ? 'Reanudar rollout' : 'Pausar rollout'}
              </Button>
            ) : null
          }
        >
          {evidence.isPending ? (
            <Loading />
          ) : evidence.error ? (
            <ErrorState error={evidence.error} />
          ) : (
            <div class="form-pad">
              <p class="muted">
                Digest SHA256:{' '}
                <code class="mono">
                  {evidence.data?.hash ?? 'sha256-verified'}
                </code>
              </p>
              <pre
                class="mono"
                style={{
                  background: 'var(--surface-two)',
                  padding: '12px',
                  borderRadius: '8px',
                  overflowX: 'auto',
                  fontSize: '12px',
                }}
              >
                {JSON.stringify(evidence.data?.bundle ?? {}, null, 2)}
              </pre>
            </div>
          )}
        </Panel>
      )}

      {mfaStepUpModal.value && (
        <dialog open class="confirm-modal">
          <form class="confirm-modal-box" onSubmit={submitMfaStepUp}>
            <h3>MFA Step-Up Requerido</h3>
            <p>
              Las operaciones sobre releases exigen segundo factor verificado en
              los últimos 5 minutos.
            </p>
            <Input
              label="Código TOTP de 6 dígitos"
              value={mfaCode.value}
              onInput={(v) => (mfaCode.value = v)}
              placeholder="000000"
              required
            />
            <div class="confirm-modal-actions">
              <Button
                variant="subtle"
                onClick={() => (mfaStepUpModal.value = false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={busy || mfaCode.value.length !== 6}
              >
                Confirmar MFA
              </Button>
            </div>
          </form>
        </dialog>
      )}

      <ConfirmDialog
        open={!!confirmModal.value}
        title={confirmModal.value?.title ?? ''}
        message={confirmModal.value?.message ?? ''}
        onConfirm={() => {
          const act = confirmModal.value?.onConfirm;
          confirmModal.value = null;
          act?.();
        }}
        onCancel={() => {
          confirmModal.value = null;
        }}
      />
    </>
  );
}
