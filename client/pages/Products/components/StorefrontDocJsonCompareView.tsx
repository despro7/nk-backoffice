import { useCallback, useMemo, useRef, useState } from 'react';
import type { ShouldExpandNodeInitially } from '@uiw/react-json-view';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import MetaLogJsonView, { normalizeJsonValue } from '@/components/MetaLogJsonView';
import { collectJsonStringPaths } from '@shared/utils/jsonStringPathMap';
import {
  formatStorefrontDocBlockDiffLine,
  storefrontDocDiffContentIndexes,
  summarizeStorefrontDescriptionDocDiff,
  type StorefrontDocBlockDiff,
} from '@shared/utils/storefrontDescriptionDocDiff';
import { shouldExpandStorefrontDocDiffNode } from '@shared/utils/storefrontDescriptionDocExpand';

interface StorefrontDocJsonCompareViewProps {
  localRaw: string;
  wooRaw: string;
  positionLabel: string;
}

type ExpandMode = 'diff' | 'all' | 'collapsed';

function shortDiffChipLabel(diff: StorefrontDocBlockDiff): string {
  const pos = diff.index + 1;
  if (diff.blockId) return `${pos} · ${diff.blockId}`;
  return String(pos);
}

function scrollSharedContainerToDiffIndex(container: HTMLDivElement | null, index: number) {
  if (!container) return;
  const anchor = container.querySelector(`[data-storefront-diff-index="${index}"]`) as HTMLElement | null;
  if (!anchor) return;
  const containerRect = container.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const top = container.scrollTop + (anchorRect.top - containerRect.top) - 12;
  container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

export function StorefrontDocJsonCompareView({
  localRaw,
  wooRaw,
  positionLabel,
}: StorefrontDocJsonCompareViewProps) {
  const { diffCount, diffs } = summarizeStorefrontDescriptionDocDiff(localRaw, wooRaw);
  const diffIndexes = useMemo(
    () => storefrontDocDiffContentIndexes(localRaw, wooRaw),
    [localRaw, wooRaw],
  );

  const localStringPaths = useMemo(
    () => collectJsonStringPaths(normalizeJsonValue(localRaw)),
    [localRaw],
  );
  const wooStringPaths = useMemo(
    () => collectJsonStringPaths(normalizeJsonValue(wooRaw)),
    [wooRaw],
  );

  const sharedScrollRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [jsonViewKey, setJsonViewKey] = useState(0);
  const [expandMode, setExpandMode] = useState<ExpandMode>('diff');

  const shouldExpandNodeInitially = useCallback<ShouldExpandNodeInitially<object>>(
    (_isExpanded, { keys }) => {
      if (expandMode === 'all') return true;
      if (expandMode === 'collapsed') return false;
      return shouldExpandStorefrontDocDiffNode(diffIndexes, keys);
    },
    [diffIndexes, expandMode],
  );

  const jsonCollapsed = expandMode === 'all' ? false : expandMode === 'collapsed' ? true : false;

  const scrollToDiffIndex = useCallback((index: number) => {
    scrollSharedContainerToDiffIndex(sharedScrollRef.current, index);
  }, []);

  const remountJson = useCallback((mode: ExpandMode) => {
    setExpandMode(mode);
    setJsonViewKey((k) => k + 1);
  }, []);

  return (
    <div className="flex min-h-0 flex-col gap-1.5">
      {diffCount > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {diffs.map((diff) => (
            <button
              key={`${diff.index}-${diff.kind}`}
              type="button"
              title={formatStorefrontDocBlockDiffLine(diff)}
              className="rounded-md border border-warning-300/70 bg-warning-50 px-1.5 py-0.5 text-[10px] font-medium text-warning-900 hover:bg-warning-100"
              onClick={() => scrollToDiffIndex(diff.index)}
            >
              {shortDiffChipLabel(diff)}
            </button>
          ))}
          <span className="text-[10px] text-default-400">
            · червоне/зелене = різний текст
          </span>
        </div>
      ) : (
        <p className="text-[10px] text-default-500">Зміст збігається; JSON може відрізнятися форматом.</p>
      )}

      <div className="flex items-center gap-1.5 my-1.5">
        <Button
          size="sm"
          variant="flat"
          aria-label="Розгорнути все"
          className="min-w-7 h-7"
          onPress={() => remountJson('all')}
          startContent={<DynamicIcon name="maximize-2" size={14} />}
        >
          Розгорнути все
        </Button>
        <Button
          size="sm"
          variant="flat"
          aria-label="Згорнути все"
          className="min-w-7 h-7"
          onPress={() => remountJson('collapsed')}
          startContent={<DynamicIcon name="minimize-2" size={14} />}
        >
          Згорнути все
        </Button>
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Пошук…"
          aria-label="Пошук у JSON"
          className="min-w-0 flex-1 rounded border border-default-200 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary-300"
        />
      </div>

      <div
        ref={sharedScrollRef}
        className="max-h-100 min-h-44 overflow-auto rounded-md border border-gray-700 bg-[#2e3440]"
      >
        <div className="grid grid-cols-1 divide-y divide-gray-700 md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="min-w-0 p-2">
            <p className="sticky top-0 z-[1] mb-1 bg-[#2e3440] pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Backoffice
            </p>
            <MetaLogJsonView
              key={`bo-${jsonViewKey}-${expandMode}`}
              value={localRaw}
              embedInParentScroll
              collapsed={jsonCollapsed}
              hideSearchControls
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              highlightContentIndexes={diffIndexes}
              shouldExpandNodeInitially={
                expandMode === 'diff' || expandMode === 'all' ? shouldExpandNodeInitially : undefined
              }
              peerStringByPath={wooStringPaths}
              inlineDiffSide="local"
            />
          </div>
          <div className="min-w-0 p-2">
            <p className="sticky top-0 z-[1] mb-1 bg-[#2e3440] pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              WooCommerce
            </p>
            <MetaLogJsonView
              key={`wc-${jsonViewKey}-${expandMode}`}
              value={wooRaw}
              embedInParentScroll
              collapsed={jsonCollapsed}
              hideSearchControls
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              highlightContentIndexes={diffIndexes}
              shouldExpandNodeInitially={
                expandMode === 'diff' || expandMode === 'all' ? shouldExpandNodeInitially : undefined
              }
              peerStringByPath={localStringPaths}
              inlineDiffSide="remote"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
