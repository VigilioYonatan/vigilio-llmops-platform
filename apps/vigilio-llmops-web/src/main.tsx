import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from 'preact';
import { z } from 'zod';
import { AccountPage } from './features/account/account';
import { ApplicationsPage } from './features/applications/applications';
import { AuthPage } from './features/auth/auth';
import { DashboardPage } from './features/dashboard/dashboard';
import { DatasetsPage } from './features/datasets/datasets';
import { EvaluationsPage } from './features/evaluations/evaluations';
import { FinopsPage } from './features/finops/finops';
import { GovernancePage } from './features/governance/governance';
import { InvitationsPage } from './features/invitations/invitations';
import { KnowledgePage } from './features/knowledge/knowledge';
import { ModelsPage } from './features/models/models';
import { OnboardingPage } from './features/onboarding/onboarding';
import { OperationsPage } from './features/operations/operations';
import { OrganizationsPage } from './features/organizations/organizations';
import { PlaygroundPage } from './features/playground/playground';
import { PrivacyStatusPage } from './features/privacy/privacy-status';
import { PromptsPage } from './features/prompts/prompts';
import { QualityPage } from './features/quality/quality';
import { ReleasesPage } from './features/releases/releases';
import { TeamPage } from './features/team/team';
import { TracesPage } from './features/traces/traces';
import { AppShell } from './shared/app-shell';
import { initializeNavigation, navigate, route } from './shared/navigation';
import { ErrorBoundary } from './shared/ui';
import './styles.css';

// Set Spanish locale as default for Zod validations across the app
try {
  z.config(z.locales.es());
} catch {
  // Graceful fallback if locales already initialized
}

const client = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 15000,
    },
  },
});

initializeNavigation();

function App() {
  const path = route.value.split('?')[0];

  if (typeof document !== 'undefined') {
    const titles: Record<string, string> = {
      '/auth/login': 'Iniciar sesión · Vigilio LLMOps',
      '/auth/register': 'Crear cuenta · Vigilio LLMOps',
      '/auth/forgot': 'Recuperar contraseña · Vigilio LLMOps',
      '/privacy/deletion-status':
        'Estado de Eliminación de Datos · Vigilio LLMOps',
      '/app': 'Overview · Vigilio LLMOps',
      '/app/onboarding': 'Onboarding · Vigilio LLMOps',
      '/app/playground': 'Playground & Gateway · Vigilio LLMOps',
      '/app/applications': 'Aplicaciones · Vigilio LLMOps',
      '/app/prompts': 'Prompt Studio · Vigilio LLMOps',
      '/app/datasets': 'Datasets · Vigilio LLMOps',
      '/app/evaluations': 'Evaluaciones · Vigilio LLMOps',
      '/app/traces': 'Traces · Vigilio LLMOps',
      '/app/releases': 'Releases · Vigilio LLMOps',
      '/app/budgets': 'FinOps · Vigilio LLMOps',
      '/app/settings': 'Configuración · Vigilio LLMOps',
      '/app/account': 'Mi cuenta · Vigilio LLMOps',
      '/app/team': 'Equipo y permisos · Vigilio LLMOps',
      '/app/models': 'Model Registry · Vigilio LLMOps',
      '/app/operations': 'Alertas y SRE · Vigilio LLMOps',
      '/app/knowledge': 'Conocimiento y RAG · Vigilio LLMOps',
      '/app/governance': 'Gobierno y auditoría · Vigilio LLMOps',
      '/app/quality': 'Quality Lab · Vigilio LLMOps',
      '/app/invitations': 'Invitaciones · Vigilio LLMOps',
    };
    document.title = titles[path ?? ''] ?? 'Vigilio LLMOps Platform';
  }

  if (path?.startsWith('/auth')) return <AuthPage />;
  if (path?.startsWith('/privacy')) return <PrivacyStatusPage />;
  if (!path?.startsWith('/app')) {
    navigate('/auth/login');
    return null;
  }

  const body =
    path === '/app' ? (
      <DashboardPage />
    ) : path === '/app/onboarding' ? (
      <OnboardingPage />
    ) : path === '/app/playground' ? (
      <PlaygroundPage />
    ) : path === '/app/applications' ? (
      <ApplicationsPage />
    ) : path === '/app/prompts' ? (
      <PromptsPage />
    ) : path === '/app/datasets' ? (
      <DatasetsPage />
    ) : path === '/app/evaluations' ? (
      <EvaluationsPage />
    ) : path === '/app/traces' ? (
      <TracesPage />
    ) : path === '/app/releases' ? (
      <ReleasesPage />
    ) : path === '/app/budgets' ? (
      <FinopsPage />
    ) : path === '/app/settings' ? (
      <OrganizationsPage />
    ) : path === '/app/account' ? (
      <AccountPage />
    ) : path === '/app/team' ? (
      <TeamPage />
    ) : path === '/app/models' ? (
      <ModelsPage />
    ) : path === '/app/operations' ? (
      <OperationsPage />
    ) : path === '/app/knowledge' ? (
      <KnowledgePage />
    ) : path === '/app/governance' ? (
      <GovernancePage />
    ) : path === '/app/quality' ? (
      <QualityPage />
    ) : path === '/app/invitations' ? (
      <InvitationsPage />
    ) : (
      <DashboardPage />
    );

  return <AppShell>{body}</AppShell>;
}

render(
  <ErrorBoundary>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </ErrorBoundary>,
  document.getElementById('app')!,
);
