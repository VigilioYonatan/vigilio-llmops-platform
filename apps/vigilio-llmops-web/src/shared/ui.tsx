import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Inbox,
  LoaderCircle,
} from 'lucide-preact';
import { Component, type ComponentChildren } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { notify, toast } from './navigation';
import { generateQrMatrix } from './qr';

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled = false,
  loading = false,
  ariaLabel,
}: {
  children: ComponentChildren;
  onClick?: () => void;
  variant?: 'primary' | 'subtle' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
  loading?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type={type}
      class={`btn btn-${variant}`}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-busy={loading ? 'true' : undefined}
    >
      {loading && <LoaderCircle class="spin" size={16} aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Panel({
  children,
  title,
  description,
  action,
}: {
  children: ComponentChildren;
  title?: string;
  description?: string;
  action?: ComponentChildren;
}) {
  return (
    <section class="panel">
      {(title || description || action) && (
        <header class="panel-heading">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Input({
  label,
  value,
  onInput,
  placeholder = '',
  type = 'text',
  required = false,
  minLength,
  maxLength,
  disabled = false,
  error,
  hint,
  id: customId,
}: {
  label: string;
  value: string;
  onInput: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  disabled?: boolean;
  error?: string;
  hint?: string;
  id?: string;
}) {
  const generatedId = useId();
  const id = customId ?? `input-${generatedId.replace(/:/g, '')}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div class="form-field">
      <label for={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        type={type as any}
        value={value}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={
          [error ? errorId : null, hint ? hintId : null]
            .filter(Boolean)
            .join(' ') || undefined
        }
        onInput={(event) => onInput(event.currentTarget.value)}
        autocomplete={type === 'password' ? 'current-password' : undefined}
      />
      {hint && (
        <small id={hintId} class="form-hint">
          {hint}
        </small>
      )}
      {error && (
        <small id={errorId} class="error-msg" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

export function Textarea({
  label,
  value,
  onInput,
  rows = 5,
  required = false,
  disabled = false,
  error,
  hint,
  id: customId,
}: {
  label: string;
  value: string;
  onInput: (value: string) => void;
  rows?: number;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: string;
  id?: string;
}) {
  const generatedId = useId();
  const id = customId ?? `textarea-${generatedId.replace(/:/g, '')}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div class="form-field">
      <label for={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        required={required}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={
          [error ? errorId : null, hint ? hintId : null]
            .filter(Boolean)
            .join(' ') || undefined
        }
        onInput={(event) => onInput(event.currentTarget.value)}
      />
      {hint && (
        <small id={hintId} class="form-hint">
          {hint}
        </small>
      )}
      {error && (
        <small id={errorId} class="error-msg" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

export function Empty({
  title = 'No hay datos todavía',
  description = 'Crea el primer elemento para comenzar.',
  action,
  icon,
}: {
  title?: string;
  description?: string;
  action?: ComponentChildren;
  icon?: ComponentChildren;
}) {
  return (
    <div class="empty-state">
      <div class="empty-state-icon">
        {icon ?? <Inbox size={26} />}
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div class="empty-state-action">{action}</div>}
    </div>
  );
}

export function Loading({
  label = 'Cargando datos…',
  rows = 3,
}: {
  label?: string;
  rows?: number;
} = {}) {
  return (
    <div class="loading-container" role="status" aria-label={label}>
      <div
        class="loading-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px',
          color: 'var(--muted)',
          fontSize: '0.85rem',
        }}
      >
        <LoaderCircle class="spin" size={16} /> <span>{label}</span>
      </div>
      <div
        class="skeleton-stack"
        style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton
            key={i}
            class="skeleton-shimmer"
            height="20px"
            width={i === rows - 1 ? '60%' : '100%'}
          />
        ))}
      </div>
    </div>
  );
}

export function Skeleton({
  class: className = '',
  width,
  height,
}: {
  class?: string;
  width?: string;
  height?: string;
}) {
  return (
    <div
      class={`skeleton-shimmer ${className}`}
      style={{ width, height }}
      role="status"
      aria-label="Cargando contenido..."
    />
  );
}

export function TableSkeleton({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div class="table-scroll" role="status" aria-label="Cargando tabla...">
      <table>
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i}>
                <Skeleton class="h-4 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}>
                  <Skeleton class="h-4 w-full" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div
      class="dashboard-skeleton"
      role="status"
      aria-label="Cargando panel..."
    >
      <div class="stat-grid">
        <Skeleton class="stat h-28" />
        <Skeleton class="stat h-28" />
        <Skeleton class="stat h-28" />
        <Skeleton class="stat h-28" />
      </div>
      <div class="content-grid mt-4">
        <Skeleton class="panel h-64" />
        <Skeleton class="panel h-64" />
      </div>
    </div>
  );
}

export function CardSkeleton({ count = 2 }: { count?: number } = {}) {
  return (
    <div
      class="card-skeleton-stack"
      role="status"
      aria-label="Cargando tarjetas..."
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} class="skeleton-card">
          <Skeleton height="20px" width="45%" class="mb-3" />
          <Skeleton height="15px" width="85%" class="mb-2" />
          <Skeleton height="15px" width="65%" />
        </div>
      ))}
    </div>
  );
}

export function BadgeSkeleton() {
  return <Skeleton width="64px" height="22px" class="skeleton-badge" />;
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <div class="error-state" role="alert">
      <AlertTriangle size={18} />{' '}
      {error instanceof Error
        ? error.message
        : 'No fue posible completar la solicitud.'}
    </div>
  );
}

export function Status({ value }: { value: string }) {
  const good = [
    'active',
    'success',
    'passed',
    'approved',
    'verified',
    'settled',
  ].includes(value);
  const bad = ['failed', 'error', 'rejected', 'rolled_back'].includes(value);
  return (
    <span class={`status status-${good ? 'good' : bad ? 'bad' : 'neutral'}`}>
      <span class="status-dot" />
      {value.replaceAll('_', ' ')}
    </span>
  );
}

export function Toast() {
  const current = toast.value;
  if (!current) return null;
  return (
    <div class={`toast toast-${current.kind}`} role="status" aria-live="polite">
      <span>
        {current.kind === 'success' ? (
          <Check size={18} />
        ) : (
          <AlertTriangle size={18} />
        )}
      </span>
      {current.message}
      <button
        aria-label="Cerrar notificación"
        onClick={() => (toast.value = null)}
      >
        ×
      </button>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ComponentChildren;
}) {
  return (
    <header class="page-header">
      <div>
        <span class="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div>{action}</div>
    </header>
  );
}

export function FormError({ error }: { error: string | null }) {
  return error ? (
    <div role="alert" class="error-state">
      {error}
    </div>
  ) : null;
}

export const showError = (error: unknown) =>
  notify(error instanceof Error ? error.message : 'Error inesperado', 'error');

export function CopyButton({
  text,
  label = 'Copiar',
  copiedLabel = 'Copiado',
  class: customClass = '',
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  class?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: Event) {
    e.stopPropagation();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      notify(`${label} al portapapeles`, 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify('No se pudo copiar al portapapeles', 'error');
    }
  }

  return (
    <button
      type="button"
      class={`copy-btn ${copied ? 'copied' : ''} ${customClass}`}
      onClick={handleCopy}
      aria-label={copied ? copiedLabel : label}
      title={copied ? copiedLabel : label}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}

export function ProgressBar({
  value,
  max = 100,
  label,
  showPercentage = true,
}: {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const isDanger = percent >= 90;
  const isWarning = percent >= 75 && percent < 90;

  return (
    <div
      class="progress-meter-wrap"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Progreso'}
    >
      {(label || showPercentage) && (
        <div class="progress-meter-labels">
          {label && <span class="progress-meter-title">{label}</span>}
          {showPercentage && (
            <span
              class={`progress-meter-pct mono ${
                isDanger ? 'pct-danger' : isWarning ? 'pct-warning' : 'pct-good'
              }`}
            >
              {percent.toFixed(1)}%
            </span>
          )}
        </div>
      )}
      <div class="progress-bar-track">
        <div
          class={`progress-bar-fill ${
            isDanger ? 'fill-danger' : isWarning ? 'fill-warning' : 'fill-good'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: ComponentChildren;
}) {
  return (
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((value) => (
              <th key={value} scope="col">
                {value}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function ActionLink({
  children,
  onClick,
}: {
  children: ComponentChildren;
  onClick: () => void;
}) {
  return (
    <button class="inline-link" onClick={onClick}>
      {children}
      <ArrowRight size={13} />
    </button>
  );
}

/** Native <dialog> Modal with focus management and backdrop */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) {
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute('open', '');
        }
      }
    } else {
      if (dialog.open) {
        try {
          dialog.close();
        } catch {
          dialog.removeAttribute('open');
        }
      }
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      class="confirm-modal"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      <div class="confirm-modal-box">
        <h3 id="confirm-dialog-title">{title}</h3>
        <p id="confirm-dialog-desc">{message}</p>
        <div class="confirm-modal-actions">
          <Button variant="subtle" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

/** Pure SVG QR Code renderer for MFA TOTP URIs */
export function QRCodeSvg({
  value,
  size = 180,
}: {
  value: string;
  size?: number;
}) {
  if (!value) return null;
  let matrix: boolean[][];
  try {
    matrix = generateQrMatrix(value);
  } catch {
    return <div class="qr-fallback">No se pudo generar el código QR.</div>;
  }

  const moduleCount = matrix.length;
  const padding = 2;
  const viewBoxSize = moduleCount + padding * 2;

  return (
    <div
      class="qrcode-wrapper"
      role="img"
      aria-label="Código QR para autenticación de dos factores"
    >
      <svg
        role="img"
        aria-label="Código QR para autenticación de dos factores"
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        width={size}
        height={size}
        style={{ shapeRendering: 'crispEdges' }}
      >
        <title>Código QR para autenticación de dos factores</title>
        <rect width={viewBoxSize} height={viewBoxSize} fill="#ffffff" />
        {matrix.flatMap((row, r) =>
          row.map((col, c) =>
            col ? (
              <rect
                key={`${r}-${c}`}
                x={c + padding}
                y={r + padding}
                width={1}
                height={1}
                fill="#000000"
              />
            ) : null,
          ),
        )}
      </svg>
    </div>
  );
}

/** ErrorBoundary component catching UI render crashes */
export class ErrorBoundary extends Component<
  { children: ComponentChildren; fallback?: ComponentChildren },
  { hasError: boolean; error: Error | null }
> {
  override state: { hasError: boolean; error: Error | null } = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): {
    hasError: boolean;
    error: Error;
  } {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught error:', error);
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div class="error-boundary-panel" role="alert">
          <div class="error-state">
            <AlertTriangle size={24} />
            <div>
              <h3 style={{ margin: '0 0 6px' }}>
                Se produjo un error inesperado en la interfaz
              </h3>
              <p style={{ margin: '0 0 12px' }}>
                {this.state.error?.message ?? 'Error desconocido'}
              </p>
              <Button
                variant="subtle"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
              >
                Recargar página
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
