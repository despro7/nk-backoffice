import { useMemo } from 'react';
import { inlineDiffTokensForSide } from '@shared/utils/textInlineDiff';

interface InlineDiffTextProps {
  local: string;
  remote: string;
  side: 'local' | 'remote';
}

export function InlineDiffText({ local, remote, side }: InlineDiffTextProps) {
  const tokens = useMemo(
    () => inlineDiffTokensForSide(local, remote, side),
    [local, remote, side],
  );

  return (
    <>
      {tokens.map((token, index) => {
        if (token.kind === 'delete') {
          return (
            <mark
              key={`${index}-${token.kind}`}
              className="rounded-sm bg-red-500/40 px-0.5 text-inherit"
            >
              {token.text}
            </mark>
          );
        }
        if (token.kind === 'insert') {
          return (
            <mark
              key={`${index}-${token.kind}`}
              className="rounded-sm bg-emerald-500/40 px-0.5 text-inherit"
            >
              {token.text}
            </mark>
          );
        }
        return <span key={`${index}-${token.kind}`}>{token.text}</span>;
      })}
    </>
  );
}
