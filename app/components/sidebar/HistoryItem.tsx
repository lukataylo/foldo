import { Icon } from '~/components/ui/icons';
import { type ChatHistoryItem } from '~/lib/persistence';
import { classNames } from '~/utils/classNames';

interface HistoryItemProps {
  item: ChatHistoryItem;
  current?: boolean;
  onDelete?: () => void;
}

export function HistoryItem({ item, current, onDelete }: HistoryItemProps) {
  return (
    <li
      className={classNames(
        'group flex min-h-[34px] items-center rounded-[6px] pr-1',
        current ? 'bg-wash text-ink' : 'text-ink2 hover:bg-wash hover:text-ink',
      )}
    >
      <a
        href={`/chat/${item.urlId}`}
        aria-current={current ? 'page' : undefined}
        className={classNames('min-w-0 flex-1 truncate px-2 py-[7px] text-inherit no-underline', { 'font-semibold': Boolean(current) })}
      >
        {item.description}
      </a>
      <button
        type="button"
        aria-label={`Delete ${item.description}`}
        title="Delete project"
        className="btn-icon h-[28px] w-[28px] opacity-0 hover:text-error focus-visible:opacity-100 group-hover:opacity-100"
        onClick={onDelete}
      >
        <Icon.Trash size={15} />
      </button>
    </li>
  );
}
