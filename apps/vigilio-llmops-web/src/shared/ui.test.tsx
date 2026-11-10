import { render } from 'preact';
import { describe, expect, it, vi } from 'vitest';
import { toast } from './navigation';
import {
  ActionLink,
  BadgeSkeleton,
  Button,
  CardSkeleton,
  ConfirmDialog,
  DashboardSkeleton,
  DataTable,
  Empty,
  ErrorBoundary,
  ErrorState,
  FormError,
  Input,
  Loading,
  PageHeader,
  Panel,
  QRCodeSvg,
  Skeleton,
  Status,
  showError,
  TableSkeleton,
  Textarea,
  Toast,
} from './ui';

describe('UI Primitives and Accessibility', () => {
  it('renders Input with accessible labels and error state', () => {
    const root = document.createElement('div');
    const onInput = vi.fn();
    render(
      <Input
        label="Correo corporativo"
        value="test@example.com"
        onInput={onInput}
        error="Dirección inválida"
        hint="Usa el correo de tu empresa"
        required
      />,
      root,
    );

    const input = root.querySelector('input')!;
    expect(input).toBeDefined();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('required')).toBe('');
    expect(input.value).toBe('test@example.com');

    const error = root.querySelector('.error-msg')!;
    expect(error.textContent).toContain('Dirección inválida');
    expect(error.getAttribute('role')).toBe('alert');
  });

  it('renders Textarea with accessibility attributes', () => {
    const root = document.createElement('div');
    const onInput = vi.fn();
    render(
      <Textarea
        label="Descripción del release"
        value="Versión preliminar"
        onInput={onInput}
        rows={4}
      />,
      root,
    );

    const textarea = root.querySelector('textarea')!;
    expect(textarea.value).toBe('Versión preliminar');
    expect(textarea.getAttribute('rows')).toBe('4');
  });

  it('renders Status badges with semantic class names', () => {
    const root = document.createElement('div');
    render(
      <div>
        <Status value="active" />
        <Status value="failed" />
        <Status value="draft" />
      </div>,
      root,
    );

    expect(root.querySelector('.status-good')?.textContent).toContain('active');
    expect(root.querySelector('.status-bad')?.textContent).toContain('failed');
    expect(root.querySelector('.status-neutral')?.textContent).toContain(
      'draft',
    );
  });

  it('renders Skeleton components for accessible loading states', () => {
    const root = document.createElement('div');
    render(
      <div>
        <Skeleton class="h-6 w-32" />
        <TableSkeleton rows={2} cols={3} />
        <DashboardSkeleton />
        <CardSkeleton count={2} />
        <BadgeSkeleton />
      </div>,
      root,
    );

    const skeletons = root.querySelectorAll('[role="status"]');
    expect(skeletons.length).toBeGreaterThan(0);
    expect(root.querySelectorAll('.skeleton-card').length).toBe(2);
  });

  it('renders Button with loading state and aria-busy', () => {
    const root = document.createElement('div');
    render(
      <Button loading={true} ariaLabel="Guardando cambios">
        Guardar
      </Button>,
      root,
    );

    const btn = root.querySelector('button')!;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(root.querySelector('.spin')).toBeDefined();
  });

  it('renders ConfirmDialog with dialog box and buttons', () => {
    const root = document.createElement('div');
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Confirmar eliminación"
        message="¿Estás seguro de que deseas eliminar este recurso?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
      root,
    );

    const dialog = root.querySelector('dialog');
    expect(dialog).toBeDefined();
    expect(root.textContent).toContain('Confirmar eliminación');
    expect(root.textContent).toContain(
      '¿Estás seguro de que deseas eliminar este recurso?',
    );
  });

  it('generates a valid SVG QR code for TOTP URI', () => {
    const root = document.createElement('div');
    const totpUri =
      'otpauth://totp/Vigilio:admin@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Vigilio';

    render(<QRCodeSvg value={totpUri} size={150} />, root);

    const svg = root.querySelector('svg');
    expect(svg).toBeDefined();
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('width')).toBe('150');

    const rects = svg?.querySelectorAll('rect');
    expect(rects?.length).toBeGreaterThan(10);
  });

  it('catches crashes gracefully with ErrorBoundary and supports custom fallback', async () => {
    const root = document.createElement('div');
    const CrashComponent = () => {
      throw new Error('Component crashed intentionally');
    };

    const originalError = console.error;
    console.error = vi.fn();

    render(
      <ErrorBoundary fallback={<div>Custom Error Fallback</div>}>
        <CrashComponent />
      </ErrorBoundary>,
      root,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    console.error = originalError;

    expect(root.textContent).toContain('Custom Error Fallback');
  });

  it('renders ConfirmDialog closed and supports canceling', () => {
    const root = document.createElement('div');
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open={false}
        title="Oculto"
        message="Mensaje"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
      root,
    );

    expect(root.querySelector('dialog')).toBeNull();
  });

  it('handles empty value in QRCodeSvg gracefully', () => {
    const root = document.createElement('div');
    render(<QRCodeSvg value="" />, root);
    expect(root.innerHTML).toBe('');
  });

  it('allows dismissing Toast notification by clicking close button', () => {
    const root = document.createElement('div');
    toast.value = { message: 'Mensaje temporal', kind: 'success' };
    render(<Toast />, root);

    const closeBtn = root.querySelector(
      'button[aria-label="Cerrar notificación"]',
    )!;
    expect(closeBtn).toBeDefined();
    closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(toast.value).toBeNull();
  });

  it('renders Button, Panel, PageHeader, Empty, Loading, and ErrorState', () => {
    const root = document.createElement('div');
    const onClick = vi.fn();

    render(
      <div>
        <PageHeader
          eyebrow="SYSTEM"
          title="Panel General"
          description="Monitoreo"
          action={<Button onClick={onClick}>Acción</Button>}
        />
        <Panel
          title="Sección Uno"
          description="Detalle"
          action={<span>Extra</span>}
        >
          <p>Contenido del panel</p>
        </Panel>
        <Empty title="Sin elementos" description="Crea uno" />
        <Loading />
        <ErrorState error={new Error('Fallo de red')} />
        <FormError error="Error de formulario" />
      </div>,
      root,
    );

    expect(root.textContent).toContain('Panel General');
    expect(root.textContent).toContain('Sección Uno');
    expect(root.textContent).toContain('Sin elementos');
    expect(root.textContent).toContain('Cargando datos');
    expect(root.textContent).toContain('Fallo de red');
    expect(root.textContent).toContain('Error de formulario');
  });

  it('renders DataTable and ActionLink', () => {
    const root = document.createElement('div');
    const onClick = vi.fn();

    render(
      <div>
        <DataTable headers={['Nombre', 'Rol']}>
          <tr>
            <td>Admin</td>
            <td>Owner</td>
          </tr>
        </DataTable>
        <ActionLink onClick={onClick}>Ver más</ActionLink>
      </div>,
      root,
    );

    expect(root.querySelector('th')?.textContent).toBe('Nombre');
    expect(root.querySelector('td')?.textContent).toBe('Admin');
    const link = root.querySelector('button.inline-link')!;
    link.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalled();
  });

  it('renders Toast notification when active and triggers showError', () => {
    const root = document.createElement('div');
    render(<Toast />, root);

    showError(new Error('Alerta crítica'));
    render(<Toast />, root);

    expect(toast.value?.kind).toBe('error');
    expect(toast.value?.message).toBe('Alerta crítica');
  });
});
