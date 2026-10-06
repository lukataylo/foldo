import { createOpenAI } from '@ai-sdk/openai';
import type { Provider } from '../config';

// Every provider (OpenAI, DeepSeek, MiMo, Qwen, Kimi, GLM, MiniMax, custom) speaks the OpenAI chat protocol.
// Non-OpenAI endpoints get 'compatible' mode so we don't send OpenAI-only fields (e.g. stream_options) they reject.
export function getModel(provider: Provider) {
  return createOpenAI({
    apiKey: provider.key,
    baseURL: provider.baseURL,
    compatibility: provider.id === 'openai' ? 'strict' : 'compatible',
  })(provider.model);
}
