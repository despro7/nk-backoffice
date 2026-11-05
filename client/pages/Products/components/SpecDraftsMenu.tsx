import { Button, Chip, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { CatalogSpecDraftListItem } from '@shared/types/catalogSpec';

interface Props {
  drafts: CatalogSpecDraftListItem[];
  onOpenGood: (goodId: string) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Кнопка «На затвердженні» в toolbar каталогу: чернетки специфікацій з переходом у картку. */
export function SpecDraftsMenu({ drafts, onOpenGood }: Props) {
  if (drafts.length === 0) return null;
  const pending = drafts.filter((d) => d.status === 'pending').length;

  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <Button
          size="sm"
          className="bg-amber-100 font-medium text-amber-800 hover:bg-amber-200"
          startContent={<DynamicIcon name="file-clock" size={14} />}
          endContent={
            <Chip size="sm" variant="solid" className="h-4 min-w-4 bg-amber-500 px-1 text-[10px] font-semibold text-white">
              {drafts.length}
            </Chip>
          }
        >
          <span className="hidden md:inline">{pending > 0 ? 'На затвердженні' : 'Відхилені специфікації'}</span>
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Чернетки специфікацій"
        className="max-h-96 max-w-md overflow-y-auto"
        onAction={(key) => onOpenGood(String(key))}
      >
        {drafts.map((d) => (
          <DropdownItem
            key={d.goodId}
            textValue={d.goodName}
            startContent={
              <DynamicIcon
                name={d.status === 'rejected' ? 'file-x' : 'file-clock'}
                size={16}
                className={d.status === 'rejected' ? 'text-rose-500' : 'text-amber-500'}
              />
            }
            description={`${d.authorName ?? '–'} · ${formatDate(d.updatedAt)} · ${d.comment}`}
            classNames={{ description: 'line-clamp-2 whitespace-normal' }}
          >
            {d.goodName}
            {d.goodSku ? <span className="font-mono text-default-500"> · {d.goodSku}</span> : null}
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
}
