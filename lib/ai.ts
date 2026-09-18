import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject } from 'ai';
import type { z } from 'zod';

const baseURL = process.env.AI_BASE_URL;
const apiKey = process.env.AI_API_KEY;
const modelId = process.env.AI_MODEL;

if (!baseURL || !apiKey || !modelId) {
  throw new Error('Missing AI_BASE_URL, AI_API_KEY or AI_MODEL in .env');
}

const provider = createOpenAICompatible({
  name: 'auto-gtm',
  baseURL,
  apiKey,
  // Without this the SDK drops the JSON schema and just asks nicely. Reasoning
  // models then spiral instead of returning — a 4s call became a 240s hang.
  supportsStructuredOutputs: true,
});

export const model = provider.chatModel(modelId);

/**
 * generateObject with the guardrails a reasoning model needs: a hard timeout so
 * a stall surfaces as an error, and a token ceiling so runaway reasoning is
 * capped rather than billed.
 */
export async function generate<T>(opts: {
  schema: z.ZodType<T>;
  prompt: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
}): Promise<T> {
  const { object } = await generateObject({
    model,
    schema: opts.schema,
    prompt: opts.prompt,
    // Reasoning tokens are billed against this budget, so a tight ceiling
    // silently truncates the JSON and surfaces as a schema mismatch.
    maxOutputTokens: opts.maxOutputTokens ?? 16_000,
    maxRetries: 2,
    abortSignal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });
  return object as T;
}
