import { describe, expect, it } from 'vitest';
import { inlineDiffTokensForSide } from './textInlineDiff.js';

describe('textInlineDiff', () => {
  it('marks delete on local and insert on remote', () => {
    const local = 'Hello world';
    const remote = 'Goodbye world';
    const left = inlineDiffTokensForSide(local, remote, 'local');
    const right = inlineDiffTokensForSide(local, remote, 'remote');
    expect(left.some((t) => t.kind === 'delete')).toBe(true);
    expect(right.some((t) => t.kind === 'insert')).toBe(true);
  });
});
