export type InlineDiffTokenKind = 'equal' | 'delete' | 'insert';

export interface InlineDiffToken {
  kind: InlineDiffTokenKind;
  text: string;
}

type DiffOp =
  | { type: 'equal'; text: string }
  | { type: 'delete'; text: string }
  | { type: 'insert'; text: string };

function tokenizeWords(text: string): string[] {
  return text.match(/\S+|\s+/g) ?? [text];
}

/** Word-level diff (достатньо для довгих marketing/storage текстів). */
export function diffWordsToOps(local: string, remote: string): DiffOp[] {
  const a = tokenizeWords(local);
  const b = tokenizeWords(remote);
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const ops: DiffOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: 'equal', text: a[i - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'insert', text: b[j - 1] });
      j -= 1;
    } else {
      ops.push({ type: 'delete', text: a[i - 1] });
      i -= 1;
    }
  }

  ops.reverse();
  return mergeAdjacentOps(ops);
}

function mergeAdjacentOps(ops: DiffOp[]): DiffOp[] {
  const merged: DiffOp[] = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type) {
      last.text += op.text;
    } else {
      merged.push({ ...op });
    }
  }
  return merged;
}

export function inlineDiffTokensForSide(
  local: string,
  remote: string,
  side: 'local' | 'remote',
): InlineDiffToken[] {
  const ops = diffWordsToOps(local, remote);
  const tokens: InlineDiffToken[] = [];

  for (const op of ops) {
    if (op.type === 'equal') {
      tokens.push({ kind: 'equal', text: op.text });
      continue;
    }
    if (side === 'local' && op.type === 'delete') {
      tokens.push({ kind: 'delete', text: op.text });
    }
    if (side === 'remote' && op.type === 'insert') {
      tokens.push({ kind: 'insert', text: op.text });
    }
  }

  return tokens;
}
