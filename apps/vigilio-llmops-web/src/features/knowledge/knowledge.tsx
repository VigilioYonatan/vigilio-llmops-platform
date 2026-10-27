import { useSignal } from '@preact/signals';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, FileText, Globe, Lock, Sparkles } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { api, patch, post } from '../../api/http';
import { notify, selectedWorkspace } from '../../shared/navigation';
import {
  Button,
  DataTable,
  ErrorState,
  FormError,
  Input,
  Loading,
  PageHeader,
  Panel,
  Textarea,
} from '../../shared/ui';

interface Doc {
  id: string;
  title: string;
  visibility: string;
  created_at: string;
}

interface Match {
  id: string;
  title: string;
  excerpt: string;
  score?: number;
}

interface RagAnswer {
  answer: string;
  citations: Array<{
    document_id: string;
    title: string;
    score: number;
    chunk_id: string;
    excerpt: string;
  }>;
}

export function KnowledgePage() {
  const ws = selectedWorkspace();
  const kb = useSignal('');
  const bases = useQuery({
    queryKey: ['knowledge-bases', ws],
    enabled: !!ws,
    queryFn: () =>
      api<{ id: string; name: string }[]>(
        `/knowledge-bases?workspace_id=${ws}`,
      ),
  });

  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<'workspace' | 'restricted'>(
    'workspace',
  );
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Match[]>([]);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [ragAnswer, setRagAnswer] = useState<RagAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function perform(job: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await job();
      notify(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error en knowledge');
    } finally {
      setBusy(false);
    }
  }

  async function loadDocuments() {
    if (!kb.value) return;
    setDocuments(await api<Doc[]>(`/knowledge-bases/${kb.value}/documents`));
  }

  async function generateAnswer() {
    if (!kb.value || !query.trim()) return;
    await perform(async () => {
      const res = await post<RagAnswer>(`/knowledge-bases/${kb.value}/answer`, {
        query,
      });
      setRagAnswer(res);
    }, 'Respuesta generada con citas');
  }

  return (
    <>
      <PageHeader
        eyebrow="AI / KNOWLEDGE"
        title="Knowledge y Hybrid RAG"
        description="Búsqueda híbrida con PostgreSQL (pgvector + FTS con RRF k=60), ACL por documento y generación con citas verificables."
      />

      <div class="two-col">
        <Panel title="Crear base documental">
          <form
            class="form-pad"
            onSubmit={(e) => {
              e.preventDefault();
              if (ws)
                void perform(async () => {
                  const base = await post<{ id: string }>('/knowledge-bases', {
                    workspace_id: ws,
                    name,
                  });
                  kb.value = base.id;
                  setName('');
                  await loadDocuments();
                }, 'Base creada');
            }}
          >
            <Input
              label="Nombre de la base"
              value={name}
              onInput={setName}
              required
            />
            <Button type="submit" disabled={busy || !ws || !name}>
              Crear base
            </Button>
          </form>

          <div class="form-pad">
            <div class="form-field">
              <label for="kb-select">Seleccionar base</label>
              <select
                id="kb-select"
                value={kb.value}
                onChange={(e) => {
                  kb.value = e.currentTarget.value;
                  void loadDocuments();
                }}
              >
                <option value="">Elige una base de conocimiento</option>
                {bases.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            {bases.isPending ? (
              <Loading />
            ) : bases.error ? (
              <ErrorState error={bases.error} />
            ) : null}
            <Button
              variant="subtle"
              disabled={busy || !kb.value}
              onClick={() =>
                void perform(loadDocuments, 'Documentos actualizados')
              }
            >
              Cargar documentos
            </Button>
          </div>
        </Panel>

        <Panel
          title="Agregar documento"
          description="Se generan chunks y embeddings vectoriales indexados con HNSW; el contenido se persiste bajo ACL estricto."
        >
          <form
            class="form-pad"
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                await post(`/knowledge-bases/${kb.value}/documents`, {
                  title,
                  content,
                  visibility,
                });
                await loadDocuments();
                setTitle('');
                setContent('');
              }, 'Documento indexado con vectores');
            }}
          >
            <Input
              label="Título del documento"
              value={title}
              onInput={setTitle}
              required
            />
            <Textarea
              label="Contenido documental"
              value={content}
              onInput={setContent}
              rows={5}
            />
            <div class="form-field">
              <label for="doc-visibility">
                Visibilidad / Control de Acceso (ACL)
              </label>
              <select
                id="doc-visibility"
                value={visibility}
                onChange={(e) =>
                  setVisibility(e.currentTarget.value as typeof visibility)
                }
              >
                <option value="workspace">Workspace completo</option>
                <option value="restricted">Restringido (solo autor)</option>
              </select>
            </div>
            <Button
              disabled={busy || !kb.value || content.length < 10}
              type="submit"
            >
              Guardar e indexar
            </Button>
          </form>
        </Panel>
      </div>

      <Panel title="Documentos indexados">
        {!documents.length ? (
          <p class="muted form-pad">
            Selecciona una base para ver sus documentos indexados.
          </p>
        ) : (
          <DataTable headers={['Documento', 'Acceso ACL', 'Fecha', 'Acción']}>
            {documents.map((v) => (
              <tr key={v.id}>
                <td>
                  <FileText
                    size={14}
                    style={{ display: 'inline', marginRight: '6px' }}
                  />
                  {v.title}
                </td>
                <td>
                  <span
                    class={`status ${v.visibility === 'workspace' ? 'status-good' : 'status-neutral'}`}
                  >
                    {v.visibility === 'workspace' ? (
                      <Globe size={12} />
                    ) : (
                      <Lock size={12} />
                    )}
                    {v.visibility}
                  </span>
                </td>
                <td>{new Date(v.created_at).toLocaleDateString()}</td>
                <td>
                  <button
                    type="button"
                    class="inline-link"
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        await patch(
                          `/knowledge-bases/${kb.value}/documents/${v.id}/acl`,
                          {
                            visibility:
                              v.visibility === 'workspace'
                                ? 'restricted'
                                : 'workspace',
                          },
                        );
                        await loadDocuments();
                      }, 'ACL actualizada')
                    }
                  >
                    Alternar ACL
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
        <div class="form-pad">
          <Button
            variant="subtle"
            disabled={busy || !kb.value}
            onClick={() =>
              void perform(
                () => post(`/knowledge-bases/${kb.value}/reindex`, {}),
                'Índice FTS y vectorial reconstruido',
              )
            }
          >
            Reconstruir índices HNSW + FTS
          </Button>
        </div>
      </Panel>

      <Panel
        title="Búsqueda Híbrida y RAG con citas"
        description="Fusión recíproca de rangos (RRF k=60) combinando similitud de coseno vectorial (pgvector) y concordancia léxica (ts_rank_cd)."
      >
        <form
          class="form-pad"
          onSubmit={(e) => {
            e.preventDefault();
            void perform(async () => {
              setResult(
                await post<Match[]>(`/knowledge-bases/${kb.value}/search`, {
                  query,
                  limit: 5,
                }),
              );
            }, 'Búsqueda completada');
          }}
        >
          <Input
            label="Consulta de búsqueda"
            value={query}
            onInput={setQuery}
            required
          />
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button
              type="submit"
              disabled={!kb.value || busy || query.length < 2}
            >
              <BookOpen size={16} /> Búsqueda Híbrida
            </Button>
            <Button
              type="button"
              variant="subtle"
              disabled={!kb.value || busy || query.length < 2}
              onClick={() => void generateAnswer()}
            >
              <Sparkles size={16} /> Generar respuesta RAG con citas
            </Button>
          </div>
        </form>

        {result.length > 0 && (
          <div class="form-pad">
            <h4>Fragmentos recuperados (RRF Top K)</h4>
            <DataTable headers={['Documento', 'Fragmento relevante', 'Score']}>
              {result.map((v, i) => (
                <tr key={v.id ?? i}>
                  <td>{v.title}</td>
                  <td class="wrap-text">{v.excerpt}</td>
                  <td>{v.score ? Number(v.score).toFixed(4) : '—'}</td>
                </tr>
              ))}
            </DataTable>
          </div>
        )}

        {ragAnswer && (
          <div
            class="form-pad"
            style={{
              background: 'var(--soft)',
              borderRadius: '10px',
              marginTop: '12px',
            }}
          >
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} color="var(--accent)" /> Respuesta generada
              por RAG
            </h4>
            <p style={{ lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {ragAnswer.answer}
            </p>
            {ragAnswer.citations?.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <small
                  class="muted"
                  style={{ fontWeight: 700, textTransform: 'uppercase' }}
                >
                  Citas y fuentes de evidencia:
                </small>
                <div style={{ display: 'grid', gap: '8px', marginTop: '8px' }}>
                  {ragAnswer.citations.map((cite, idx) => (
                    <div
                      key={cite.chunk_id ?? idx}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid var(--line)',
                        background: 'var(--surface)',
                        fontSize: '12px',
                      }}
                    >
                      <b>
                        [{idx + 1}] {cite.title}
                      </b>{' '}
                      (Score: {Number(cite.score).toFixed(3)})
                      <p
                        class="muted"
                        style={{ margin: '4px 0 0', fontStyle: 'italic' }}
                      >
                        "{cite.excerpt}"
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Panel>

      <FormError error={error} />
    </>
  );
}
