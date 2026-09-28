import type { Editor as TipTapCoreEditor } from '@tiptap/core';
import {
  applyTouchGestureClasses,
  capturePointer,
  holdSelection,
  releasePointer,
} from '@/lib/touch';

export type StorefrontBlockDragCleanup = () => void;

type TopLevelSlot = {
  pos: number;
  nodeSize: number;
  top: number;
  bottom: number;
};

function collectTopLevelSlots(editor: TipTapCoreEditor): TopLevelSlot[] {
  const { view } = editor;
  const { doc } = view.state;
  const slots: TopLevelSlot[] = [];
  let pos = 0;

  for (let i = 0; i < doc.childCount; i += 1) {
    const child = doc.child(i);
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      const rect = dom.getBoundingClientRect();
      slots.push({
        pos,
        nodeSize: child.nodeSize,
        top: rect.top,
        bottom: rect.bottom,
      });
    }
    pos += child.nodeSize;
  }

  return slots;
}

function resolveInsertPos(slots: TopLevelSlot[], clientY: number, excludePos: number): number | null {
  if (slots.length === 0) return null;

  for (const slot of slots) {
    if (slot.pos === excludePos) continue;
    const mid = slot.top + (slot.bottom - slot.top) / 2;
    if (clientY < mid) return slot.pos;
  }

  const last = slots[slots.length - 1];
  if (last.pos === excludePos) {
    return excludePos;
  }
  return last.pos + last.nodeSize;
}

function moveTopLevelNode(editor: TipTapCoreEditor, fromPos: number, insertPos: number): void {
  const { state, view } = editor;
  const node = state.doc.nodeAt(fromPos);
  if (!node) return;

  const nodeSize = node.nodeSize;
  let targetPos = insertPos;
  if (targetPos > fromPos) targetPos -= nodeSize;
  if (targetPos === fromPos) return;

  const tr = state.tr.delete(fromPos, fromPos + nodeSize);
  const mappedPos = tr.mapping.map(targetPos);
  tr.insert(mappedPos, node);
  view.dispatch(tr.scrollIntoView());
}

export function attachStorefrontBlockLongPressDrag(opts: {
  handle: HTMLElement;
  shell: HTMLElement;
  editor: TipTapCoreEditor;
  getPos: () => number | null;
  isEnabled: () => boolean;
  onDragStateChange?: (dragging: boolean) => void;
}): StorefrontBlockDragCleanup {
  const { handle, shell, editor, getPos, isEnabled, onDragStateChange } = opts;

  applyTouchGestureClasses(handle);

  let dragging = false;
  let activePointerId: number | null = null;
  let releaseSelection: (() => void) | null = null;
  let ghost: HTMLElement | null = null;
  let dropIndicator: HTMLElement | null = null;
  let dropInsertPos: number | null = null;
  let shellRect: DOMRect | null = null;

  const removeDropIndicator = () => {
    dropIndicator?.remove();
    dropIndicator = null;
    dropInsertPos = null;
  };

  const removeGhost = () => {
    ghost?.remove();
    ghost = null;
  };

  const setDragging = (next: boolean) => {
    if (dragging === next) return;
    dragging = next;
    shell.classList.toggle('storefront-block--dragging', next);
    shell.classList.toggle('storefront-block--drag-ready', next);
    onDragStateChange?.(next);
  };

  const finishDrag = () => {
    releaseSelection?.();
    releaseSelection = null;

    if (dragging) {
      const fromPos = getPos();
      if (fromPos != null && dropInsertPos != null) {
        moveTopLevelNode(editor, fromPos, dropInsertPos);
      }
    }

    if (activePointerId != null) {
      releasePointer(handle, activePointerId);
      activePointerId = null;
    }

    detachWindowListeners();
    removeGhost();
    removeDropIndicator();
    setDragging(false);
    shellRect = null;
  };

  const updateDropTarget = (clientY: number) => {
    const fromPos = getPos();
    if (fromPos == null) return;

    const slots = collectTopLevelSlots(editor);
    const insertPos = resolveInsertPos(slots, clientY, fromPos);
    if (insertPos == null || insertPos === fromPos) {
      removeDropIndicator();
      return;
    }

    dropInsertPos = insertPos;

    let indicatorY = clientY;
    const beforeSlot = slots.find((slot) => slot.pos === insertPos);
    if (beforeSlot) {
      indicatorY = beforeSlot.top;
    } else {
      const afterSlot = slots.find((slot) => slot.pos + slot.nodeSize === insertPos);
      if (afterSlot) indicatorY = afterSlot.bottom;
    }

    const editorRect = editor.view.dom.getBoundingClientRect();
    if (!dropIndicator) {
      dropIndicator = document.createElement('div');
      dropIndicator.className = 'storefront-block-drop-indicator';
      document.body.appendChild(dropIndicator);
    }

    dropIndicator.style.left = `${editorRect.left + 8}px`;
    dropIndicator.style.width = `${Math.max(0, editorRect.width - 16)}px`;
    dropIndicator.style.top = `${indicatorY}px`;
  };

  const onWindowPointerMove = (event: PointerEvent) => {
    onPointerMove(event);
  };

  const onWindowPointerUp = (event: PointerEvent) => {
    onPointerUp(event);
  };

  const attachWindowListeners = () => {
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);
  };

  const detachWindowListeners = () => {
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
    window.removeEventListener('pointercancel', onWindowPointerUp);
  };

  const startDrag = (pointerId: number) => {
    if (!isEnabled()) return;
    const fromPos = getPos();
    if (fromPos == null) return;

    capturePointer(handle, pointerId);
    activePointerId = pointerId;
    releaseSelection = holdSelection(shell);
    shellRect = shell.getBoundingClientRect();

    ghost = shell.cloneNode(true) as HTMLElement;
    ghost.className = `${shell.className} storefront-block__ghost`;
    ghost.style.width = `${shellRect.width}px`;
    ghost.style.left = `${shellRect.left}px`;
    ghost.style.top = `${shellRect.top}px`;
    document.body.appendChild(ghost);

    attachWindowListeners();
    setDragging(true);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!isEnabled() || event.button !== 0) return;
    if (dragging) return;

    event.preventDefault();
    startDrag(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    if (activePointerId != null && event.pointerId !== activePointerId) return;

    if (ghost && shellRect) {
      const offsetY = event.clientY - shellRect.top - shellRect.height / 2;
      ghost.style.top = `${shellRect.top + offsetY}px`;
    }

    updateDropTarget(event.clientY);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (activePointerId != null && event.pointerId !== activePointerId) return;
    if (dragging) {
      finishDrag();
      return;
    }
    activePointerId = null;
  };

  const onPointerCancel = (event: PointerEvent) => {
    if (activePointerId != null && event.pointerId !== activePointerId) return;
    finishDrag();
  };

  const onContextMenu = (event: Event) => {
    event.preventDefault();
  };

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('pointercancel', onPointerCancel);
  handle.addEventListener('contextmenu', onContextMenu);

  return () => {
    finishDrag();
    handle.removeEventListener('pointerdown', onPointerDown);
    handle.removeEventListener('pointermove', onPointerMove);
    handle.removeEventListener('pointerup', onPointerUp);
    handle.removeEventListener('pointercancel', onPointerCancel);
    handle.removeEventListener('contextmenu', onContextMenu);
  };
}
