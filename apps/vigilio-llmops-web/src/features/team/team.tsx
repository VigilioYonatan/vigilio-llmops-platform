import { useSignal } from '@preact/signals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { api, patch, post, remove } from '../../api/http';
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
} from '../../shared/ui';

type Member = { id: string; email: string; display_name: string; role: string };
const roles = ['admin', 'developer', 'approver', 'analyst', 'viewer'] as const;
export function TeamPage() {
  const orgs = useOrganizations();
  const org_id =
    new URLSearchParams(route.value.split('?')[1] ?? '').get('org_id') ??
    orgs.data?.[0]?.id ??
    null;
  const client = useQueryClient();
  const members = useQuery({
    queryKey: ['members', org_id],
    enabled: !!org_id,
    queryFn: () => api<Member[]>(`/organizations/${org_id}/members`),
  });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof roles)[number]>('developer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmModal = useSignal<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  async function run(job: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError(null);
    try {
      await job();
      await client.invalidateQueries({ queryKey: ['members', org_id] });
      notify(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setBusy(false);
    }
  }
  async function add(e: Event) {
    e.preventDefault();
    if (!org_id) return;
    await run(
      () => post(`/organizations/${org_id}/members`, { email, role }),
      'Miembro agregado',
    );
    setEmail('');
  }
  async function change(id: string, value: string) {
    if (!org_id) return;
    await run(
      () => patch(`/organizations/${org_id}/members/${id}`, { role: value }),
      'Permisos actualizados',
    );
  }
  function requestRevokeMember(id: string) {
    if (!org_id) return;
    confirmModal.value = {
      title: 'Revocar acceso a la organización',
      message:
        '¿Estás seguro de que deseas revocar el acceso de este usuario a la organización?',
      onConfirm: () => {
        void run(
          () => remove(`/organizations/${org_id}/members/${id}`),
          'Acceso revocado',
        );
      },
    };
  }
  return (
    <>
      <PageHeader
        eyebrow="ORGANIZATION / IAM"
        title="Equipo y permisos"
        description="RBAC por organización. Solo el propietario puede invitar, reasignar o revocar miembros; no es posible eliminar al propietario."
      />
      <Panel
        title="Agregar usuario existente"
        description="La cuenta debe existir y tener el correo verificado. No se envían invitaciones sin aceptación."
      >
        <form class="form-pad" onSubmit={add}>
          <Input
            label="Correo verificado"
            type="email"
            value={email}
            onInput={setEmail}
            required
          />
          <div class="form-field">
            <label for="member-role">Rol asignado</label>
            <select
              id="member-role"
              value={role}
              onChange={(e) =>
                setRole(e.currentTarget.value as (typeof roles)[number])
              }
            >
              {roles.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <FormError error={error} />
          <Button disabled={busy || !org_id} type="submit">
            <UserPlus size={16} /> Agregar miembro
          </Button>
        </form>
      </Panel>
      <Panel
        title="Miembros activos"
        description="Los cambios afectan únicamente a la organización seleccionada."
      >
        {members.isPending ? (
          <Loading />
        ) : members.error ? (
          <ErrorState error={members.error} />
        ) : !members.data?.length ? (
          <Empty title="No hay miembros" />
        ) : (
          <DataTable headers={['Identidad', 'Correo', 'Rol', 'Revocar']}>
            {members.data.map((member) => (
              <tr key={member.id}>
                <td>{member.display_name}</td>
                <td>{member.email}</td>
                <td>
                  <select
                    aria-label={`Rol de ${member.email}`}
                    value={member.role}
                    disabled={busy || member.role === 'owner'}
                    onChange={(e) => {
                      void change(member.id, e.currentTarget.value);
                    }}
                  >
                    {member.role === 'owner' && (
                      <option value="owner">owner</option>
                    )}
                    {roles.map((item) => (
                      <option value={item} key={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    type="button"
                    class="inline-link danger-link"
                    disabled={busy || member.role === 'owner'}
                    onClick={() => {
                      requestRevokeMember(member.id);
                    }}
                  >
                    Revocar
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
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
