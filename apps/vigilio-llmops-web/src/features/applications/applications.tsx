import { useSignal } from '@preact/signals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppWindow, Copy, KeyRound } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { api, post, remove } from '../../api/http';
import { notify, selectedWorkspace } from '../../shared/navigation';
import type { Application } from '../../shared/types';
import {
  Button,
  ConfirmDialog,
  CopyButton,
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

type Key = {
  id: string;
  prefix: string;
  scopes: string[];
  expires_at: string;
  revoked_at: string | null;
};
export function ApplicationsPage() {
  const ws = selectedWorkspace();
  const query = useQuery({
    queryKey: ['apps', ws],
    enabled: !!ws,
    queryFn: () => api<Application[]>(`/applications?workspace_id=${ws}`),
  });
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState('dev');
  const [selected, setSelected] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const confirmModal = useSignal<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const keys = useQuery({
    queryKey: ['keys', selected],
    enabled: !!selected,
    queryFn: () => api<Key[]>(`/applications/${selected}/keys`),
  });
  async function create(e: Event) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await post('/applications', { workspace_id: ws, name, environment });
      setName('');
      await client.invalidateQueries({ queryKey: ['apps', ws] });
      notify('Aplicación creada');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  }
  async function createKey() {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await post<{ token: string }>(
        `/applications/${selected}/keys`,
        { scopes: ['traces:write', 'gateway:execute'], expires_in_days: 90 },
      );
      setNewToken(result.token);
      await keys.refetch();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'No se pudo crear la clave',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }
  function requestRevokeKey(id: string) {
    if (!selected) return;
    confirmModal.value = {
      title: 'Revocar API Key',
      message:
        '¿Revocar la clave? Las llamadas existentes fallarán de inmediato.',
      onConfirm: () => {
        void (async () => {
          try {
            await remove(`/applications/${selected}/keys/${id}`);
            await keys.refetch();
            notify('Clave revocada');
          } catch (err) {
            notify(err instanceof Error ? err.message : 'Error', 'error');
          }
        })();
      },
    };
  }
  return (
    <>
      <PageHeader
        eyebrow="WORKSPACE / APPLICATIONS"
        title="Aplicaciones instrumentadas"
        description="Conecta agentes, RAG y servicios con credenciales acotadas y revocables."
      />
      <div class="two-col">
        <Panel
          title="Registrar aplicación"
          description="Aísla credenciales por ambiente y workspace."
        >
          <form class="form-pad" onSubmit={create}>
            <Input
              label="Nombre"
              value={name}
              onInput={setName}
              required
              placeholder="HR Assistant"
            />
            <div class="form-field">
              <label for="environment">Ambiente</label>
              <select
                id="environment"
                value={environment}
                onChange={(e) => setEnvironment(e.currentTarget.value)}
              >
                <option value="dev">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select>
            </div>
            <FormError error={error} />
            <Button type="submit" disabled={busy || !ws}>
              <AppWindow size={16} /> Registrar
            </Button>
          </form>
        </Panel>
        <Panel
          title="Tus aplicaciones"
          description="Selecciona una aplicación para administrar sus API keys."
        >
          {query.isPending ? (
            <Loading />
          ) : query.error ? (
            <ErrorState error={query.error} />
          ) : !query.data?.length ? (
            <Empty title="No hay aplicaciones" />
          ) : (
            <div class="list-stack">
              {query.data.map((app) => (
                <button
                  type="button"
                  class={`list-item-button ${selected === app.id ? 'selected' : ''}`}
                  key={app.id}
                  onClick={() => {
                    setSelected(app.id);
                    setNewToken(null);
                  }}
                >
                  <span class="item-icon">
                    <AppWindow size={18} />
                  </span>
                  <span>
                    <b>{app.name}</b>
                    <small>
                      {app.environment} · {app.id.slice(0, 8)}
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
        <Panel
          title="Credenciales de aplicación"
          description="Las claves se muestran completas una única vez. Cópialas y consérvalas en un gestor de secretos."
          action={
            <Button onClick={createKey} disabled={busy}>
              <KeyRound size={16} /> Generar clave
            </Button>
          }
        >
          {newToken && (
            <div class="secret-once" role="status">
              <strong>Clave nueva · visible una sola vez</strong>
              <code>{newToken}</code>
              <CopyButton
                text={newToken}
                label="Copiar clave API"
                copiedLabel="¡Clave copiada!"
              />
            </div>
          )}
          {keys.isPending ? (
            <Loading />
          ) : keys.error ? (
            <ErrorState error={keys.error} />
          ) : !keys.data?.length ? (
            <Empty title="Sin API keys" />
          ) : (
            <DataTable headers={['Prefijo', 'Scopes', 'Estado', 'Acción']}>
              {keys.data.map((key) => (
                <tr key={key.id}>
                  <td class="mono">{key.prefix}••••</td>
                  <td>{key.scopes.join(', ')}</td>
                  <td>
                    <Status value={key.revoked_at ? 'revoked' : 'active'} />
                  </td>
                  <td>
                    {!key.revoked_at && (
                      <button
                        type="button"
                        class="inline-link danger-link"
                        onClick={() => {
                          requestRevokeKey(key.id);
                        }}
                      >
                        Revocar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>
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
