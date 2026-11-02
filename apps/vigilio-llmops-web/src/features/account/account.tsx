import { useSignal } from '@preact/signals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, ShieldCheck } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { api, patch, post, remove } from '../../api/http';
import { navigate, notify } from '../../shared/navigation';
import { useCurrentUser } from '../../shared/queries';
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
  QRCodeSvg,
} from '../../shared/ui';

type Session = {
  id: string;
  created_at: string;
  expires_at: string;
  mfa_verified_at: string | null;
};
type LinkedIdentity = { provider: string; created_at: string };
type MfaSetup = { secret: string; otpauth_url: string };
type MfaEnabled = { enabled: boolean; recovery_codes: string[] };
export function AccountPage() {
  const me = useCurrentUser(),
    client = useQueryClient();
  const sessions = useQuery({
    queryKey: ['account-sessions'],
    queryFn: () => api<Session[]>('/me/sessions'),
  });
  const identities = useQuery({
    queryKey: ['account-identities'],
    queryFn: () => api<LinkedIdentity[]>('/me/identities'),
  });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [recovery, setRecovery] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [emailPass, setEmailPass] = useState('');
  const [nextEmail, setNextEmail] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const confirmModal = useSignal<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  async function call(job: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    try {
      await job();
      notify(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setBusy(false);
    }
  }
  async function updateName(event: Event) {
    event.preventDefault();
    await call(async () => {
      await patch('/me', { display_name: name });
      await client.invalidateQueries({ queryKey: ['me'] });
    }, 'Perfil actualizado');
  }
  async function beginMfa(event: Event) {
    event.preventDefault();
    await call(async () => {
      const item = await post<MfaSetup>('/me/mfa/totp/setup', { password });
      setSetup(item);
      setPassword('');
    }, 'Añade la clave en tu aplicación autenticadora');
  }
  async function enableMfa(event: Event) {
    event.preventDefault();
    await call(async () => {
      const item = await post<MfaEnabled>('/me/mfa/totp/verify', { otp });
      setRecovery(item.recovery_codes);
      setOtp('');
      setSetup(null);
    }, 'MFA activado. Guarda los códigos de recuperación');
  }
  function requestRevoke(id: string) {
    confirmModal.value = {
      title: 'Revocar sesión',
      message: '¿Estás seguro de que deseas revocar esta sesión activa?',
      onConfirm: () => {
        void call(async () => {
          await remove(`/me/sessions/${encodeURIComponent(id)}`);
          await client.invalidateQueries({ queryKey: ['account-sessions'] });
        }, 'Sesión revocada');
      },
    };
  }
  async function changePassword(e: Event) {
    e.preventDefault();
    await call(async () => {
      await post('/me/password/change', {
        current_password: currentPass,
        new_password: newPass,
      });
      client.clear();
      navigate('/auth/login');
    }, 'Contraseña cambiada, inicia sesión de nuevo');
  }
  async function changeEmail(e: Event) {
    e.preventDefault();
    await call(async () => {
      await patch('/me/email', { next_email: nextEmail, password: emailPass });
      setEmailPass('');
    }, 'Enviamos un enlace de verificación al nuevo correo');
  }
  async function rotateRecovery(e: Event) {
    e.preventDefault();
    await call(async () => {
      const next = await post<{ recovery_codes: string[] }>(
        '/me/mfa/recovery-codes/rotate',
        { password: recoveryPassword },
      );
      setRecovery(next.recovery_codes);
      setRecoveryPassword('');
    }, 'Guarda tus nuevos códigos fuera del navegador');
  }
  function requestSignOutAll() {
    confirmModal.value = {
      title: 'Cerrar todas las sesiones',
      message:
        'Esta acción cerrará sesión en todos tus dispositivos inmediatamente.',
      onConfirm: () => {
        void call(async () => {
          await post('/auth/logout-all', {});
          client.clear();
          navigate('/auth/login');
        }, 'Sesiones revocadas');
      },
    };
  }
  function requestUnlink() {
    confirmModal.value = {
      title: 'Desvincular identidad Facebook',
      message: '¿Estás seguro de que deseas desconectar tu cuenta de Facebook?',
      onConfirm: () => {
        void call(async () => {
          await remove('/me/identities/facebook');
          await client.invalidateQueries({ queryKey: ['account-identities'] });
        }, 'Facebook desvinculado');
      },
    };
  }
  return (
    <>
      <PageHeader
        eyebrow="SECURITY / ACCOUNT"
        title="Mi cuenta y seguridad"
        description="Gestiona tu perfil, segundo factor, dispositivos e identidades conectadas."
      />
      <div class="two-col">
        <Panel
          title="Perfil"
          description="Información visible dentro de tus organizaciones."
        >
          <form class="form-pad" onSubmit={updateName}>
            <p class="muted">
              Cuenta: <strong>{me.data?.email ?? 'Cargando…'}</strong>
            </p>
            <Input
              label="Nombre visible"
              value={name}
              onInput={setName}
              placeholder={me.data?.display_name ?? ''}
              minLength={2}
              required
            />
            <Button type="submit" disabled={busy}>
              Guardar cambios
            </Button>
          </form>
        </Panel>
        <Panel
          title="Autenticación de dos factores"
          description="TOTP compatible con aplicaciones de autenticación; es obligatorio para aprobar releases."
        >
          <div class="form-pad">
            {!setup && !recovery.length && (
              <form onSubmit={beginMfa}>
                <Input
                  label="Contraseña actual"
                  value={password}
                  onInput={setPassword}
                  type="password"
                  required
                />
                <Button type="submit" disabled={busy}>
                  <KeyRound size={17} /> Configurar TOTP
                </Button>
              </form>
            )}
            {setup && (
              <form onSubmit={enableMfa}>
                <p class="muted">
                  Escanea el código QR o introduce la clave en tu autenticador.
                  No la compartas.
                </p>
                {setup.otpauth_url && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      margin: '16px 0',
                    }}
                  >
                    <QRCodeSvg value={setup.otpauth_url} size={180} />
                  </div>
                )}
                <div class="secret-preview">
                  <code>{setup.secret}</code>
                  <button
                    type="button"
                    class="inline-link"
                    onClick={() => {
                      void navigator.clipboard.writeText(setup.secret);
                      notify('Clave copiada');
                    }}
                    aria-label="Copiar clave TOTP"
                  >
                    <Copy size={16} />
                  </button>
                </div>
                <Input
                  label="Código de seis dígitos"
                  value={otp}
                  onInput={setOtp}
                  required
                />
                <Button disabled={busy} type="submit">
                  <ShieldCheck size={17} /> Verificar y activar
                </Button>
              </form>
            )}
            {recovery.length > 0 && (
              <section aria-label="Códigos de recuperación">
                <p class="form-hint">
                  Estos códigos se muestran una sola vez. Consérvalos fuera del
                  navegador antes de salir.
                </p>
                <div class="recovery-grid">
                  {recovery.map((code) => (
                    <code key={code}>{code}</code>
                  ))}
                </div>
                <button
                  class="inline-link"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(recovery.join('\n'));
                    notify('Códigos copiados');
                  }}
                >
                  Copiar todos
                </button>
                <button
                  class="inline-link"
                  type="button"
                  onClick={() => setRecovery([])}
                >
                  Ya los guardé
                </button>
              </section>
            )}
          </div>
        </Panel>
      </div>
      <div class="two-col">
        <Panel
          title="Cambiar contraseña"
          description="Revoca todas las sesiones después de actualizar la contraseña."
        >
          <form class="form-pad" onSubmit={changePassword}>
            <Input
              label="Contraseña vigente"
              value={currentPass}
              onInput={setCurrentPass}
              type="password"
              required
            />
            <Input
              label="Nueva contraseña segura"
              value={newPass}
              onInput={setNewPass}
              type="password"
              minLength={12}
              required
            />
            <Button type="submit" disabled={busy || newPass.length < 12}>
              Actualizar contraseña
            </Button>
          </form>
        </Panel>
        <Panel
          title="Cambiar email"
          description="Requiere MFA reciente y confirmación de la nueva dirección."
        >
          <form class="form-pad" onSubmit={changeEmail}>
            <Input
              label="Nuevo correo"
              type="email"
              value={nextEmail}
              onInput={setNextEmail}
              required
            />
            <Input
              label="Contraseña para confirmar"
              type="password"
              value={emailPass}
              onInput={setEmailPass}
              required
            />
            <Button disabled={busy || !nextEmail} type="submit">
              Enviar verificación
            </Button>
          </form>
        </Panel>
      </div>
      <Panel
        title="Códigos de recuperación y sesiones"
        description="Los nuevos códigos invalidan los anteriores; revocar todo cierra sesión inmediatamente."
      >
        <div class="two-col">
          <form class="form-pad" onSubmit={rotateRecovery}>
            <Input
              label="Contraseña para regenerar códigos"
              type="password"
              value={recoveryPassword}
              onInput={setRecoveryPassword}
              required
            />
            <Button type="submit" disabled={busy}>
              Regenerar códigos MFA
            </Button>
          </form>
          <div class="form-pad">
            <p class="muted">
              ¿Has perdido un dispositivo o sospechas de actividad desconocida?
            </p>
            <Button
              variant="danger"
              disabled={busy}
              onClick={requestSignOutAll}
            >
              Cerrar todas las sesiones
            </Button>
          </div>
        </div>
      </Panel>
      <Panel
        title="Sesiones activas"
        description="Revoca dispositivos que no reconozcas."
      >
        {sessions.isPending ? (
          <Loading />
        ) : sessions.error ? (
          <ErrorState error={sessions.error} />
        ) : !sessions.data?.length ? (
          <Empty title="Sin sesiones" />
        ) : (
          <DataTable
            headers={['Sesión', 'Creada', 'Expiración', 'MFA', 'Acción']}
          >
            {sessions.data.map((s) => (
              <tr key={s.id}>
                <td class="mono">{s.id.slice(0, 12)}</td>
                <td>{new Date(s.created_at).toLocaleString()}</td>
                <td>{new Date(s.expires_at).toLocaleString()}</td>
                <td>{s.mfa_verified_at ? 'Sí' : 'No'}</td>
                <td>
                  <button
                    type="button"
                    class="inline-link danger-link"
                    onClick={() => {
                      requestRevoke(s.id);
                    }}
                    disabled={busy}
                  >
                    Revocar
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
      <Panel
        title="Identidades conectadas"
        description="La vinculación requiere MFA reciente. Facebook es una integración externa opcional."
      >
        {identities.isPending ? (
          <Loading />
        ) : identities.error ? (
          <ErrorState error={identities.error} />
        ) : (
          <div class="form-pad">
            <p>
              Facebook:{' '}
              {identities.data?.some((item) => item.provider === 'facebook')
                ? 'Conectado'
                : 'No conectado'}
            </p>
            {identities.data?.some((item) => item.provider === 'facebook') ? (
              <Button variant="danger" disabled={busy} onClick={requestUnlink}>
                Desvincular Facebook
              </Button>
            ) : (
              <p class="form-hint">
                La vinculación protegida está disponible mediante POST
                /api/v1/me/identities/facebook; inicia sesión local con MFA
                antes de utilizarla.
              </p>
            )}
          </div>
        )}
      </Panel>
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
