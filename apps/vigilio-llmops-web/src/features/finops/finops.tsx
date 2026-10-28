import { useSignal } from '@preact/signals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calculator,
  Coins,
  CreditCard,
  FileSpreadsheet,
  RefreshCw,
  ShieldAlert,
} from 'lucide-preact';
import { useState } from 'preact/hooks';
import { api, post } from '../../api/http';
import { notify, route } from '../../shared/navigation';
import { useOrganizations } from '../../shared/queries';
import {
  Button,
  CopyButton,
  DataTable,
  Empty,
  ErrorState,
  FormError,
  Input,
  Loading,
  PageHeader,
  Panel,
  ProgressBar,
  Status,
} from '../../shared/ui';

type Budget = {
  organization_id: string;
  limit_usd: string;
  spent_usd: string;
  configured?: boolean;
};
type CostItem = {
  id: string;
  idempotency_key: string;
  estimated_usd: string;
  actual_usd: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  status: string;
  created_at: string;
};
type PriceCard = {
  id: string;
  model: string;
  price_input_per_million: string;
  price_output_per_million: string;
  effective_from: string;
};
type BudgetPolicy = {
  id: string;
  organization_id: string;
  limit_usd: string;
  spent_usd: string;
};
type SimulationResponse = {
  allowed: boolean;
  limit_usd: string;
  spent_usd: string;
  pending_usd: string;
  estimated_usd: string;
  simulation_only: boolean;
};

export function FinopsPage() {
  const orgs = useOrganizations();
  const org_id =
    new URLSearchParams(route.value.split('?')[1] ?? '').get('org_id') ??
    orgs.data?.[0]?.id ??
    null;
  const client = useQueryClient();
  const activeTab = useSignal<'budget' | 'ledger' | 'cards' | 'simulator'>(
    'budget',
  );

  const budget = useQuery({
    queryKey: ['budget', org_id],
    enabled: !!org_id,
    queryFn: async () => {
      const res = await api<Budget | null>(
        `/budgets?organization_id=${org_id}`,
      );
      return (
        res ?? {
          organization_id: org_id!,
          limit_usd: '0.000000',
          spent_usd: '0.000000',
          configured: false,
        }
      );
    },
  });

  const ledger = useQuery({
    queryKey: ['costs-ledger', org_id],
    enabled: !!org_id && activeTab.value === 'ledger',
    queryFn: () => api<CostItem[]>(`/costs/ledger?organization_id=${org_id}`),
  });

  const priceCards = useQuery({
    queryKey: ['price-cards', org_id],
    enabled: !!org_id && activeTab.value === 'cards',
    queryFn: () =>
      api<PriceCard[]>(`/costs/price-cards?organization_id=${org_id}`),
  });

  const policies = useQuery({
    queryKey: ['budget-policies', org_id],
    enabled: !!org_id && activeTab.value === 'simulator',
    queryFn: () =>
      api<BudgetPolicy[]>(`/budget-policies?organization_id=${org_id}`),
  });

  const [limit, setLimit] = useState('10.000000');
  const [modelCard, setModelCard] = useState('');
  const [inputPrice, setInputPrice] = useState('1.50000000');
  const [outputPrice, setOutputPrice] = useState('2.00000000');
  const [simulateAmount, setSimulateAmount] = useState('0.050000');
  const [simulateResult, setSimulateResult] = useState<string | null>(null);
  const [policyLimit, setPolicyLimit] = useState('100.000000');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: Event) {
    e.preventDefault();
    if (!org_id) return;
    setBusy(true);
    setError(null);
    try {
      await post('/budgets', { organization_id: org_id, limit_usd: limit });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['budget', org_id] }),
        client.invalidateQueries({ queryKey: ['budget-policies', org_id] }),
      ]);
      notify('Presupuesto actualizado');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al guardar presupuesto',
      );
    } finally {
      setBusy(false);
    }
  }

  async function addPriceCard(e: Event) {
    e.preventDefault();
    if (!org_id || !modelCard) return;
    setBusy(true);
    setError(null);
    try {
      await post('/costs/price-cards', {
        organization_id: org_id,
        model: modelCard,
        price_input_per_million: inputPrice,
        price_output_per_million: outputPrice,
      });
      await priceCards.refetch();
      setModelCard('');
      notify('Tarjeta de precio registrada');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al crear tarjeta de precio',
      );
    } finally {
      setBusy(false);
    }
  }

  async function createPolicy(e: Event) {
    e.preventDefault();
    if (!org_id) return;
    setBusy(true);
    setError(null);
    try {
      await post('/budgets', {
        organization_id: org_id,
        limit_usd: policyLimit,
      });
      await Promise.all([
        policies.refetch(),
        client.invalidateQueries({ queryKey: ['budget', org_id] }),
      ]);
      notify('Política de presupuesto actualizada');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al guardar política',
      );
    } finally {
      setBusy(false);
    }
  }

  async function runSimulation(policyId: string) {
    setBusy(true);
    setSimulateResult(null);
    try {
      const res = await post<SimulationResponse>(
        `/budget-policies/${policyId}/simulate`,
        { estimated_usd: simulateAmount },
      );
      const remaining = Math.max(
        0,
        Number(res.limit_usd) -
          Number(res.spent_usd) -
          Number(res.estimated_usd),
      ).toFixed(6);
      setSimulateResult(
        `Permitido: ${res.allowed ? 'SÍ' : 'NO'} · Límite: $${res.limit_usd} · Acumulado: $${res.spent_usd} · Remanente proyectado: $${remaining}`,
      );
      notify('Simulación de política ejecutada');
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Error al simular política',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  async function reconcileCosts() {
    if (!org_id) return;
    if (budget.data?.configured === false) {
      notify(
        'Configura primero un límite monetario antes de conciliar costos',
        'error',
      );
      return;
    }
    setBusy(true);
    try {
      await post('/costs/reconciliations', { organization_id: org_id });
      await client.invalidateQueries({ queryKey: ['budget', org_id] });
      notify('Conciliación transaccional de costos completada');
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Error en la conciliación',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  const isConfigured = budget.data?.configured !== false;
  const spending = Number(budget.data?.spent_usd ?? '0');
  const max = Number(budget.data?.limit_usd ?? '0');
  const percent = max ? Math.min(100, (spending / max) * 100) : 0;

  return (
    <>
      <PageHeader
        eyebrow="FINOPS / GUARDRAILS"
        title="FinOps, Ledger y Presupuestos"
        description="Contabilidad transaccional en punto fijo, control de límites en PostgreSQL con bloqueo pesimista y tarificación por token."
        action={
          <Button
            variant="subtle"
            onClick={reconcileCosts}
            disabled={busy || !org_id}
          >
            <RefreshCw size={15} /> Conciliar costos
          </Button>
        }
      />

      <div class="stat-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <article class="stat">
          <span>
            Presupuesto asignado
            <span class="stat-icon">
              <Coins size={17} />
            </span>
          </span>
          <strong class="mono">${max.toFixed(2)}</strong>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <small>USD · límite de organización</small>
            <span class="stat-trend neutral">Límite</span>
          </div>
        </article>
        <article class="stat stat-amber">
          <span>
            Gasto acumulado
            <span class="stat-icon amber">
              <ShieldAlert size={17} />
            </span>
          </span>
          <strong class="mono">${spending.toFixed(4)}</strong>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <small>Reservas y ejecuciones en firme</small>
            <span class="stat-trend neutral">Transaccional</span>
          </div>
        </article>
        <article class={`stat ${percent >= 85 ? 'stat-rose' : 'stat-emerald'}`}>
          <span>
            Utilización
            <span class={`stat-icon ${percent >= 85 ? 'rose' : 'emerald'}`}>
              <Coins size={17} />
            </span>
          </span>
          <strong class="mono">{percent.toFixed(1)}%</strong>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <small>Respecto del límite configurado</small>
            <span class={`stat-trend ${percent >= 85 ? 'neutral' : 'positive'}`}>
              {percent < 85 ? 'Saludable' : 'Alerta'}
            </span>
          </div>
        </article>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <Button
          variant={activeTab.value === 'budget' ? 'primary' : 'subtle'}
          onClick={() => (activeTab.value = 'budget')}
        >
          <Coins size={15} /> Presupuesto
        </Button>
        <Button
          variant={activeTab.value === 'ledger' ? 'primary' : 'subtle'}
          onClick={() => (activeTab.value = 'ledger')}
        >
          <FileSpreadsheet size={15} /> Cost Ledger
        </Button>
        <Button
          variant={activeTab.value === 'cards' ? 'primary' : 'subtle'}
          onClick={() => (activeTab.value = 'cards')}
        >
          <CreditCard size={15} /> Price Cards
        </Button>
        <Button
          variant={activeTab.value === 'simulator' ? 'primary' : 'subtle'}
          onClick={() => (activeTab.value = 'simulator')}
        >
          <Calculator size={15} /> Políticas &amp; Simulador
        </Button>
      </div>

      {activeTab.value === 'budget' && (
        <div class="two-col">
          <Panel
            title="Estado del presupuesto"
            description="Las reservas se efectúan con bloqueo PostgreSQL para evitar condiciones de carrera."
          >
            {budget.isPending ? (
              <Loading />
            ) : budget.error ? (
              <ErrorState error={budget.error} />
            ) : (
              <div class="budget-progress">
                <div class="progress-head">
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    Uso acumulado
                    <Status value={isConfigured ? (percent >= 100 ? 'exhausted' : percent >= 85 ? 'warning' : 'active') : 'unconfigured'} />
                  </span>
                  <b class="mono">{percent.toFixed(1)}%</b>
                </div>

                <ProgressBar
                  value={spending}
                  max={max}
                  showPercentage={false}
                />

                <div class="budget-stat-pills" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginTop: '16px' }}>
                  <div class="pill-stat" style={{ background: 'var(--surface-two)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>Remanente disponible</span>
                    <b class="mono" style={{ fontSize: '14px', color: 'var(--text)' }}>${Math.max(0, max - spending).toFixed(4)} USD</b>
                  </div>
                  <div class="pill-stat" style={{ background: 'var(--surface-two)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>Gasto ejecutado</span>
                    <b class="mono" style={{ fontSize: '14px', color: 'var(--text)' }}>${spending.toFixed(4)} USD</b>
                  </div>
                </div>

                {percent >= 85 && isConfigured && (
                  <div
                    class="budget-alert-warning"
                    role="alert"
                    style={{
                      marginTop: '14px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: 'rgba(245, 158, 11, 0.1)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      color: '#fbbf24',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <ShieldAlert size={18} />
                    <span>
                      Atención: Has consumido el {percent.toFixed(1)}% de tu presupuesto. Considera aumentar el límite para prevenir bloqueos de inferencia.
                    </span>
                  </div>
                )}

                {!isConfigured ? (
                  <p class="muted" style={{ marginTop: '16px' }}>
                    Esta organización aún no tiene una política monetaria activa
                    en <code>budget_policies</code>. Define un presupuesto
                    máximo a la derecha para habilitar reservas atómicas en el
                    Gateway.
                  </p>
                ) : (
                  <p class="muted" style={{ marginTop: '16px' }}>
                    El uso de modelos locales Ollama registra costo proveedor
                    0.00 USD, manteniendo aislados los gastos de red de la
                    infraestructura.
                  </p>
                )}
              </div>
            )}
          </Panel>

          <Panel
            title="Límite monetario del Tenant"
            description="Solo propietarios o administradores pueden modificar el límite de gasto."
          >
            <form class="form-pad" onSubmit={save}>
              <Input
                label="Presupuesto máximo (USD)"
                value={limit}
                onInput={setLimit}
                placeholder="10.000000"
                required
              />
              <FormError error={error} />
              <Button type="submit" disabled={busy || !org_id}>
                Guardar límite
              </Button>
            </form>
          </Panel>
        </div>
      )}

      {activeTab.value === 'ledger' && (
        <Panel
          title="Libro mayor contable (Cost Ledger)"
          description="Auditoría inmutable de cargos por llamada al Gateway, tokens consumidos y modelo empleado."
        >
          {ledger.isPending ? (
            <Loading label="Consultando ledger contable..." />
          ) : ledger.error ? (
            <ErrorState error={ledger.error} />
          ) : !ledger.data?.length ? (
            <Empty
              title="Sin movimientos registrados"
              description="Envía consultas a través del Gateway o SDK para poblar el ledger."
            />
          ) : (
            <DataTable
              headers={[
                'Fecha',
                'Modelo',
                'Estado',
                'Tokens Entrada',
                'Tokens Salida',
                'Estimado USD',
                'Liquidado USD',
                'Idempotencia',
              ]}
            >
              {ledger.data.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.created_at).toLocaleString()}</td>
                  <td><b>{item.model ?? '—'}</b></td>
                  <td>
                    <Status value={item.status} />
                  </td>
                  <td class="mono text-right">{item.input_tokens ?? 0}</td>
                  <td class="mono text-right">{item.output_tokens ?? 0}</td>
                  <td class="mono text-right">
                    ${Number(item.estimated_usd ?? 0).toFixed(6)}
                  </td>
                  <td class="mono text-right">
                    ${Number(item.actual_usd ?? 0).toFixed(8)}
                  </td>
                  <td>
                    <CopyButton
                      text={item.idempotency_key}
                      label={item.idempotency_key.slice(0, 8) + '…'}
                      copiedLabel="Copiado"
                    />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>
      )}

      {activeTab.value === 'cards' && (
        <div class="two-col">
          <Panel
            title="Nueva tarjeta de precios"
            description="Configura tarifas por millón de tokens para tarificar modelos externos."
          >
            <form class="form-pad" onSubmit={addPriceCard}>
              <Input
                label="Nombre de modelo"
                value={modelCard}
                onInput={setModelCard}
                placeholder="gpt-4o / claude-3-5-sonnet"
                required
              />
              <Input
                label="USD por millón tokens entrada"
                value={inputPrice}
                onInput={setInputPrice}
                placeholder="1.50000000"
                required
              />
              <Input
                label="USD por millón tokens salida"
                value={outputPrice}
                onInput={setOutputPrice}
                placeholder="2.00000000"
                required
              />
              <FormError error={error} />
              <Button type="submit" disabled={busy || !org_id || !modelCard}>
                <CreditCard size={15} /> Guardar tarjeta
              </Button>
            </form>
          </Panel>

          <Panel
            title="Tarjetas vigentes"
            description="Tarifas aplicadas por el motor de FinOps en cada reserva."
          >
            {priceCards.isPending ? (
              <Loading />
            ) : priceCards.error ? (
              <ErrorState error={priceCards.error} />
            ) : !priceCards.data?.length ? (
              <Empty title="Sin tarjetas de precios" />
            ) : (
              <DataTable
                headers={[
                  'Modelo',
                  'Input / 1M',
                  'Output / 1M',
                  'Vigente desde',
                ]}
              >
                {priceCards.data.map((card) => (
                  <tr key={card.id}>
                    <td>
                      <b>{card.model}</b>
                    </td>
                    <td class="mono">${card.price_input_per_million}</td>
                    <td class="mono">${card.price_output_per_million}</td>
                    <td class="muted">
                      {card.effective_from
                        ? new Date(card.effective_from).toLocaleDateString()
                        : '—'}
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Panel>
        </div>
      )}

      {activeTab.value === 'simulator' && (
        <div class="two-col">
          <Panel
            title="Crear política de presupuesto"
            description="Define techos de contención para proyectos específicos."
          >
            <form class="form-pad" onSubmit={createPolicy}>
              <Input
                label="Límite máximo de política (USD)"
                value={policyLimit}
                onInput={setPolicyLimit}
                placeholder="100.00"
                required
              />
              <Button type="submit" disabled={busy || !org_id}>
                <Coins size={15} /> Crear política
              </Button>
            </form>
          </Panel>

          <Panel
            title="Políticas activas y simulación"
            description="Simula consumos antes de desplegar agentes a producción."
          >
            <div class="form-pad">
              <Input
                label="Monto estimado a simular (USD)"
                value={simulateAmount}
                onInput={setSimulateAmount}
                placeholder="0.05"
                required
              />
              {simulateResult && (
                <div
                  role="status"
                  class="form-hint"
                  style={{
                    padding: '8px',
                    background: 'var(--surface-two)',
                    borderRadius: '6px',
                  }}
                >
                  <b>Resultado simulación:</b> {simulateResult}
                </div>
              )}
            </div>

            {policies.isPending ? (
              <Loading />
            ) : policies.error ? (
              <ErrorState error={policies.error} />
            ) : !policies.data?.length ? (
              <Empty title="Sin políticas de presupuesto" />
            ) : (
              <DataTable headers={['ID', 'Límite USD', 'Simulación']}>
                {policies.data.map((pol) => (
                  <tr key={pol.id}>
                    <td class="mono">{pol.id.slice(0, 10)}</td>
                    <td class="mono">${pol.limit_usd}</td>
                    <td>
                      <button
                        type="button"
                        class="inline-link"
                        disabled={busy}
                        onClick={() => runSimulation(pol.id)}
                      >
                        <Calculator size={14} /> Simular
                      </button>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
