import { createOpenAI } from '@ai-sdk/openai';
import { reasoningEffort, type Provider } from '../config';

// Reasoning models (o-series, gpt-5/6...) reject `max_tokens` and sampling params. The pinned SDK only knows "o1-",
// so for OpenAI-direct we rewrite the request body. Through OpenRouter this is normalised for us.
const REASONING = /^(o\d|gpt-[5-9])/;

const reasoningFetch: typeof fetch = (url, init) => {
  if (typeof init?.body === 'string') {
    try {
      const body = JSON.parse(init.body);

      if (REASONING.test(String(body.model))) {
        if ('max_tokens' in body) {
          body.max_completion_tokens = body.max_tokens;
          delete body.max_tokens;
        }

        for (const k of ['temperature', 'top_p', 'presence_penalty', 'frequency_penalty']) {
          delete body[k];
        }

        return fetch(url, { ...init, body: JSON.stringify(body) });
      }
    } catch {
      // not JSON: pass through untouched
    }
  }

  return fetch(url, init);
};

// OpenRouter normalises reasoning control across models; without a cap, reasoning models can think for a minute
// before the first visible token (and spend the token budget on thinking). Non-reasoning models ignore the field.
const withReasoningEffort =
  (effort: string): typeof fetch =>
  (url, init) => {
    if (effort !== 'default' && typeof init?.body === 'string') {
      try {
        const body = JSON.parse(init.body);

        return fetch(url, { ...init, body: JSON.stringify({ ...body, reasoning: { effort } }) });
      } catch {
        // not JSON: pass through
      }
    }

    return fetch(url, init);
  };

// Every provider (OpenAI, OpenRouter, DeepSeek, MiMo, Qwen, Kimi, GLM, MiniMax, custom) speaks the OpenAI chat protocol.
// Non-OpenAI endpoints get 'compatible' mode so we don't send OpenAI-only fields (e.g. stream_options) they reject.
export function getModel(provider: Provider) {
  return createOpenAI({
    apiKey: provider.key,
    baseURL: provider.baseURL,
    compatibility: provider.id === 'openai' ? 'strict' : 'compatible',
    // OpenRouter uses these to attribute traffic to the app
    headers: provider.id === 'openrouter' ? { 'HTTP-Referer': 'https://foldo.dev', 'X-Title': 'Foldo' } : undefined,
    fetch: provider.id === 'openai' ? reasoningFetch : provider.baseURL.includes('openrouter.ai') ? withReasoningEffort(reasoningEffort()) : undefined,
  })(provider.model);
}
