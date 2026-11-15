import { useEffect, useRef, useState } from 'react';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { buildCatalogImageName, splitImageName } from '@shared/utils/catalogImageName';

interface InlineImageNameProps {
  value: string;
  isDisabled?: boolean;
  className?: string;
  overlayZClassName?: string;
  onSave: (nextValue: string) => Promise<void> | void;
}

export function InlineImageName({
  value,
  isDisabled,
  className = '',
  overlayZClassName,
  onSave,
}: InlineImageNameProps) {
  const { base: valueBase, ext: valueExt } = splitImageName(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(valueBase);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(valueBase);
  }, [valueBase, editing]);

  useEffect(() => {
    if (!editing) return;
    const frame = window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editing]);

  const requestCommit = () => {
    const next = buildCatalogImageName(draft, valueExt);
    if (!draft.trim() || next === value) {
      setDraft(valueBase);
      setEditing(false);
      return;
    }
    setPendingName(next);
    setEditing(false);
  };

  const cancelConfirm = () => {
    setPendingName(null);
    setDraft(valueBase);
  };

  const confirmSave = async () => {
    if (!pendingName) return;
    setSaving(true);
    try {
      await onSave(pendingName);
      setPendingName(null);
    } catch {
      setDraft(valueBase);
      setPendingName(null);
    } finally {
      setSaving(false);
    }
  };

  const cancelEditing = () => {
    setDraft(valueBase);
    setEditing(false);
  };

  return (
    <>
      {editing ? (
        <span className={`flex min-w-0 items-center ${className}`}>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            disabled={saving}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={requestCommit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                requestCommit();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                cancelEditing();
              }
            }}
            className="m-0 block h-[14px] min-w-0 flex-1 border-0 bg-transparent p-0 text-[10px] leading-[14px] text-white caret-white outline-none ring-0"
            aria-label="Назва зображення"
          />
          <span className="shrink-0 text-[10px] leading-[14px] text-white/60">{valueExt}</span>
        </span>
      ) : (
        <button
          type="button"
          disabled={isDisabled}
          className={`block w-full min-w-0 truncate text-left text-[10px] text-white ${isDisabled ? 'cursor-default' : 'cursor-text'} ${className}`}
          onClick={(event) => {
            event.stopPropagation();
            if (isDisabled) return;
            setEditing(true);
          }}
          title={isDisabled ? value : 'Натисніть для редагування назви'}
        >
          {value}
        </button>
      )}

      <ConfirmModal
        isOpen={pendingName != null}
        title="Змінити назву зображення?"
        message={
          <span>
            Зберегти нову назву <strong>{pendingName}</strong> замість «{value}»?
          </span>
        }
        confirmText="Зберегти"
        confirmColor="primary"
        confirmLoading={saving}
        overlayZClassName={overlayZClassName}
        onConfirm={() => void confirmSave()}
        onCancel={cancelConfirm}
      />
    </>
  );
}
