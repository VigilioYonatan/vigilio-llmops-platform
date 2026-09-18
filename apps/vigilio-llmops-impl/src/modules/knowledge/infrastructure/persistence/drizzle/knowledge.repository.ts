import { Inject, Injectable } from '@nestjs/common';
import { SQL_PORT, type SqlPort } from '../../../../../shared/ports/sql.port';
import type {
  KnowledgeBaseRecord,
  KnowledgeDocumentRecord,
  KnowledgeRepository,
} from '../../../application/ports/knowledge.port';
import {
  chunkDocument,
  computeDeterministicEmbedding64,
  formatPgVector,
} from '../../../domain/hybrid-rag';

@Injectable()
export class KnowledgeDrizzleRepository implements KnowledgeRepository {
  constructor(@Inject(SQL_PORT) private readonly sql: SqlPort) {}

  async createBase(
    orgId: string,
    workspaceId: string,
    name: string,
    userId: string,
  ): Promise<KnowledgeBaseRecord> {
    const row = await this.sql.one<KnowledgeBaseRecord>(
      `INSERT INTO knowledge_bases(organization_id, workspace_id, name, created_by)
       VALUES($1, $2, $3, $4)
       RETURNING id, organization_id, workspace_id, name, created_by, created_at`,
      [orgId, workspaceId, name, userId],
    );
    return row!;
  }

  async findBase(id: string): Promise<KnowledgeBaseRecord | null> {
    const row = await this.sql.one<KnowledgeBaseRecord>(
      `SELECT id, organization_id, workspace_id, name, created_by, created_at
       FROM knowledge_bases
       WHERE id = $1`,
      [id],
    );
    return row ?? null;
  }

  async listBases(workspaceId: string): Promise<KnowledgeBaseRecord[]> {
    return this.sql.rows<KnowledgeBaseRecord>(
      `SELECT id, organization_id, workspace_id, name, created_by, created_at
       FROM knowledge_bases
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [workspaceId],
    );
  }

  async createDocument(
    kbId: string,
    title: string,
    content: string,
    visibility: 'workspace' | 'restricted',
    userId: string,
  ): Promise<KnowledgeDocumentRecord> {
    return this.sql.tx(async (client) => {
      const doc = await client.query<KnowledgeDocumentRecord>(
        `INSERT INTO knowledge_documents(knowledge_base_id, title, content, visibility, created_by, search_vector)
         VALUES($1, $2, $3, $4, $5, to_tsvector('simple', $3))
         RETURNING id, knowledge_base_id, title, content, visibility, created_by, created_at`,
        [kbId, title, content, visibility, userId],
      );
      const inserted = doc.rows[0]!;

      // Insert chunks with vector(64) embedding + tsvector
      const chunks = chunkDocument(content);
      for (const ch of chunks) {
        const emb = computeDeterministicEmbedding64(ch.chunk_content);
        const pgVector = formatPgVector(emb);
        await client.query(
          `INSERT INTO knowledge_chunks(document_id, ordinal, chunk_content, embedding, search_vector)
           VALUES($1, $2, $3, $4::vector, to_tsvector('simple', $3))`,
          [inserted.id, ch.ordinal, ch.chunk_content, pgVector],
        );
      }

      return inserted;
    });
  }

  async listDocuments(
    kbId: string,
    userId: string,
  ): Promise<Array<Omit<KnowledgeDocumentRecord, 'content'>>> {
    return this.sql.rows<Omit<KnowledgeDocumentRecord, 'content'>>(
      `SELECT id, knowledge_base_id, title, visibility, created_by, created_at
       FROM knowledge_documents
       WHERE knowledge_base_id = $1
         AND (
           visibility = 'workspace'
           OR created_by = $2
           OR EXISTS (
             SELECT 1 FROM knowledge_document_acl acl
             WHERE acl.document_id = knowledge_documents.id AND acl.user_id = $2
           )
         )
       ORDER BY created_at DESC
       LIMIT 100`,
      [kbId, userId],
    );
  }

  async findDocument(
    kbId: string,
    docId: string,
  ): Promise<KnowledgeDocumentRecord | null> {
    const row = await this.sql.one<KnowledgeDocumentRecord>(
      `SELECT id, knowledge_base_id, title, content, visibility, created_by, created_at
       FROM knowledge_documents
       WHERE id = $1 AND knowledge_base_id = $2`,
      [docId, kbId],
    );
    return row ?? null;
  }

  async updateDocumentAcl(
    kbId: string,
    docId: string,
    visibility: 'workspace' | 'restricted',
    allowedUserIds?: string[],
    allowedRoles?: string[],
  ): Promise<{ id: string; title: string; visibility: string }> {
    return this.sql.tx(async (client) => {
      const row = await client.query<{
        id: string;
        title: string;
        visibility: string;
      }>(
        `UPDATE knowledge_documents
         SET visibility = $3
         WHERE id = $2 AND knowledge_base_id = $1
         RETURNING id, title, visibility`,
        [kbId, docId, visibility],
      );
      if (!row.rowCount) return null as never;

      // Sync ACL entries
      await client.query(
        'DELETE FROM knowledge_document_acl WHERE document_id = $1',
        [docId],
      );

      if (visibility === 'restricted') {
        if (allowedUserIds && allowedUserIds.length > 0) {
          for (const u of allowedUserIds) {
            await client.query(
              'INSERT INTO knowledge_document_acl(document_id, user_id) VALUES($1, $2) ON CONFLICT DO NOTHING',
              [docId, u],
            );
          }
        }
        if (allowedRoles && allowedRoles.length > 0) {
          for (const r of allowedRoles) {
            await client.query(
              'INSERT INTO knowledge_document_acl(document_id, role) VALUES($1, $2) ON CONFLICT DO NOTHING',
              [docId, r],
            );
          }
        }
      }

      return row.rows[0]!;
    });
  }
}
