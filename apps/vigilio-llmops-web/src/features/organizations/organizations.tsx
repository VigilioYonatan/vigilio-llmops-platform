import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Edit3, FolderPlus, Shield, Users } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { api, patch, post } from '../../api/http';
import { navigate, notify, route } from '../../shared/navigation';
import { useOrganizations, useWorkspaces } from '../../shared/queries';
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

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 45);

export function OrganizationsPage() {
  const orgs = useOrganizations();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [editOrgName, setEditOrgName] = useState('');
  const [editWsName, setEditWsName] = useState('');
  const [selectedWsId, setSelectedWsId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();

  const org_id =
    new URLSearchParams(route.value.split('?')[1] ?? '').get('org_id') ??
    orgs.data?.[0]?.id ??
    null;
  const currentOrg = orgs.data?.find((o) => o.id === org_id);
  const wss = useWorkspaces(org_id);

  const members = useQuery({
    queryKey: ['members', org_id],
    enabled: !!org_id,
    queryFn: () =>
      api<
        Array<{ id: string; display_name: string; email: string; role: string }>
      >(`/organizations/${org_id}/members`),
  });

  const roles = useQuery({
    queryKey: ['roles', org_id],
    enabled: !!org_id,
    queryFn: () => api<string[]>(`/organizations/${org_id}/roles`),
  });

  async function createOrg(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const org = await post<{ id: string }>('/organizations', {
        name,
        slug: slug || slugify(name),
      });
      await client.invalidateQueries({ queryKey: ['organizations'] });
      setName('');
      setSlug('');
      navigate(`/app/settings?org_id=${org.id}`);
      notify('Organización creada');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al crear organización',
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateOrgName(e: Event) {
    e.preventDefault();
    if (!org_id || !editOrgName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await patch(`/organizations/${org_id}`, { name: editOrgName.trim() });
      await client.invalidateQueries({ queryKey: ['organizations'] });
      setEditOrgName('');
      notify('Nombre de organización actualizado');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al actualizar organización',
      );
    } finally {
      setBusy(false);
    }
  }

  async function createWorkspace(e: Event) {
    e.preventDefault();
    if (!org_id) return;
    setBusy(true);
    setError(null);
    try {
      const ws = await post<{ id: string }>(
        `/organizations/${org_id}/workspaces`,
        { name: workspaceName, slug: workspaceSlug || slugify(workspaceName) },
      );
      await client.invalidateQueries({ queryKey: ['workspaces', org_id] });
      setWorkspaceName('');
      setWorkspaceSlug('');
      navigate(`/app?org_id=${org_id}&workspace_id=${ws.id}`);
      notify('Workspace creado');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear workspace');
    } finally {
      setBusy(false);
    }
  }

  async function updateWorkspaceName(e: Event) {
    e.preventDefault();
    if (!selectedWsId || !editWsName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await patch(`/workspaces/${selectedWsId}`, { name: editWsName.trim() });
      await client.invalidateQueries({ queryKey: ['workspaces', org_id] });
      setEditWsName('');
      setSelectedWsId(null);
      notify('Workspace actualizado');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al actualizar workspace',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="PLATFORM / CONFIGURACIÓN"
        title="Organizaciones y espacios de trabajo"
        description="Gestión multi-tenant, separación lógica de ambientes y catálogo de roles RBAC."
      />
      <div class="two-col">
        <Panel
          title="Nueva organización"
          description="Los datos, métricas y claves quedan estrictamente aislados por tenant."
        >
          <form class="form-pad" onSubmit={createOrg}>
            <Input
              label="Nombre de organización"
              value={name}
              onInput={(value) => {
                setName(value);
                setSlug(slugify(value));
              }}
              placeholder="Acme AI Corporation"
              required
            />
            <Input
              label="Identificador único (slug)"
              value={slug}
              onInput={setSlug}
              placeholder="acme-ai"
              required
            />
            <FormError error={error} />
            <Button disabled={busy} type="submit">
              <Building2 size={16} /> Crear organización
            </Button>
          </form>
        </Panel>
        <Panel
          title="Nuevo workspace"
          description="Segmenta proyectos, modelos y presupuestos dentro de la organización activa."
        >
          <form class="form-pad" onSubmit={createWorkspace}>
            <Input
              label="Nombre del workspace"
              value={workspaceName}
              onInput={(value) => {
                setWorkspaceName(value);
                setWorkspaceSlug(slugify(value));
              }}
              placeholder="Producción Central"
              required
            />
            <Input
              label="Identificador del workspace (slug)"
              value={workspaceSlug}
              onInput={setWorkspaceSlug}
              placeholder="produccion-central"
              required
            />
            <Button disabled={busy || !org_id} type="submit">
              <FolderPlus size={16} /> Crear workspace
            </Button>
          </form>
        </Panel>
      </div>

      <div class="two-col">
        <Panel
          title="Tus organizaciones"
          description="Selecciona la organización activa o actualiza sus propiedades."
        >
          {orgs.isPending ? (
            <Loading />
          ) : orgs.error ? (
            <ErrorState error={orgs.error} />
          ) : !orgs.data?.length ? (
            <Empty title="Sin organizaciones" />
          ) : (
            <div class="list-stack">
              {orgs.data.map((org) => (
                <button
                  type="button"
                  class={`list-item-button ${org.id === org_id ? 'selected' : ''}`}
                  key={org.id}
                  onClick={() => {
                    navigate(`/app/settings?org_id=${org.id}`);
                    setEditOrgName(org.name);
                  }}
                >
                  <span class="item-icon">
                    <Building2 size={18} />
                  </span>
                  <span>
                    <b>{org.name}</b>
                    <small>
                      {org.slug} · Rol: {org.role}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
          {currentOrg && (
            <form class="form-pad" onSubmit={updateOrgName}>
              <Input
                label="Editar nombre de organización"
                value={editOrgName || currentOrg.name}
                onInput={setEditOrgName}
                required
              />
              <Button type="submit" disabled={busy || !editOrgName}>
                <Edit3 size={15} /> Guardar nombre
              </Button>
            </form>
          )}
        </Panel>

        <Panel
          title="Workspaces disponibles"
          description="Espacios de ejecución para la organización seleccionada."
        >
          {wss.isPending ? (
            <Loading />
          ) : wss.error ? (
            <ErrorState error={wss.error} />
          ) : !wss.data?.length ? (
            <Empty title="Sin workspaces en esta organización" />
          ) : (
            <div class="list-stack">
              {wss.data.map((ws) => (
                <button
                  type="button"
                  class={`list-item-button ${selectedWsId === ws.id ? 'selected' : ''}`}
                  key={ws.id}
                  onClick={() => {
                    setSelectedWsId(ws.id);
                    setEditWsName(ws.name);
                  }}
                >
                  <span class="item-icon">
                    <FolderPlus size={18} />
                  </span>
                  <span>
                    <b>{ws.name}</b>
                    <small>{ws.slug}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
          {selectedWsId && (
            <form class="form-pad" onSubmit={updateWorkspaceName}>
              <Input
                label="Renombrar workspace seleccionado"
                value={editWsName}
                onInput={setEditWsName}
                required
              />
              <Button type="submit" disabled={busy || !editWsName}>
                <Edit3 size={15} /> Actualizar workspace
              </Button>
            </form>
          )}
        </Panel>
      </div>

      <div class="two-col">
        <Panel
          title="Miembros de la organización"
          description="Usuarios con acceso al tenant actual."
        >
          {members.isPending ? (
            <Loading />
          ) : members.error ? (
            <ErrorState error={members.error} />
          ) : !members.data?.length ? (
            <Empty title="Sin miembros registrados" />
          ) : (
            <DataTable headers={['Nombre', 'Correo', 'Rol']}>
              {members.data.map((person) => (
                <tr key={person.id}>
                  <td>{person.display_name}</td>
                  <td>{person.email}</td>
                  <td>{person.role}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>

        <Panel
          title="Catálogo de roles RBAC"
          description="Matriz autoritativa de roles definidos por la organización."
        >
          {roles.isPending ? (
            <Loading />
          ) : roles.error ? (
            <ErrorState error={roles.error} />
          ) : !roles.data?.length ? (
            <Empty
              title="Catálogo estándar"
              description="owner, admin, developer, approver, analyst, viewer"
            />
          ) : (
            <div class="list-stack">
              {roles.data.map((r: any) => {
                const roleName = typeof r === 'string' ? r : r.role ?? 'Desconocido';
                const permCount = typeof r === 'object' && Array.isArray(r.permissions) ? r.permissions.length : null;
                return (
                  <div key={roleName} class="activity-item">
                    <span class="activity-icon">
                      <Shield size={17} />
                    </span>
                    <div>
                      <b>{roleName}</b>
                      <small>{permCount !== null ? `${permCount} permisos configurados en política tenant` : 'Permisos configurados en política tenant'}</small>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
