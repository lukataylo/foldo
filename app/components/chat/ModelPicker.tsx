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
      className="h-[36px] cursor-pointer rounded-[6px] border border-solid border-rule bg-sheet px-[10px] font-mono text-[12px] text-ink outline-none hover:bg-wash focus-visible:shadow-[0_0_0_2px_#FBF8F1,0_0_0_4px_#16140F]"
    >
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
