import { useStore } from '@nanostores/react';
import { useLoaderData } from '@remix-run/react';
import { templateIcon, templateStatus, type TemplateCard } from '~/lib/templates/client';

// The first message of a template project. It is UI only: the model never sees it (see api.chat).
export function TemplateIntro({ id, onSend }: { id: string; onSend?: (text: string) => void }) {
  const { templates = [] } = useLoaderData() as { templates?: TemplateCard[] };
  const status = useStore(templateStatus);
  const t = templates.find((x) => x.id === id);

  if (!t) {
    return <p>Your starter project is ready.</p>;
  }

  return (
    <div className="space-y-3" data-testid="foldo-template-intro">
      <div className="flex items-center gap-3">
        <img src={templateIcon(t.icon)} alt="" width={40} height={40} />
        <div>
          <div className="font-semibold text-bolt-elements-textPrimary">{t.title}</div>
          <div className="text-xs text-bolt-elements-textTertiary">{t.track} starter</div>
        </div>
      </div>
      {status ? (
        <div className="flex items-center gap-2 text-sm text-bolt-elements-textSecondary">
          <span className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress" /> {status}
        </div>
      ) : (
        <p className="text-sm text-bolt-elements-textSecondary">
          It is running in the preview. Explore it, then ask me to change it. I will edit this project, not start over.
        </p>
      )}
      <div>
        <div className="mb-1.5 text-xs font-medium text-bolt-elements-textTertiary">Try asking</div>
        <div className="flex flex-col gap-1.5">
          {t.ideas.map((idea) => (
            <button
              key={idea}
              onClick={() => onSend?.(idea)}
              className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-left text-sm text-bolt-elements-textSecondary transition hover:border-[var(--foldo-yellow)] hover:text-bolt-elements-textPrimary"
            >
              {idea}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
