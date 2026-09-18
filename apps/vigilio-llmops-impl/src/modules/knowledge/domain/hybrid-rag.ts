import { createHash } from 'node:crypto';

export interface DocumentChunk {
  ordinal: number;
  chunk_content: string;
}

export function chunkDocument(
  content: string,
  chunkSize = 500,
  overlap = 50,
): DocumentChunk[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  if (trimmed.length <= chunkSize) {
    return [{ ordinal: 0, chunk_content: trimmed }];
  }

  const chunks: DocumentChunk[] = [];
  let start = 0;
  let ordinal = 0;

  while (start < trimmed.length) {
    let end = start + chunkSize;
    if (end < trimmed.length) {
      // Prefer breaking on sentence or paragraph boundary
      const lastPeriod = trimmed.lastIndexOf('. ', end);
      const lastNewline = trimmed.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > start + chunkSize / 2) {
        end = breakPoint + 1;
      }
    }
    const chunkText = trimmed.slice(start, end).trim();
    if (chunkText) {
      chunks.push({ ordinal, chunk_content: chunkText });
      ordinal++;
    }
    if (end >= trimmed.length) break;
    start = Math.max(start + 1, end - overlap);
  }

  return chunks;
}

export function computeDeterministicEmbedding64(text: string): number[] {
  const vector = new Array(64).fill(0);
  const words = text.toLowerCase().match(/\w+/g) ?? ['default'];
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const hash = createHash('sha256').update(word).digest();
    for (let j = 0; j < 64; j++) {
      const byte = hash[j % hash.length]!;
      vector[j] += ((byte - 128) / 128) * (1 / (i + 1));
    }
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => Number((v / norm).toFixed(6)));
}

export function formatPgVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export function fuseRrfScores(
  denseRanks: Map<string, number>,
  lexicalRanks: Map<string, number>,
  k = 60,
): Map<
  string,
  { rrf: number; denseRank: number | null; lexicalRank: number | null }
> {
  const allIds = new Set([...denseRanks.keys(), ...lexicalRanks.keys()]);
  const fusion = new Map<
    string,
    { rrf: number; denseRank: number | null; lexicalRank: number | null }
  >();

  for (const id of allIds) {
    const denseRank = denseRanks.get(id) ?? null;
    const lexicalRank = lexicalRanks.get(id) ?? null;

    let rrf = 0;
    if (denseRank !== null) {
      rrf += 1 / (k + denseRank);
    }
    if (lexicalRank !== null) {
      rrf += 1 / (k + lexicalRank);
    }

    fusion.set(id, { rrf, denseRank, lexicalRank });
  }

  return fusion;
}
