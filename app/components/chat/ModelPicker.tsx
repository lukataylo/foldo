import { useStore } from '@nanostores/react';
import { useLoaderData } from '@remix-run/react';
import { useEffect } from 'react';
import { selectedModel } from '~/lib/stores/model';

// Only rendered when more than one provider is enabled (see /admin).
export function ModelPicker() {
  const { models = [], defaultModel } = useLoaderData() as { models?: { id: string; label: string }[]; defaultModel?: string };
  const chosen = useStore(selectedModel);

  useEffect(() => {
    let saved: string | null = null;

    try {
      saved = localStorage.getItem('foldo_model');
    } catch {
      // storage unavailable: use the default
    }

    selectedModel.set(models.some((m) => m.id === saved) ? (saved as string) : defaultModel);
  }, [defaultModel, models.length]);

  if (models.length < 2) {
    return null;
  }

  return (
    <select
      aria-label="AI model"
      data-testid="foldo-model-picker"
      value={chosen ?? defaultModel}
      onChange={(e) => {
        selectedModel.set(e.target.value);

        try {
          localStorage.setItem('foldo_model', e.target.value);
        } catch {
          // preference just won't persist
        }
      }}
      className="ml-1 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 py-1 text-xs text-bolt-elements-textSecondary outline-none hover:text-bolt-elements-textPrimary"
    >
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
