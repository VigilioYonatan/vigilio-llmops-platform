import { useSignal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { post, remove } from '../../api/http';
import { notify, route } from '../../shared/navigation';
import { useOrganizations } from '../../shared/queries';
import {
  Button,
  ConfirmDialog,
  FormError,
  Input,
  PageHeader,
  Panel,
  Skeleton,
} from '../../shared/ui';
export function InvitationsPage() {
  const organizations = useOrganizations();
  const org =
    new URLSearchParams(route.value.split('?')[1] ?? '').get('org_id') ??
    organizations.data?.[0]?.id;
  useEffect(() => {
    if (new URL(window.location.href).searchParams.has('token')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      url.searchParams.delete('id');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
  }, []);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [invitation, setInvitation] = useState(
    () => new URLSearchParams(window.location.search).get('id') ?? '',
  );
  const [token, setToken] = useState(
    () => new URLSearchParams(window.location.search).get('token') ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = useSignal<unknown>(null);
  const confirmModal = useSignal<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  if (organizations.isPending) {
    return (
      <>
        <PageHeader
          eyebrow="IDENTITY / INVITATIONS"
          title="Invitaciones y acceso"
          description="Invitaciones temporales por rol, aceptación vinculada al correo verificado y revocación explícita."
        />
        <div
          class="two-col"
          role="status"
          aria-label="Cargando invitaciones..."
        >
          <Skeleton class="panel h-64 w-full" />
          <Skeleton class="panel h-64 w-full" />
        </div>
      </>
    );
  }

  async function action(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      last.value = await fn();
      notify(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operación fallida');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="IDENTITY / INVITATIONS"
        title="Invitaciones y acceso"
        description="Invitaciones temporales por rol, aceptación vinculada al correo verificado y revocación explícita."
      />
      <div class="two-col">
        <Panel title="Invitar integrante">
          <form
            class="form-pad"
            onSubmit={(e) => {
              e.preventDefault();
              if (org)
                void action(
                  () =>
                    post(`/organizations/${org}/invitations`, { email, role }),
                  'Invitación creada y encolada para envío',
                );
            }}
          >
            <Input
              label="Email del invitado"
              type="email"
              value={email}
              onInput={setEmail}
              required
            />
            <div class="form-field">
              <label for="invite-role">Rol</label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.currentTarget.value)}
              >
                {['viewer', 'analyst', 'developer', 'approver', 'admin'].map(
                  (r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ),
                )}
              </select>
            </div>
            <Button type="submit" disabled={busy || !org}>
              Enviar invitación
            </Button>
          </form>
        </Panel>
        <Panel title="Aceptar invitación">
          <form
            class="form-pad"
            onSubmit={(e) => {
              e.preventDefault();
              void action(
                () => post(`/invitations/${invitation}/accept`, { token }),
                'Invitación aceptada',
              );
            }}
          >
            <Input
              label="ID de invitación"
              value={invitation}
              onInput={setInvitation}
              required
            />
            <Input
              label="Token privado de invitación"
              value={token}
              onInput={setToken}
              required
            />
            <Button type="submit" disabled={busy}>
              Aceptar
            </Button>
          </form>
        </Panel>
      </div>
      <Panel title="Revocar invitación">
        <form
          class="form-pad"
          onSubmit={(e) => {
            e.preventDefault();
            if (!org || !invitation) return;
            confirmModal.value = {
              title: 'Revocar invitación',
              message:
                '¿Estás seguro de que deseas revocar esta invitación de manera permanente?',
              onConfirm: () => {
                void action(
                  () =>
                    remove(`/organizations/${org}/invitations/${invitation}`),
                  'Invitación revocada',
                );
              },
            };
          }}
        >
          <Input
            label="ID para revocar"
            value={invitation}
            onInput={setInvitation}
            required
          />
          <Button variant="danger" disabled={busy || !org} type="submit">
            Revocar invitación
          </Button>
        </form>
      </Panel>
      <FormError error={error} />
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
