import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Beaker,
  BellRing,
  Blocks,
  BookText,
  BrainCircuit,
  Building2,
  ChartColumn,
  ChevronDown,
  Database,
  FileStack,
  Library,
  LogOut,
  Menu,
  Moon,
  PanelsTopLeft,
  Scale,
  ScanEye,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRoundPlus,
  Users,
  X,
  Zap,
} from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { post } from '../api/http';
import {
  navigate,
  notify,
  route,
  selectedWorkspace,
  sidebarOpen,
  switchWorkspace,
  theme,
} from './navigation';
import { useCurrentUser, useOrganizations, useWorkspaces } from './queries';
import { ErrorState, Loading, Toast } from './ui';

export type NavItem = {
  path: string;
  label: string;
  icon: typeof PanelsTopLeft;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const navigationSections: NavSection[] = [
  {
    title: 'Control Plane',
    items: [
      { path: '/app', label: 'Overview', icon: PanelsTopLeft },
      { path: '/app/onboarding', label: 'Onboarding', icon: Sparkles },
    ],
  },
  {
    title: 'Ingeniería de IA',
    items: [
      { path: '/app/playground', label: 'Playground & Gateway', icon: Zap },
      { path: '/app/prompts', label: 'Prompt Studio', icon: BookText },
      { path: '/app/knowledge', label: 'Conocimiento & RAG', icon: Library },
      { path: '/app/models', label: 'Model Registry', icon: BrainCircuit },
    ],
  },
  {
    title: 'Calidad & Releases',
    items: [
      { path: '/app/datasets', label: 'Datasets', icon: Database },
      { path: '/app/evaluations', label: 'Evaluaciones', icon: Activity },
      { path: '/app/quality', label: 'Quality Lab', icon: Beaker },
      { path: '/app/releases', label: 'Releases', icon: FileStack },
    ],
  },
  {
    title: 'Operaciones & FinOps',
    items: [
      { path: '/app/traces', label: 'Traces', icon: ScanEye },
      { path: '/app/operations', label: 'Alertas y SRE', icon: BellRing },
      { path: '/app/budgets', label: 'FinOps y Costos', icon: ChartColumn },
    ],
  },
  {
    title: 'Gobierno & IAM',
    items: [
      { path: '/app/applications', label: 'Aplicaciones & Keys', icon: Blocks },
      { path: '/app/team', label: 'Equipo y permisos', icon: Users },
      { path: '/app/invitations', label: 'Invitaciones', icon: UserRoundPlus },
      { path: '/app/governance', label: 'Gobierno y auditoría', icon: Scale },
      { path: '/app/settings', label: 'Configuración', icon: Building2 },
      { path: '/app/account', label: 'Mi cuenta', icon: ShieldCheck },
    ],
  },
];

export const allNavItems = navigationSections.flatMap((s) => s.items);

export function AppShell({ children }: { children: ComponentChildren }) {
  const me = useCurrentUser();
  const organizations = useOrganizations();
  const url = new URL(window.location.href);
  const paramOrg = url.searchParams.get('org_id');
  const activeOrg =
    (paramOrg ? organizations.data?.find((o) => o.id === paramOrg) : null) ??
    organizations.data?.find((o) => o.slug === 'vigilio-enterprise') ??
    organizations.data?.[0];
  const org_id = activeOrg?.id ?? null;
  const workspaces = useWorkspaces(org_id);
  const paramWs = selectedWorkspace();
  const activeWs =
    (paramWs ? workspaces.data?.find((w) => w.id === paramWs) : null) ??
    workspaces.data?.[0];
  const workspace_id = activeWs?.id ?? null;
  const client = useQueryClient();
  const currentPath = route.value.split('?')[0];
  useEffect(() => {
    if (me.error && 'status' in me.error && me.error.status === 401)
      navigate('/auth/login');
  }, [me.error]);
  useEffect(() => {
    if (org_id && workspace_id && (!url.searchParams.get('org_id') || !selectedWorkspace())) {
      const target = new URL(window.location.href);
      target.searchParams.set('org_id', org_id);
      target.searchParams.set('workspace_id', workspace_id);
      navigate(target.pathname + target.search);
    }
  }, [org_id, workspace_id]);
  async function logout() {
    try {
      await post('/auth/logout', {});
      client.clear();
      navigate('/auth/login');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'No se pudo cerrar sesión',
        'error',
      );
    }
  }
  if (me.isPending || organizations.isPending)
    return (
      <div class="page-loader">
        <Loading />
      </div>
    );
  if (me.error)
    return (
      <div class="page-loader">
        <ErrorState error={me.error} />
        <button
          type="button"
          class="btn btn-primary"
          onClick={() => navigate('/auth/login')}
        >
          Iniciar sesión
        </button>
      </div>
    );
  if (organizations.error)
    return (
      <div class="page-loader">
        <ErrorState error={organizations.error} />
      </div>
    );
  return (
    <div class={`application theme-${theme.value}`} data-theme={theme.value}>
      <a class="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      {sidebarOpen.value && (
        <button
          type="button"
          class="sidebar-overlay"
          aria-label="Cerrar menú"
          onClick={() => (sidebarOpen.value = false)}
        />
      )}
      <aside
        class={`sidebar ${sidebarOpen.value ? 'sidebar-visible' : ''}`}
        aria-label="Navegación principal"
      >
        <div class="sidebar-brand">
          <div class="brand">
            <span class="brand-mark">
              <Sparkles size={20} />
            </span>
            <span>
              VIGILIO<span class="brand-sub">LLMOPS PLATFORM</span>
            </span>
          </div>
          <button
            type="button"
            class="sidebar-close"
            aria-label="Cerrar"
            onClick={() => (sidebarOpen.value = false)}
          >
            <X size={18} />
          </button>
        </div>
        <div class="sidebar-context">
          <span class="sidebar-caption">ORGANIZACIÓN</span>
          <div class="select-wrap">
            <select
              aria-label="Organización"
              value={org_id ?? ''}
              onChange={(e) => navigate(`/app?org_id=${e.currentTarget.value}`)}
            >
              <option value="" disabled>
                Seleccionar
              </option>
              {organizations.data?.map((org) => (
                <option value={org.id} key={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>
          <span class="sidebar-caption workspace-label">WORKSPACE</span>
          <div class="select-wrap">
            <select
              aria-label="Workspace"
              value={workspace_id ?? ''}
              onChange={(e) => switchWorkspace(e.currentTarget.value)}
            >
              <option value="" disabled>
                Seleccionar
              </option>
              {workspaces.data?.map((ws) => (
                <option value={ws.id} key={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>
        </div>
        <nav class="sidebar-nav">
          {navigationSections.map((section) => (
            <div key={section.title} class="sidebar-group">
              <div class="sidebar-nav-heading">{section.title}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = currentPath === item.path;
                return (
                  <button
                    type="button"
                    key={item.path}
                    class={`sidebar-link ${active ? 'active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={() =>
                      navigate(
                        `${item.path}${org_id && workspace_id ? `?org_id=${org_id}&workspace_id=${workspace_id}` : ''}`,
                      )
                    }
                  >
                    <Icon size={18} strokeWidth={1.75} />
                    <span>{item.label}</span>
                    {active && <span class="active-indicator" />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div class="sidebar-bottom">
          <div class="sidebar-help">
            <Zap size={18} />
            <div>
              <b>Release guard</b>
              <span>Publicaciones bajo control</span>
            </div>
          </div>
          <button
            type="button"
            class="sidebar-link secondary-link"
            onClick={() => {
              theme.value = theme.value === 'dark' ? 'light' : 'dark';
            }}
          >
            {theme.value === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span>Cambiar tema</span>
          </button>
          <button
            type="button"
            class="sidebar-link secondary-link"
            onClick={logout}
          >
            <LogOut size={18} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>
      <div class="main-area">
        <header class="topbar">
          <div class="topbar-left">
            <button
              type="button"
              class="mobile-menu-btn"
              aria-label="Abrir navegación"
              onClick={() => (sidebarOpen.value = true)}
            >
              <Menu size={18} />
            </button>
            <div class="breadcrumb">
              <span class="breadcrumb-root">Platform</span>
              <span class="breadcrumb-slash">/</span>
              <span>
                {allNavItems.find((item) => item.path === currentPath)?.label ??
                  'Workspace'}
              </span>
            </div>
          </div>
          <div class="topbar-right">
            <span class="environment">
              <span class="online-indicator" />
              SELF-HOSTED
            </span>
            <div class="avatar" title={me.data?.email}>
              {(me.data?.display_name ?? '?').slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>
        <main id="main-content" class="main-content">
          {(!org_id || !workspace_id) && currentPath !== '/app/settings' ? (
            <div class="onboarding-notice">
              <h2>Comienza con tu organización</h2>
              <p>
                Configura tu organización y espacio de trabajo para desbloquear
                el panel.
              </p>
              <button
                type="button"
                class="btn btn-primary"
                onClick={() => navigate('/app/settings')}
              >
                Crear organización
              </button>
            </div>
          ) : (
            children
          )}
        </main>
        <footer class="footer">
          <span>Vigilio LLMOps · Control Plane</span>
          <span>Infraestructura privada · Observabilidad por diseño</span>
        </footer>
      </div>
      <Toast />
    </div>
  );
}
