import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Rocket,
  Sparkles,
} from 'lucide-preact';
import { useState } from 'preact/hooks';
import { api, post } from '../../api/http';
import { navigate, notify } from '../../shared/navigation';
import { useCurrentUser, useOrganizations } from '../../shared/queries';
import {
  Button,
  ErrorState,
  FormError,
  Loading,
  PageHeader,
  Panel,
} from '../../shared/ui';

type OnboardingStatus = {
  email_verified: boolean;
  has_organization: boolean;
  completed: boolean;
};

export function OnboardingPage() {
  const me = useCurrentUser();
  const orgs = useOrganizations();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ['onboarding-status'],
    queryFn: () => api<OnboardingStatus>('/onboarding/status'),
  });

  async function complete() {
    setBusy(true);
    setError(null);
    try {
      await post('/onboarding/complete', {});
      await client.invalidateQueries({ queryKey: ['onboarding-status'] });
      notify(
        '¡Onboarding completado exitosamente! Bienvenido al Control Plane.',
      );
      navigate('/app');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al completar el onboarding',
      );
    } finally {
      setBusy(false);
    }
  }

  const steps = [
    {
      title: 'Verificación de Correo Electrónico',
      desc: 'Comprueba que tu dirección esté validada contra la base de datos de identidades.',
      done: status.data?.email_verified ?? false,
      action: !status.data?.email_verified ? (
        <Button variant="subtle" onClick={() => navigate('/auth/login')}>
          Verificar correo
        </Button>
      ) : null,
    },
    {
      title: 'Configurar Organización y Tenant',
      desc: 'Aísla tus aplicaciones, presupuestos y modelos bajo una entidad autorizada.',
      done: status.data?.has_organization ?? (orgs.data?.length ?? 0) > 0,
      action: !(
        status.data?.has_organization ?? (orgs.data?.length ?? 0) > 0
      ) ? (
        <Button variant="subtle" onClick={() => navigate('/app/settings')}>
          Crear organización
        </Button>
      ) : null,
    },
    {
      title: 'Crear Espacio de Trabajo (Workspace)',
      desc: 'Segmenta ambientes de ejecución (Development, Staging, Production).',
      done: (orgs.data?.length ?? 0) > 0,
      action: null,
    },
    {
      title: 'Conectar Modelo y Registrar Aplicación',
      desc: 'Registra tus proveedores (Ollama / OpenAI / Anthropic) y obtén tus API keys acotadas.',
      done: true,
      action: null,
    },
  ];

  const allReady =
    (status.data?.email_verified ?? false) &&
    (status.data?.has_organization ?? false);

  return (
    <>
      <PageHeader
        eyebrow="ONBOARDING / ACTIVACIÓN"
        title="Asistente de puesta en marcha"
        description={`Configura los pilares esenciales para ${me.data?.email ?? 'tu cuenta'} y desbloquea el Control Plane.`}
      />

      <div class="two-col">
        <Panel
          title="Progreso de configuración"
          description="Completa cada paso para activar tu entorno de trabajo seguro."
        >
          {status.isPending ? (
            <Loading label="Comprobando estado de activación..." />
          ) : status.error ? (
            <ErrorState error={status.error} />
          ) : (
            <div class="list-stack">
              {steps.map((s, idx) => (
                <div
                  key={idx}
                  class="activity-item"
                  style={{ alignItems: 'flex-start' }}
                >
                  <span class="activity-icon" style={{ marginTop: '2px' }}>
                    {s.done ? (
                      <CheckCircle2 size={18} class="text-emerald-500" />
                    ) : (
                      <Circle size={18} class="text-zinc-500" />
                    )}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <b>{s.title}</b>
                      {s.done ? (
                        <span class="status status-good">Listo</span>
                      ) : (
                        <span class="status status-neutral">Pendiente</span>
                      )}
                    </div>
                    <small>{s.desc}</small>
                    {s.action && (
                      <div style={{ marginTop: '8px' }}>{s.action}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Activación final"
          description="Al completar el asistente, tu cuenta quedará registrada como inicializada."
        >
          <div class="form-pad">
            <div
              class="hero-panel"
              style={{
                minHeight: 'auto',
                padding: '24px',
                marginBottom: '16px',
              }}
            >
              <div>
                <span class="hero-eyebrow">
                  <Sparkles size={14} /> PLATAFORMA SELF-HOSTED
                </span>
                <h3 style={{ margin: '8px 0', fontSize: '18px' }}>
                  {status.data?.completed
                    ? '¡Plataforma inicializada!'
                    : 'Casi listo para operar'}
                </h3>
                <p style={{ margin: 0, fontSize: '13px' }}>
                  {status.data?.completed
                    ? 'Tu cuenta ya completó el asistente inicial. Puedes reconfigurar tus recursos en cualquier momento desde Settings.'
                    : 'Asegúrate de haber verificado tu correo y de contar con al menos una organización activa.'}
                </p>
              </div>
            </div>

            <FormError error={error} />

            <Button
              disabled={busy || !allReady || (status.data?.completed ?? false)}
              onClick={complete}
            >
              <Rocket size={16} /> Completar Onboarding y entrar al Dashboard{' '}
              <ArrowRight size={16} />
            </Button>
          </div>
        </Panel>
      </div>
    </>
  );
}
