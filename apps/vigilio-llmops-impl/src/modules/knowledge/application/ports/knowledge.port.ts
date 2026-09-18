export interface KnowledgeBaseRecord {
  id: string;
  organization_id: string;
  workspace_id: string;
  name: string;
  created_by: string;
  created_at: Date;
}

export interface KnowledgeDocumentRecord {
  id: string;
  knowledge_base_id: string;
  title: string;
  content: string;
  visibility: 'workspace' | 'restricted';
  created_by: string;
  created_at: Date;
}

export interface KnowledgeSearchResult {
  id: string;
  document_id: string;
  title: string;
  excerpt: string;
  score: number;
  dense_rank?: number | null;
  lexical_rank?: number | null;
}

export const KNOWLEDGE_REPOSITORY = Symbol('KNOWLEDGE_REPOSITORY');

export interface KnowledgeRepository {
  createBase(
    orgId: string,
    workspaceId: string,
    name: string,
    userId: string,
  ): Promise<KnowledgeBaseRecord>;
  findBase(id: string): Promise<KnowledgeBaseRecord | null>;
  listBases(workspaceId: string): Promise<KnowledgeBaseRecord[]>;
  createDocument(
    kbId: string,
    title: string,
    content: string,
    visibility: 'workspace' | 'restricted',
    userId: string,
  ): Promise<KnowledgeDocumentRecord>;
  listDocuments(
    kbId: string,
    userId: string,
  ): Promise<Array<Omit<KnowledgeDocumentRecord, 'content'>>>;
  findDocument(
    kbId: string,
    docId: string,
  ): Promise<KnowledgeDocumentRecord | null>;
  updateDocumentAcl(
    kbId: string,
    docId: string,
    visibility: 'workspace' | 'restricted',
    allowedUserIds?: string[],
    allowedRoles?: string[],
  ): Promise<{ id: string; title: string; visibility: string }>;
}
