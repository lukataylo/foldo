import { beforeEach, describe, expect, it, vi } from 'vitest';

const loaderData = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('@remix-run/react', () => ({ useLoaderData: () => loaderData.current }));
vi.mock('react-toastify', () => ({ toast: { error: vi.fn() } }));
vi.mock('~/lib/stores/workbench', () => ({ workbenchStore: {} }));
vi.mock('~/lib/templates/client', async () => {
  const { atom } = await import('nanostores');
  return { activeTemplate: atom<string | undefined>(undefined) };
});

describe('useChatHistory', () => {
  beforeEach(() => vi.resetModules());

  it('seeds the template on a fresh /p/:shareId load, which has no project id', async () => {
    loaderData.current = { shared: true, description: 'Checkout', template: 'payments-checkout', messages: [] };

    const { useChatHistory, chatId, description } = await import('./useChatHistory');
    const { activeTemplate } = await import('~/lib/templates/client');

    useChatHistory();

    expect(chatId.get()).toBeUndefined();
    expect(activeTemplate.get()).toBe('payments-checkout');
    expect(description.get()).toBe('Checkout');
  });

  it('keeps a fork id assigned after the first save across re-renders', async () => {
    loaderData.current = { shared: true, template: 'payments-checkout', messages: [] };

    const { useChatHistory, chatId } = await import('./useChatHistory');

    useChatHistory();
    chatId.set('fork1');
    loaderData.current = { ...loaderData.current, id: 'fork1' };
    useChatHistory();

    expect(chatId.get()).toBe('fork1');
  });
});
