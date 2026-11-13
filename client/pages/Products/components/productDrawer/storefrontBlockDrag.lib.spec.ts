import { describe, expect, it } from 'vitest';
import { Schema, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { buildMoveTopLevelNodeTransaction, resolveInsertPos } from './storefrontBlockDrag.lib';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    text: {},
  },
});

function stateOf(...texts: string[]): EditorState {
  const doc = schema.node(
    'doc',
    null,
    texts.map((text) => schema.node('paragraph', null, text ? [schema.text(text)] : [])),
  );
  return EditorState.create({ schema, doc });
}

function topLevelPositions(doc: ProseMirrorNode): number[] {
  const positions: number[] = [];
  let pos = 0;
  doc.forEach((child) => {
    positions.push(pos);
    pos += child.nodeSize;
  });
  positions.push(pos);
  return positions;
}

function order(doc: ProseMirrorNode): string[] {
  const out: string[] = [];
  doc.forEach((child) => out.push(child.textContent));
  return out;
}

/** Переносить вузол з індексу `from` на межу перед індексом `before` (before = childCount: у кінець). */
function move(texts: string[], from: number, before: number): string[] {
  const state = stateOf(...texts);
  const bounds = topLevelPositions(state.doc);
  const tr = buildMoveTopLevelNodeTransaction(state, bounds[from], bounds[before]);
  return tr ? order(tr.doc) : texts;
}

describe('buildMoveTopLevelNodeTransaction', () => {
  const blocks = ['salt', 'kbzhv', 'storage', 'heating', 'weight'];

  it('moves a block down to the requested slot', () => {
    expect(move(blocks, 0, 4)).toEqual(['kbzhv', 'storage', 'heating', 'salt', 'weight']);
  });

  it('moves a block to the end of the document', () => {
    expect(move(blocks, 1, 5)).toEqual(['salt', 'storage', 'heating', 'weight', 'kbzhv']);
  });

  it('moves a block up', () => {
    expect(move(blocks, 3, 0)).toEqual(['heating', 'salt', 'kbzhv', 'storage', 'weight']);
  });

  it('moves a block one slot down', () => {
    expect(move(blocks, 1, 3)).toEqual(['salt', 'storage', 'kbzhv', 'heating', 'weight']);
  });

  it('returns null when the target is the block own position', () => {
    const state = stateOf(...blocks);
    const bounds = topLevelPositions(state.doc);
    expect(buildMoveTopLevelNodeTransaction(state, bounds[2], bounds[2])).toBeNull();
    expect(buildMoveTopLevelNodeTransaction(state, bounds[2], bounds[3])).toBeNull();
  });

  it('keeps every block exactly once', () => {
    for (let from = 0; from < blocks.length; from += 1) {
      for (let before = 0; before <= blocks.length; before += 1) {
        expect([...move(blocks, from, before)].sort()).toEqual([...blocks].sort());
      }
    }
  });
});

describe('resolveInsertPos', () => {
  const slots = [
    { pos: 0, nodeSize: 10, top: 0, bottom: 20 },
    { pos: 10, nodeSize: 10, top: 20, bottom: 40 },
    { pos: 20, nodeSize: 10, top: 40, bottom: 60 },
  ];

  it('returns the slot whose upper half is under the pointer', () => {
    expect(resolveInsertPos(slots, 5, 20)).toBe(0);
    expect(resolveInsertPos(slots, 25, 0)).toBe(10);
  });

  it('returns the end of the document below the last slot', () => {
    expect(resolveInsertPos(slots, 100, 0)).toBe(30);
  });

  it('skips the dragged slot', () => {
    expect(resolveInsertPos(slots, 25, 10)).toBe(20);
  });
});
