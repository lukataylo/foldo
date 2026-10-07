import { type ActionFunctionArgs } from '@remix-run/node';
import { StreamingTextResponse, parseStreamPart } from 'ai';
import { getUser, refundQuota, spendQuota } from '~/lib/.server/auth';
import { resolveProvider } from '~/lib/.server/config';
import { streamText } from '~/lib/.server/llm/stream-text';
import { stripIndents } from '~/utils/stripIndent';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function action(args: ActionFunctionArgs) {
  return enhancerAction(args);
}

async function enhancerAction({ request }: ActionFunctionArgs) {
  const user = await getUser(request);

  if (!user) {
    return new Response('Please sign in again to keep building. Your work is saved.', { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { message?: unknown };
  const message = typeof body.message === 'string' ? body.message.slice(0, 4000) : '';
  const provider = resolveProvider();

  if (!message || !provider) {
    return new Response('Type your idea first, then press the sparkle to improve it.', { status: 400 });
  }

  if (spendQuota(user.id, provider.id) !== 'ok') {
    return new Response("You've used all your messages for tonight. Ask an organizer if you need more.", { status: 429 });
  }

  try {
    const result = await streamText(
      [
        {
          role: 'user',
          content: stripIndents`
          I want you to improve the user prompt that is wrapped in \`<original_prompt>\` tags.

          IMPORTANT: Only respond with the improved prompt and nothing else!

          <original_prompt>
            ${message}
          </original_prompt>
        `,
        },
      ],
      provider,
    );

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const processedChunk = decoder
          .decode(chunk)
          .split('\n')
          .filter((line) => line !== '')
          .map(parseStreamPart)
          .map((part) => part.value)
          .join('');

        controller.enqueue(encoder.encode(processedChunk));
      },
    });

    const transformedStream = result.toAIStream().pipeThrough(transformStream);

    return new StreamingTextResponse(transformedStream);
  } catch (error) {
    console.error('[enhancer] failed:', (error as Error)?.message);
    refundQuota(user.id, provider.id);

    return new Response("Couldn't improve that prompt just now. Press the sparkle to try again.", { status: 502 });
  }
}
