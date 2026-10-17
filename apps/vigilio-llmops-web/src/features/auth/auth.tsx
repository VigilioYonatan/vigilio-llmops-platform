import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Eye, EyeOff, ShieldCheck, Sparkles } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { post } from '../../api/http';
import { navigate, route } from '../../shared/navigation';
import { FormError } from '../../shared/ui';

const params = () => new URLSearchParams(route.value.split('?')[1] ?? '');
export function AuthPage() {
  const path = route.value.split('?')[0] ?? '/auth/login';
  const mode = path.endsWith('/register')
    ? 'register'
    : path.endsWith('/forgot')
      ? 'forgot'
      : path.endsWith('/reset')
        ? 'reset'
        : path.endsWith('/verify')
          ? 'verify'
          : path.endsWith('/email-change')
            ? 'email-change'
            : 'login';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const client = useQueryClient();
  async function submit(event: Event) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      if (mode === 'register') {
        if (!consent)
          throw new Error(
            'Debes aceptar los términos y la política de privacidad',
          );
        await post('/auth/register', {
          email,
          password,
          display_name: name,
          consent_version: 'terms-2026-11',
        });
        setMessage(
          'Cuenta creada. Revisa tu correo para verificar la dirección.',
        );
      } else if (mode === 'login') {
        if (challenge) {
          await post('/auth/mfa/complete', {
            challenge_token: challenge,
            totp: otp || undefined,
            recovery_code: recoveryCode || undefined,
          });
          setChallenge(null);
        } else {
          const res = await post<{
            mfa_required?: boolean;
            challenge_token?: string;
          }>('/auth/login', {
            email,
            password,
            totp: otp || undefined,
            recovery_code: recoveryCode || undefined,
          });
          if (res.mfa_required) {
            if (!res.challenge_token)
              throw new Error('Desafío MFA no recibido');
            setChallenge(res.challenge_token);
            setMessage(
              'Confirma tu código temporal o de recuperación para terminar el inicio de sesión.',
            );
            return;
          }
        }
        await client.invalidateQueries({ queryKey: ['me'] });
        navigate('/app');
      } else if (mode === 'forgot') {
        await post('/auth/password/forgot', { email });
        setMessage(
          'Si existe una cuenta, recibirás instrucciones de recuperación.',
        );
      } else if (mode === 'reset') {
        await post('/auth/password/reset', {
          token: params().get('token'),
          password,
        });
        setMessage('Contraseña actualizada. Ya puedes iniciar sesión.');
      } else if (mode === 'verify') {
        await post('/auth/email/verify', { token: params().get('token') });
        setMessage('Correo verificado. Ya puedes iniciar sesión.');
      } else if (mode === 'email-change') {
        await post('/me/email/verify-change', { token: params().get('token') });
        setMessage('Nuevo correo verificado. Puedes volver a la consola.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operación fallida');
    } finally {
      setPending(false);
    }
  }
  return (
    <div class="auth-layout">
      <aside class="auth-story">
        <div class="brand brand-large">
          <span class="brand-mark">
            <Sparkles size={24} />
          </span>
          <span>
            VIGILIO <b>LLMOPS</b>
          </span>
        </div>
        <div class="auth-pitch">
          <span class="eyebrow eyebrow-light">
            CONTROL DE INTELIGENCIA ARTIFICIAL
          </span>
          <h1>
            Calidad que puedes <em>demostrar.</em>
          </h1>
          <p>
            Observa cada decisión. Evalúa cada versión. Publica IA confiable,
            con evidencia y control.
          </p>
          <div class="auth-features">
            <span>
              <ShieldCheck size={18} />
              Privacidad por defecto
            </span>
            <span>
              <ShieldCheck size={18} />
              Despliegues verificables
            </span>
            <span>
              <ShieldCheck size={18} />
              Observabilidad de extremo a extremo
            </span>
          </div>
        </div>
        <p class="auth-footnote">
          Infraestructura privada · Diseño self-hosted
        </p>
      </aside>
      <main class="auth-content">
        <div class="auth-card">
          <div class="auth-card-top">
            <span class="pill">PLATAFORMA DE AI OPERATIONS</span>
            <span class="auth-counter">v0.1</span>
          </div>
          <h2>
            {mode === 'login'
              ? 'Bienvenido de nuevo'
              : mode === 'register'
                ? 'Crear una cuenta'
                : mode === 'forgot'
                  ? 'Recuperar acceso'
                  : mode === 'reset'
                    ? 'Nueva contraseña'
                    : mode === 'email-change'
                      ? 'Confirmar nuevo correo'
                      : 'Verificar correo'}
          </h2>
          <p class="muted">
            {mode === 'login'
              ? 'Inicia sesión para continuar con tus operaciones.'
              : mode === 'register'
                ? 'Comienza con un espacio de trabajo seguro.'
                : mode === 'forgot'
                  ? 'Te enviaremos un enlace seguro, si tu cuenta existe.'
                  : mode === 'reset'
                    ? 'Tu nueva contraseña debe tener al menos 12 caracteres.'
                    : mode === 'email-change'
                      ? 'Confirma el cambio de correo desde tu sesión activa.'
                      : 'Confirma tu dirección para activar el acceso local.'}
          </p>
          <form class="auth-form" onSubmit={submit}>
            {mode === 'register' && (
              <div class="form-field">
                <label for="name">Nombre visible</label>
                <input
                  id="name"
                  value={name}
                  onInput={(e) => setName(e.currentTarget.value)}
                  required
                  minLength={2}
                  autocomplete="name"
                  placeholder="Nombre de tu equipo"
                />
              </div>
            )}
            {['login', 'register', 'forgot'].includes(mode) && !challenge && (
              <div class="form-field">
                <label for="email">Correo electrónico</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onInput={(e) => setEmail(e.currentTarget.value)}
                  required
                  autocomplete="email"
                  placeholder="tu@empresa.com"
                />
              </div>
            )}
            {['login', 'register', 'reset'].includes(mode) && !challenge && (
              <div class="form-field">
                <label for="password">Contraseña</label>
                <div class="password-field">
                  <input
                    id="password"
                    type={(visible ? 'text' : 'password') as any}
                    value={password}
                    onInput={(e) => setPassword(e.currentTarget.value)}
                    required
                    minLength={mode === 'login' ? 1 : 12}
                    autocomplete={
                      mode === 'login' ? 'current-password' : 'new-password'
                    }
                    placeholder="••••••••••••"
                  />
                  <button
                    type="button"
                    aria-label={
                      visible ? 'Ocultar contraseña' : 'Mostrar contraseña'
                    }
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}
            {mode === 'login' && (
              <div class="form-field">
                <label for="otp">Código MFA (si está activado)</label>
                <input
                  id="otp"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otp}
                  onInput={(e) => setOtp(e.currentTarget.value)}
                  placeholder="000000"
                  autocomplete="one-time-code"
                />
              </div>
            )}
            {mode === 'login' && (
              <div class="form-field">
                <label for="recovery-code">
                  Código de recuperación (en lugar de TOTP)
                </label>
                <input
                  id="recovery-code"
                  value={recoveryCode}
                  onInput={(e) => setRecoveryCode(e.currentTarget.value)}
                  autocomplete="off"
                  placeholder="Opcional si has perdido tu autenticador"
                />
              </div>
            )}
            {mode === 'register' && (
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.currentTarget.checked)}
                />{' '}
                Acepto los términos y la política de privacidad, versión
                2026-11.
              </label>
            )}
            <FormError error={error} />
            {message && (
              <p class="success-state" role="status">
                {message}
              </p>
            )}
            <button
              class="btn btn-primary auth-submit"
              disabled={pending}
              type="submit"
            >
              {pending
                ? 'Procesando…'
                : mode === 'login'
                  ? challenge
                    ? 'Completar segundo factor'
                    : 'Iniciar sesión'
                  : mode === 'register'
                    ? 'Crear cuenta'
                    : mode === 'forgot'
                      ? 'Enviar instrucciones'
                      : mode === 'reset'
                        ? 'Guardar contraseña'
                        : 'Verificar dirección'}{' '}
              <ArrowRight size={18} />
            </button>
          </form>
          {mode === 'login' && !challenge && (
            <>
              <div class="divider-label">
                <span>o continúa con</span>
              </div>
              <button
                class="facebook-button"
                type="button"
                onClick={() =>
                  window.location.assign(
                    '/api/v1/auth/facebook/start?return_to=%2Fapp',
                  )
                }
              >
                <span class="facebook-logo">f</span> Facebook Login
              </button>
              <button class="text-nav" onClick={() => navigate('/auth/forgot')}>
                ¿Olvidaste tu contraseña?
              </button>
            </>
          )}
          <div class="auth-alt">
            {mode === 'login'
              ? '¿No tienes una cuenta?'
              : '¿Ya tienes una cuenta?'}{' '}
            <button
              onClick={() => {
                setError(null);
                setMessage(null);
                navigate(mode === 'login' ? '/auth/register' : '/auth/login');
              }}
            >
              {mode === 'login' ? 'Registrarme' : 'Iniciar sesión'}
            </button>
          </div>
        </div>
        <small class="auth-legal">
          Tus sesiones utilizan cookies seguras. No almacenamos tokens en el
          navegador.
        </small>
      </main>
    </div>
  );
}
