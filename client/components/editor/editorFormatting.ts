import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';

export const EDITOR_HEADING_LEVELS = [2, 3, 4, 5, 6] as const;
export type EditorHeadingLevel = (typeof EDITOR_HEADING_LEVELS)[number];

export const EDITOR_SOURCE_MIN_HEIGHT = '320px';

export const EDITOR_HEADING_OPTIONS: Array<{
  key: 'paragraph' | `${EditorHeadingLevel}`;
  label: string;
  itemClassName?: string;
}> = [
  { key: 'paragraph', label: 'Параграф' },
  { key: '2', label: 'Заголовок 2', itemClassName: 'font-semibold text-[24px] leading-tight' },
  { key: '3', label: 'Заголовок 3', itemClassName: 'font-semibold text-[20px] leading-tight' },
  { key: '4', label: 'Заголовок 4', itemClassName: 'font-semibold text-[18px] leading-tight' },
  { key: '5', label: 'Заголовок 5', itemClassName: 'font-semibold text-[16px] leading-tight' },
  { key: '6', label: 'Заголовок 6', itemClassName: 'font-semibold text-sm leading-tight' },
];

const LIST_NODE_NAMES = new Set(['bulletList', 'orderedList']);

export function resolveActiveEditorHeadingKey(editor: Editor | null): string {
  if (!editor) return 'paragraph';
  for (const level of EDITOR_HEADING_LEVELS) {
    if (editor.isActive('heading', { level })) return String(level);
  }
  return 'paragraph';
}

function findParentList(
  doc: ProseMirrorNode,
  pos: number,
): { pos: number; node: ProseMirrorNode } | null {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (LIST_NODE_NAMES.has(node.type.name)) {
      return { pos: $pos.before(depth), node };
    }
  }
  return null;
}

function getListNodesInRange(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): Array<{ pos: number; node: ProseMirrorNode }> {
  const lists: Array<{ pos: number; node: ProseMirrorNode }> = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (LIST_NODE_NAMES.has(node.type.name)) {
      lists.push({ pos, node });
      return false;
    }
  });
  return lists;
}

function listItemsToParagraphs(
  listNode: ProseMirrorNode,
  paragraphType: ProseMirrorNode['type'],
): ProseMirrorNode[] {
  const paragraphs: ProseMirrorNode[] = [];
  listNode.forEach((child) => {
    if (child.type.name === 'listItem') {
      paragraphs.push(paragraphType.create(null, child.content));
    }
  });
  return paragraphs;
}

function unwrapListsInTransaction(
  tr: Transaction,
  from: number,
  to: number,
  paragraphType: ProseMirrorNode['type'],
): Transaction {
  const lists = getListNodesInRange(tr.doc, from, to);
  lists.sort((a, b) => b.pos - a.pos);

  for (const { pos, node } of lists) {
    const replacements = listItemsToParagraphs(node, paragraphType);
    if (replacements.length > 0) {
      tr = tr.replaceWith(pos, pos + node.nodeSize, replacements);
    }
  }

  return tr;
}

/** Unwrap bullet/ordered lists in the current selection to paragraphs. */
export function unwrapStorefrontListsInSelection(editor: Editor): boolean {
  const { state, view } = editor;
  const paragraph = state.schema.nodes.paragraph;
  if (!paragraph) return false;

  let tr = state.tr;
  const { from, to } = state.selection;
  tr = unwrapListsInTransaction(tr, from, to, paragraph);

  if (!tr.docChanged) return false;
  view.dispatch(tr.scrollIntoView());
  editor.commands.focus();
  return true;
}

type StorefrontListType = 'bulletList' | 'orderedList';

/**
 * Toggle list for editors with inline-only list items (`StorefrontListItem`).
 * TipTap's default wrapInList cannot place paragraph blocks inside `inline*` list items.
 */
export function toggleStorefrontList(editor: Editor, listTypeName: StorefrontListType): void {
  const { state, view } = editor;
  const listType = state.schema.nodes[listTypeName];
  const listItemType = state.schema.nodes.listItem;
  const paragraph = state.schema.nodes.paragraph;
  if (!listType || !listItemType || !paragraph) return;

  if (editor.isActive(listTypeName)) {
    unwrapStorefrontListsInSelection(editor);
    return;
  }

  const otherListTypeName: StorefrontListType =
    listTypeName === 'bulletList' ? 'orderedList' : 'bulletList';
  if (editor.isActive(otherListTypeName)) {
    const { from, to } = state.selection;
    const lists = getListNodesInRange(state.doc, from, to);
    if (lists.length === 0) return;

    let tr = state.tr;
    for (const { pos } of lists.sort((a, b) => b.pos - a.pos)) {
      tr = tr.setNodeMarkup(pos, listType);
    }
    view.dispatch(tr.scrollIntoView());
    editor.commands.focus();
    return;
  }

  const { $from, $to } = state.selection;
  const range = $from.blockRange($to);
  if (!range) return;

  const listItems: ProseMirrorNode[] = [];
  state.doc.nodesBetween(range.start, range.end, (node) => {
    if (!node.isTextblock || node.type.name === 'listItem') return;
    listItems.push(listItemType.create(null, node.content));
  });

  if (listItems.length === 0) return;

  const list = listType.create(null, listItems);
  const tr = state.tr.replaceRangeWith(range.start, range.end, list);
  view.dispatch(tr.scrollIntoView());
  editor.commands.focus();
}

export function toggleStorefrontBulletList(editor: Editor): void {
  toggleStorefrontList(editor, 'bulletList');
}

export function toggleStorefrontOrderedList(editor: Editor): void {
  toggleStorefrontList(editor, 'orderedList');
}

function clearParagraphClassesInTransaction(
  tr: Transaction,
  paragraphType: ProseMirrorNode['type'],
  from: number,
  to: number,
  empty: boolean,
): Transaction {
  const targets: number[] = [];

  if (empty) {
    const $pos = tr.doc.resolve(from);
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const node = $pos.node(depth);
      if (node.type === paragraphType && node.attrs.class) {
        targets.push($pos.before(depth));
        break;
      }
    }
  } else {
    tr.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type === paragraphType && node.attrs.class) {
        targets.push(pos);
      }
    });
  }

  for (const pos of targets.sort((a, b) => b - a)) {
    tr = tr.setNodeMarkup(pos, paragraphType, { class: null });
  }

  return tr;
}

/** Unset marks, unwrap lists, reset headings/blocks in selection to paragraph. */
export function clearStorefrontEditorFormatting(editor: Editor): void {
  const { state, view } = editor;
  const paragraph = state.schema.nodes.paragraph;
  if (!paragraph) return;

  const { from, to, empty } = state.selection;
  let tr = state.tr.removeMark(from, to);

  const rangeFrom = empty ? from : from;
  const rangeTo = empty ? from : to;

  if (empty) {
    const parentList = findParentList(tr.doc, from);
    if (parentList) {
      const replacements = listItemsToParagraphs(parentList.node, paragraph);
      if (replacements.length > 0) {
        tr = tr.replaceWith(
          parentList.pos,
          parentList.pos + parentList.node.nodeSize,
          replacements,
        );
      }
    }
  } else {
    tr = unwrapListsInTransaction(tr, rangeFrom, rangeTo, paragraph);
  }

  const headings: Array<{ pos: number }> = [];
  tr.doc.nodesBetween(rangeFrom, rangeTo, (node, pos) => {
    if (node.type.name === 'heading') headings.push({ pos });
  });
  headings.sort((a, b) => b.pos - a.pos);
  for (const { pos } of headings) {
    tr = tr.setNodeMarkup(pos, paragraph);
  }

  tr = clearParagraphClassesInTransaction(tr, paragraph, rangeFrom, rangeTo, empty);

  if (tr.docChanged) {
    view.dispatch(tr.scrollIntoView());
    editor.commands.focus();
    return;
  }

  editor
    .chain()
    .focus()
    .unsetAllMarks()
    .setParagraph()
    .updateAttributes('paragraph', { class: null })
    .run();
}
