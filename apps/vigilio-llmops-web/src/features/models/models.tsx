import { useSignal } from '@preact/signals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'preact/hooks';
import { api, post } from '../../api/http';
import { notify, route, selectedWorkspace } from '../../shared/navigation';
import { useOrganizations } from '../../shared/queries';
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
  Status,
} from '../../shared/ui';

type Provider = { id: string; name: string; kind: string; enabled: boolean };
type Model = {
  id: string;
  name: string;
  digest: string;
  provider_id: string;
  context_window: number;
  active: boolean;
};
type Route = {
  id: string;
  application_id: string;
  model_id: string;
  environment: string;
};
type App = { id: string; name: string };
export function ModelsPage() {
  const organizations = useOrganizations();
  const org =
    new URLSearchParams(route.value.split('?')[1] ?? '').get('org_id') ??
    organizations.data?.[0]?.id;
  const ws = selectedWorkspace();
  const query = useQueryClient();
  const providers = useQuery({
    queryKey: ['providers', org],
    enabled: !!org,
    queryFn: () => api<Provider[]>(`/providers?organization_id=${org}`),
  });
  const models = useQuery({
    queryKey: ['models', org],
    enabled: !!org,
    queryFn: () => api<Model[]>(`/models?organization_id=${org}`),
  });
  const apps = useQuery({
    queryKey: ['model-apps', ws],
    enabled: !!ws,
    queryFn: () => api<App[]>(`/applications?workspace_id=${ws}`),
  });
  const selectedApp = useSignal('');
  const chosenProvider = useSignal('');
  const modelName = useSignal('');
  const modelDigest = useSignal('');
  const environment = useSignal('dev');
  const chosenModel = useSignal('');
  const routes = useQuery({
    queryKey: ['model-routes', selectedApp.value],
    enabled: !!selectedApp.value,
    queryFn: () =>
      api<Route[]>(`/model-routes?application_id=${selectedApp.value}`),
  });
  const [providerName, setProviderName] = useState('');
  const [kind, setKind] = useState<'ollama' | 'openai-compatible'>('ollama');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function act(run: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await run();
      await query.invalidateQueries();
      notify(message);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo realizar la operación',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="PLATFORM / MODEL REGISTRY"
        title="Proveedores, modelos y routing"
        description="Inventario versionado, verificación de endpoints permitidos y routing por aplicación y ambiente."
      />
      <div class="two-col">
        <Panel
          title="Registrar proveedor"
          description="Los destinos se fijan por la configuración del servidor; esta UI no acepta URLs arbitrarias."
        >
          <form
            class="form-pad"
            onSubmit={(e) => {
              e.preventDefault();
              if (org)
                void act(
                  () =>
                    post('/providers', {
                      organization_id: org,
                      name: providerName,
                      kind,
                    }),
                  'Proveedor registrado',
                );
            }}
          >
            <Input
              label="Nombre del proveedor"
              value={providerName}
              onInput={setProviderName}
              required
            />
            <div class="form-field">
              <label for="provider-kind">Tipo</label>
              <select
                id="provider-kind"
                value={kind}
                onChange={(e) => setKind(e.currentTarget.value as typeof kind)}
              >
                <option value="ollama">Ollama local</option>
                <option value="openai-compatible">
                  OpenAI compatible permitido
                </option>
              </select>
            </div>
            <Button disabled={!org || busy} type="submit">
              Registrar proveedor
            </Button>
          </form>
        </Panel>
        <Panel title="Proveedores activos">
          {providers.isPending ? (
            <Loading />
          ) : providers.error ? (
            <ErrorState error={providers.error} />
          ) : !providers.data?.length ? (
            <Empty title="Sin proveedores" />
          ) : (
            <DataTable headers={['Proveedor', 'Tipo', 'Estado', 'Prueba']}>
              {providers.data.map((v) => (
                <tr key={v.id}>
                  <td>{v.name}</td>
                  <td>{v.kind}</td>
                  <td>
                    <Status value={v.enabled ? 'active' : 'disabled'} />
                  </td>
                  <td>
                    <button
                      class="inline-link"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () => post(`/providers/${v.id}/verify`, {}),
                          'Conexión comprobada',
                        )
                      }
                    >
                      Verificar
                    </button>
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>
      </div>
      <div class="two-col">
        <Panel title="Registrar modelo">
          <form
            class="form-pad"
            onSubmit={(e) => {
              e.preventDefault();
              if (org)
                void act(
                  () =>
                    post('/models', {
                      organization_id: org,
                      provider_id: chosenProvider.value,
                      name: modelName.value,
                      digest: modelDigest.value,
                      capabilities: ['chat'],
                      context_window: 4096,
                    }),
                  'Modelo registrado',
                );
            }}
          >
            <div class="form-field">
              <label for="catalog-provider">Proveedor</label>
              <select
                id="catalog-provider"
                required
                value={chosenProvider.value}
                onChange={(e) => (chosenProvider.value = e.currentTarget.value)}
              >
                <option value="">Seleccionar</option>
                {providers.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Modelo"
              value={modelName.value}
              onInput={(v) => (modelName.value = v)}
              required
            />
            <Input
              label="Digest o revisión inmutable"
              value={modelDigest.value}
              onInput={(v) => (modelDigest.value = v)}
              required
            />
            <Button type="submit" disabled={busy || !org}>
              Guardar versión
            </Button>
          </form>
        </Panel>
        <Panel title="Modelos disponibles">
          {models.isPending ? (
            <Loading />
          ) : models.error ? (
            <ErrorState error={models.error} />
          ) : !models.data?.length ? (
            <Empty title="Sin modelos" />
          ) : (
            <DataTable headers={['Modelo', 'Digest', 'Ventana', 'Estado']}>
              {models.data.map((v) => (
                <tr key={v.id}>
                  <td>{v.name}</td>
                  <td class="mono">{v.digest.slice(0, 18)}</td>
                  <td>{v.context_window}</td>
                  <td>
                    <Status value={v.active ? 'active' : 'disabled'} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>
      </div>
      <Panel
        title="Routing por aplicación"
        description="La configuración activa se usa por el gateway cuando una aplicación envía solicitudes."
      >
        <form
          class="form-pad"
          onSubmit={(e) => {
            e.preventDefault();
            void act(
              () =>
                post('/model-routes', {
                  application_id: selectedApp.value,
                  environment: environment.value,
                  model_id: chosenModel.value,
                }),
              'Ruta configurada',
            );
          }}
        >
          <div class="two-col">
            <div class="form-field">
              <label for="route-app">Aplicación</label>
              <select
                id="route-app"
                value={selectedApp.value}
                required
                onChange={(e) => (selectedApp.value = e.currentTarget.value)}
              >
                <option value="">Seleccionar aplicación</option>
                {apps.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div class="form-field">
              <label for="route-env">Ambiente</label>
              <select
                id="route-env"
                value={environment.value}
                onChange={(e) => (environment.value = e.currentTarget.value)}
              >
                <option value="dev">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Producción</option>
              </select>
            </div>
            <div class="form-field">
              <label for="route-model">Modelo</label>
              <select
                id="route-model"
                value={chosenModel.value}
                required
                onChange={(e) => (chosenModel.value = e.currentTarget.value)}
              >
                <option value="">Seleccionar modelo</option>
                {models.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button
            type="submit"
            disabled={busy || !selectedApp.value || !chosenModel.value}
          >
            Aplicar ruta
          </Button>
        </form>
        {selectedApp.value &&
          (routes.isPending ? (
            <Loading />
          ) : routes.error ? (
            <ErrorState error={routes.error} />
          ) : !routes.data?.length ? (
            <Empty title="Sin rutas" />
          ) : (
            <DataTable headers={['Ambiente', 'Modelo', 'Validación']}>
              {routes.data.map((v) => (
                <tr key={v.id}>
                  <td>{v.environment}</td>
                  <td class="mono">{v.model_id.slice(0, 12)}</td>
                  <td>
                    <button
                      class="inline-link"
                      onClick={() =>
                        void act(
                          () => post(`/model-routes/${v.id}/validate`, {}),
                          'Routing verificado',
                        )
                      }
                      disabled={busy}
                    >
                      Validar
                    </button>
                  </td>
                </tr>
              ))}
            </DataTable>
          ))}
      </Panel>
      <FormError error={error} />
    </>
  );
}
