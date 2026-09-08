import { createHash } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { config } from '../../../shared/config';
import { assertSafeOutboundUrl } from '../../../shared/security/ssrf';

const ollamaResult = z.object({
  response: z.string(),
  eval_count: z.number().optional(),
  prompt_eval_count: z.number().optional(),
});

const ollamaChatResult = z.object({
  message: z.object({ content: z.string() }),
  eval_count: z.number().optional(),
  prompt_eval_count: z.number().optional(),
});

export interface InferenceOutput {
  output: string;
  output_tokens: number;
  input_tokens: number;
  latency_ms: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface InferenceOptions {
  apiKey?: string | null;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

@Injectable()
export class ModelInferenceService {
  private getEndpoint(path: string, customBaseUrl?: string): URL {
    const rawBase = customBaseUrl || config.ALLOWED_MODEL_BASE_URL;
    const allowLoopback = config.ALLOW_LOOPBACK_MODEL_URL === 'true';
    assertSafeOutboundUrl(rawBase, { allowLoopback });
    return new URL(path, rawBase);
  }

  async infer(
    model: string,
    prompt: string,
    kind: 'ollama' | 'openai-compatible' = 'ollama',
    options?: InferenceOptions,
  ): Promise<InferenceOutput> {
    const started = Date.now();
    const endpoint = this.getEndpoint(
      kind === 'ollama' ? '/api/generate' : '/v1/chat/completions',
      options?.baseUrl,
    );
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (options?.apiKey) {
      headers.authorization = `Bearer ${options.apiKey}`;
    }

    try {
      const body =
        kind === 'ollama'
          ? {
              model,
              prompt,
              stream: false,
              options: {
                num_predict: options?.maxTokens ?? 512,
                temperature: options?.temperature,
                top_p: options?.topP,
              },
            }
          : {
              model,
              messages: [{ role: 'user', content: prompt }],
              max_tokens: options?.maxTokens ?? 512,
              temperature: options?.temperature,
              top_p: options?.topP,
              stream: false,
            };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.MODEL_TIMEOUT_MS),
      });

      if (!response.ok) throw new Error(`Inference status ${response.status}`);

      if (kind === 'ollama') {
        const parsed = ollamaResult.parse(await response.json());
        return {
          output: parsed.response,
          input_tokens: parsed.prompt_eval_count ?? 0,
          output_tokens: parsed.eval_count ?? 0,
          latency_ms: Date.now() - started,
        };
      }

      const compatible = z
        .object({
          choices: z
            .array(
              z.object({
                message: z.object({ content: z.string() }),
              }),
            )
            .min(1),
          usage: z
            .object({
              prompt_tokens: z.number().optional(),
              completion_tokens: z.number().optional(),
            })
            .optional(),
        })
        .parse(await response.json());

      return {
        output: compatible.choices[0]?.message.content ?? '',
        input_tokens: compatible.usage?.prompt_tokens ?? 0,
        output_tokens: compatible.usage?.completion_tokens ?? 0,
        latency_ms: Date.now() - started,
      };
    } catch {
      throw new ServiceUnavailableException(
        'Configured inference provider unavailable',
      );
    }
  }

  async inferChat(
    model: string,
    messages: ChatMessage[],
    kind: 'ollama' | 'openai-compatible' = 'ollama',
    options?: InferenceOptions,
  ): Promise<InferenceOutput> {
    const started = Date.now();
    const endpoint = this.getEndpoint(
      kind === 'ollama' ? '/api/chat' : '/v1/chat/completions',
      options?.baseUrl,
    );
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (options?.apiKey) {
      headers.authorization = `Bearer ${options.apiKey}`;
    }

    try {
      const body =
        kind === 'ollama'
          ? {
              model,
              messages,
              stream: false,
              options: {
                num_predict: options?.maxTokens ?? 512,
                temperature: options?.temperature,
                top_p: options?.topP,
              },
            }
          : {
              model,
              messages,
              max_tokens: options?.maxTokens ?? 512,
              temperature: options?.temperature,
              top_p: options?.topP,
              stream: false,
            };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.MODEL_TIMEOUT_MS),
      });

      if (!response.ok)
        throw new Error(`Inference chat status ${response.status}`);

      if (kind === 'ollama') {
        const parsed = ollamaChatResult.parse(await response.json());
        return {
          output: parsed.message.content,
          input_tokens: parsed.prompt_eval_count ?? 0,
          output_tokens: parsed.eval_count ?? 0,
          latency_ms: Date.now() - started,
        };
      }

      const compatible = z
        .object({
          choices: z
            .array(
              z.object({
                message: z.object({ content: z.string() }),
              }),
            )
            .min(1),
          usage: z
            .object({
              prompt_tokens: z.number().optional(),
              completion_tokens: z.number().optional(),
            })
            .optional(),
        })
        .parse(await response.json());

      return {
        output: compatible.choices[0]?.message.content ?? '',
        input_tokens: compatible.usage?.prompt_tokens ?? 0,
        output_tokens: compatible.usage?.completion_tokens ?? 0,
        latency_ms: Date.now() - started,
      };
    } catch {
      throw new ServiceUnavailableException(
        'Configured inference provider unavailable',
      );
    }
  }

  computeDeterministicEmbedding(text: string): number[] {
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

  async embed(
    model: string,
    inputs: string[],
    options?: InferenceOptions,
  ): Promise<number[][]> {
    if (model === 'builtin-hash-64') {
      return inputs.map((input) => this.computeDeterministicEmbedding(input));
    }
    const endpoint = this.getEndpoint('/api/embed', options?.baseUrl);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (options?.apiKey) {
      headers.authorization = `Bearer ${options.apiKey}`;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, input: inputs }),
        signal: AbortSignal.timeout(config.MODEL_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Embedding status ${response.status}`);
      const decoded = z
        .object({ embeddings: z.array(z.array(z.number().finite())) })
        .parse(await response.json());
      if (decoded.embeddings.length !== inputs.length) {
        throw new ServiceUnavailableException(
          'Provider returned wrong number of vectors',
        );
      }
      return decoded.embeddings;
    } catch {
      throw new ServiceUnavailableException('Embedding service unavailable');
    }
  }
}
