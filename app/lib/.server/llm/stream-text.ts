import { streamText as _streamText, convertToCoreMessages } from 'ai';
import type { Provider } from '~/lib/.server/config';
import { getModel } from '~/lib/.server/llm/model';
import { defaultMaxTokens } from '../config';
import { FORMAT_REMINDER, getSystemPrompt, modelRules } from './prompts';

interface ToolResult<Name extends string, Args, Result> {
  toolCallId: string;
  toolName: Name;
  args: Args;
  result: Result;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolInvocations?: ToolResult<string, unknown, unknown>[];
}

export type Messages = Message[];

export type StreamingOptions = Omit<Parameters<typeof _streamText>[0], 'model'>;

export function streamText(messages: Messages, provider: Provider, options?: StreamingOptions) {
  const { system, ...rest } = options ?? {};

  return _streamText({
    model: getModel(provider),
    // rules for the model that actually answers, so a failover gets its own
    system: (system ?? getSystemPrompt() + FORMAT_REMINDER) + modelRules(provider.model),
    maxTokens: provider.maxTokens ?? defaultMaxTokens(),
    messages: convertToCoreMessages(messages as Parameters<typeof convertToCoreMessages>[0]),
    ...rest,
  });
}
