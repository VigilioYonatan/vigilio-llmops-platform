import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Clock, Search } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { api } from '../../api/http';
import { navigate, route } from '../../shared/navigation';
import {
  Button,
  Empty,
  ErrorState,
  Input,
  Loading,
  Panel,
  Status,
} from '../../shared/ui';

type DeletionStatus = {
  confirmation_code: string;
  status: string;
  created_at: string;
  completed_at?: string | null;
  message?: string;
};

export function PrivacyStatusPage() {
  const urlParamCode =
    new URLSearchParams(route.value.split('?')[1] ?? '').get('code') ?? '';
  const [code, setCode] = useState(urlParamCode);
  const [queryCode, setQueryCode] = useState(urlParamCode);

  const status = useQuery({
    queryKey: ['privacy-deletion-status', queryCode],
    enabled: !!queryCode && queryCode.length >= 16,
    queryFn: () =>
      api<DeletionStatus>(
        `/privacy/deletion-status/${encodeURIComponent(queryCode)}`,
      ),
    retry: false,
  });

  function search(e: Event) {
    e.preventDefault();
    if (code.trim().length >= 16) {
      setQueryCode(code.trim());
    }
  }

  return (
    <div style={{ maxWidth: '780px', margin: '40px auto', padding: '0 20px' }}>
      <header style={{ marginBottom: '24px' }}>
        <button
          type="button"
          class="inline-link"
          onClick={() => navigate('/auth/login')}
          style={{ marginBottom: '16px' }}
        >
          <ArrowLeft size={14} /> Volver al inicio de sesión
        </button>
        <span class="eyebrow">GDPR &amp; META DATA DELETION</span>
        <h1 style={{ fontSize: '26px', fontWeight: 700, margin: '8px 0' }}>
          Estado de eliminación de datos personales
        </h1>
        <p class="muted" style={{ margin: 0, fontSize: '13px' }}>
          Consulta el estado de tu solicitud de borrado permanente conforme al
          derecho de supresión y la política de la plataforma.
        </p>
      </header>

      <Panel
        title="Consultar código de confirmación"
        description="Introduce el código de confirmación alfanumérico recibido tras solicitar la eliminación."
      >
        <form class="form-pad" onSubmit={search}>
          <Input
            label="Código de confirmación de purga"
            value={code}
            onInput={setCode}
            placeholder="del-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            minLength={16}
            maxLength={150}
            required
          />
          <Button type="submit" disabled={code.trim().length < 16}>
            <Search size={15} /> Consultar estado
          </Button>
        </form>

        {status.isPending && queryCode ? (
          <div class="form-pad">
            <Loading label="Consultando registro criptográfico de eliminación..." />
          </div>
        ) : status.error ? (
          <div class="form-pad">
            <ErrorState error={status.error} />
          </div>
        ) : status.data ? (
          <div class="form-pad" style={{ borderTop: '1px solid var(--line)' }}>
            <div class="activity-item">
              <span class="activity-icon">
                {status.data.status === 'completed' ? (
                  <CheckCircle2 size={18} class="text-emerald-500" />
                ) : (
                  <Clock size={18} class="text-amber-500" />
                )}
              </span>
              <div>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <b>Código: {status.data.confirmation_code}</b>
                  <Status value={status.data.status} />
                </div>
                <small>
                  Registrado el{' '}
                  {new Date(status.data.created_at).toLocaleString()}
                  {status.data.completed_at
                    ? ` · Purga completada el ${new Date(status.data.completed_at).toLocaleString()}`
                    : ''}
                </small>
                {status.data.message && (
                  <p style={{ margin: '8px 0 0', fontSize: '13px' }}>
                    {status.data.message}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div class="form-pad">
            <Empty
              title="Introduce un código válido"
              description="El código se genera de manera única al iniciar una solicitud de supresión o mediante webhook."
            />
          </div>
        )}
      </Panel>
    </div>
  );
}
