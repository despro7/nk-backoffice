import { useMemo, useState, type CSSProperties } from 'react';
import {
  Button,
  Chip,
  Input,
} from '@heroui/react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import {
  buildIngredientsJsonFromBom,
  ingredientsListsEqual,
  normalizeIngredientTag,
} from '@shared/utils/storefrontDescription';
import type { BomRow } from './productDrawerTypes';

function remapIndexAfterReorder(index: number, from: number, to: number): number {
  if (index === from) return to;
  if (from < to) {
    if (index > from && index <= to) return index - 1;
  } else if (from > to) {
    if (index >= to && index < from) return index + 1;
  }
  return index;
}

interface SortableIngredientTagProps {
  tag: string;
  disabled?: boolean;
  isSorting: boolean;
  isDropTarget: boolean;
  isEditing: boolean;
  editDraft: string;
  editInputWidthCh: (text: string) => number;
  onEditDraftChange: (value: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onDelete: () => void;
}

function SortableIngredientTag({
  tag,
  disabled,
  isSorting,
  isDropTarget,
  isEditing,
  editDraft,
  editInputWidthCh,
  onEditDraftChange,
  onCommitEdit,
  onCancelEdit,
  onStartEdit,
  onDelete,
}: SortableIngredientTagProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: tag,
    disabled: disabled || isEditing,
  });

  const style: CSSProperties = isSorting
    ? undefined
    : {
        transform: CSS.Translate.toString(transform),
        transition,
      };

  if (isEditing) {
    return (
      <div ref={setNodeRef} style={style} className="shrink-0 w-fit">
        <input
          autoFocus
          className="rounded-full bg-white px-2 py-1 block h-full text-xs leading-none focus:outline-amber-400"
          style={{ width: `${editInputWidthCh(editDraft || tag)}ch` }}
          value={editDraft}
          onChange={(e) => onEditDraftChange(e.target.value.toLowerCase())}
          onBlur={onCommitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitEdit();
            if (e.key === 'Escape') onCancelEdit();
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative shrink-0 w-fit max-w-full rounded-full transition-shadow duration-150 ${
        isDropTarget ? 'ring-2 ring-primary-400/90 ring-offset-1 shadow-sm' : ''
      }`}
    >
      {isDragging && (
        <div
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-dashed border-amber-300/80 bg-amber-50/50"
          aria-hidden
        />
      )}
      <Chip
        size="sm"
        variant="flat"
        onClose={disabled ? undefined : onDelete}
        onClick={onStartEdit}
        classNames={{
          base: `leading-none cursor-pointer w-max max-w-full transition-opacity duration-150 ${
            isDragging ? 'opacity-0' : ''
          }`,
          closeButton: 'text-default-400 transition-colors hover:text-danger hover:opacity-100',
        }}
      >
        <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap">
          <span
            {...attributes}
            {...listeners}
            className={`inline-flex shrink-0 text-default-400 touch-none transition-colors ${
              disabled
                ? 'cursor-default'
                : 'cursor-grab active:cursor-grabbing hover:text-default-600'
            }`}
            aria-label={`Перетягнути «${tag}»`}
            onClick={(e) => e.stopPropagation()}
          >
            <DynamicIcon name="grip-vertical" size={12} />
          </span>
          {tag}
        </span>
      </Chip>
    </div>
  );
}

function IngredientTagPreview({ tag }: { tag: string }) {
  return (
    <Chip
      size="sm"
      variant="flat"
      classNames={{
        base: 'leading-none ring-2 ring-primary-300 bg-primary-50 shadow-md cursor-grabbing w-max',
      }}
    >
      <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap">
        <DynamicIcon name="grip-vertical" size={12} className="text-default-400" />
        {tag}
      </span>
    </Chip>
  );
}

interface ProductIngredientsTagsProps {
  value: string[];
  components: BomRow[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}

export function ProductIngredientsTags({
  value,
  components,
  disabled,
  onChange,
}: ProductIngredientsTagsProps) {
  const [draft, setDraft] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [bomRefreshConfirmOpen, setBomRefreshConfirmOpen] = useState(false);
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [overTag, setOverTag] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const bomDerived = useMemo(
    () => buildIngredientsJsonFromBom(
      components.map((c) => ({ componentName: c.componentName, qty: c.qty })),
    ),
    [components],
  );

  const addTag = () => {
    const tag = normalizeIngredientTag(draft);
    if (!tag || value.includes(tag)) {
      setDraft('');
      return;
    }
    onChange([...value, tag]);
    setDraft('');
  };

  const removeTag = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
  };

  const startEdit = (idx: number) => {
    if (disabled) return;
    setEditingIdx(idx);
    setEditDraft(value[idx]);
  };

  const commitEdit = () => {
    if (editingIdx == null) return;
    const tag = normalizeIngredientTag(editDraft);
    if (!tag) {
      removeTag(editingIdx);
      setEditingIdx(null);
      return;
    }
    const next = [...value];
    if (value.some((item, idx) => item === tag && idx !== editingIdx)) {
      removeTag(editingIdx);
      setEditingIdx(null);
      return;
    }
    next[editingIdx] = tag;
    onChange(next);
    setEditingIdx(null);
    setEditDraft('');
  };

  const handleDragStart = (event: DragStartEvent) => {
    if (disabled) return;
    setActiveTag(String(event.active.id));
    setOverTag(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverTag(event.over ? String(event.over.id) : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTag(null);
    setOverTag(null);
    if (disabled) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromIdx = value.indexOf(String(active.id));
    const toIdx = value.indexOf(String(over.id));
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

    onChange(arrayMove(value, fromIdx, toIdx));

    if (editingIdx != null) {
      setEditingIdx(remapIndexAfterReorder(editingIdx, fromIdx, toIdx));
    }
    if (deleteConfirmIdx != null) {
      setDeleteConfirmIdx(remapIndexAfterReorder(deleteConfirmIdx, fromIdx, toIdx));
    }
  };

  const handleDragCancel = () => {
    setActiveTag(null);
    setOverTag(null);
  };

  const applyBomRefresh = () => {
    onChange(bomDerived);
    setBomRefreshConfirmOpen(false);
  };

  const confirmRemoveTag = () => {
    if (deleteConfirmIdx == null) return;
    removeTag(deleteConfirmIdx);
    setDeleteConfirmIdx(null);
  };

  const handleRefreshFromBom = () => {
    if (!bomDerived.length) return;
    if (value.length === 0 || ingredientsListsEqual(value, bomDerived)) {
      applyBomRefresh();
      return;
    }
    setBomRefreshConfirmOpen(true);
  };

  const editInputWidthCh = (text: string) => Math.max(text.length + 2, 4);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <DynamicIcon name="clipboard-list" size={14} className="text-default-500 shrink-0" />
          Склад
        </h3>
        <Button
          size="sm"
          color="success"
          variant="flat"
          className="design:btn-success-flat h-auto min-w-0 py-1.5 px-2.5 gap-1"
          isDisabled={disabled || !bomDerived.length}
          onPress={handleRefreshFromBom}
          startContent={<DynamicIcon name="refresh-cw" size={13} strokeWidth={2} />}
        >
          Оновити зі специфікації
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={value} strategy={rectSortingStrategy}>
          <div
            className={`ingredient-tags-dnd flex flex-wrap items-start gap-2 min-h-8 rounded-lg transition-colors duration-200 ${
              activeTag ? 'bg-default-100/60 ring-1 ring-primary-200/70' : ''
            }`}
          >
            {value.map((tag, idx) => (
              <SortableIngredientTag
                key={tag}
                tag={tag}
                disabled={disabled}
                isSorting={activeTag != null}
                isDropTarget={overTag === tag && activeTag !== tag}
                isEditing={editingIdx === idx}
                editDraft={editDraft}
                editInputWidthCh={editInputWidthCh}
                onEditDraftChange={setEditDraft}
                onCommitEdit={commitEdit}
                onCancelEdit={() => setEditingIdx(null)}
                onStartEdit={() => startEdit(idx)}
                onDelete={() => setDeleteConfirmIdx(idx)}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }}>
          {activeTag ? <IngredientTagPreview tag={activeTag} /> : null}
        </DragOverlay>
      </DndContext>

      <div className="flex gap-2">
        <Input
          size="sm"
          classNames={{
            base: 'max-w-3xs',
            input: 'px-1 placeholder:opacity-50',
          }}
          placeholder="Додати інгредієнт…"
          value={draft}
          isDisabled={disabled}
          onValueChange={(v) => setDraft(v.toLowerCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
        />
        <Button color="success" variant="flat" size="sm" isDisabled={disabled || !draft.trim()} onPress={addTag} isIconOnly><DynamicIcon name="plus" size={14} strokeWidth={2} /></Button>
      </div>

      <ConfirmModal
        isOpen={bomRefreshConfirmOpen}
        title="Оновити склад зі специфікації?"
        message="Поточний склад відрізняється від специфікації товару. Замінити теги даними зі специфікації?"
        confirmText="Оновити"
        confirmColor="success"
        onConfirm={applyBomRefresh}
        onCancel={() => setBomRefreshConfirmOpen(false)}
      />

      <ConfirmModal
        isOpen={deleteConfirmIdx !== null}
        title="Видалити інгредієнт?"
        message={
          deleteConfirmIdx !== null
            ? `Видалити «${value[deleteConfirmIdx]}» зі складу?`
            : ''
        }
        confirmText="Видалити"
        confirmColor="danger"
        onConfirm={confirmRemoveTag}
        onCancel={() => setDeleteConfirmIdx(null)}
      />
    </div>
  );
}
