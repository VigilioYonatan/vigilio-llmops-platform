import { useSignal } from '@preact/signals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'preact/hooks';
import { api, post } from '../../api/http';
import { notify, route } from '../../shared/navigation';
import { useOrganizations } from '../../shared/queries';
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

type AuditEvent = {
  id: number;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  created_at: string;
};
type DataRequest = {
  id: string;
  kind: string;
  status: string;
  reason: string;
  created_at: string;
};
export function GovernancePage() {
  const organizations = useOrganizations();
  const org =
    new URLSearchParams(route.value.split('?')[1] ?? '').get('org_id') ??
    organizations.data?.[0]?.id;
  const cache = useQueryClient();
  const events = useQuery({
    queryKey: ['audit-events', org],
    enabled: !!org,
    queryFn: () =>
      api<AuditEvent[]>(`/audit-events?organization_id=${org}&limit=50`),
  });
  const [reason, setReason] = useState('');
  const requestId = useSignal('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmModal = useSignal<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const status = useQuery({
    queryKey: ['data-request', requestId.value],
    enabled: !!requestId.value,
    queryFn: () => api<DataRequest>(`/data-requests/${requestId.value}`),
  });
  async function submitRequest(kind: 'export' | 'delete') {
    setBusy(true);
    setError(null);
    try {
      const result = await post<DataRequest>(`/data-requests/${kind}`, {
        reason,
      });
      requestId.value = result.id;
      await cache.invalidateQueries({ queryKey: ['data-request'] });
      notify('Solicitud registrada para revisión');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear solicitud');
    } finally {
      setBusy(false);
    }
  }
  function request(kind: 'export' | 'delete') {
    if (kind === 'delete') {
      confirmModal.value = {
        title: 'Solicitud de eliminación de datos',
        message:
          'La solicitud de eliminación requiere revisión humana y es irreversible una vez ejecutada. ¿Continuar?',
        onConfirm: () => {
          void submitRequest('delete');
        },
      };
      return;
    }
    void submitRequest(kind);
  }
  return (
    <>
      <PageHeader
        eyebrow="GOVERNANCE / PRIVACY"
        title="Auditoría y privacidad"
        description="Eventos auditables por organización y solicitudes de acceso o eliminación de datos, sin prometer purgas automáticas no verificadas."
      />
      <Panel
        title="Bitácora de seguridad y cambios"
        description="Acceso restringido por organización, ordenado desde los últimos eventos."
      >
        {events.isPending ? (
          <Loading />
        ) : events.error ? (
          <ErrorState error={events.error} />
        ) : !events.data?.length ? (
          <Empty title="No hay eventos" />
        ) : (
          <DataTable headers={['Fecha', 'Actor', 'Acción', 'Recurso']}>
            {events.data.map((v) => (
              <tr key={v.id}>
                <td>{new Date(v.created_at).toLocaleString()}</td>
                <td class="mono">{v.actor_id?.slice(0, 8) ?? 'sistema'}</td>
                <td>{v.action}</td>
                <td>
                  {v.resource_type} · {v.resource_id?.slice(0, 12)}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
      <div class="two-col">
        <Panel
          title="Ejercicio de derechos"
          description="Genera una solicitud trazable y revisable. No se exportan datos hasta superar autorización y revisión."
        >
          <div class="form-pad">
            <Input label="Motivo opcional" value={reason} onInput={setReason} />
            <div class="form-actions">
              <Button disabled={busy} onClick={() => void request('export')}>
                Solicitar exportación
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => void request('delete')}
              >
                Solicitar eliminación
              </Button>
            </div>
          </div>
        </Panel>
        <Panel title="Consultar solicitud">
          <div class="form-pad">
            <Input
              label="ID de solicitud"
              value={requestId.value}
              onInput={(v) => (requestId.value = v)}
              placeholder="UUID"
            />
            {status.isPending && requestId.value ? (
              <Loading />
            ) : status.error ? (
              <ErrorState error={status.error} />
            ) : status.data ? (
              <p role="status">
                Solicitud {status.data.id.slice(0, 8)}:{' '}
                <Status value={status.data.status} />
              </p>
            ) : (
              <p class="muted">
                Introduce el identificador de una solicitud propia.
              </p>
            )}
          </div>
        </Panel>
      </div>
      <FormError error={error} />
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
