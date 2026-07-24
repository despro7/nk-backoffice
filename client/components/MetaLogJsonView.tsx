import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import JsonView, { ValueQuote } from '@uiw/react-json-view';
import { lightTheme } from '@uiw/react-json-view/light';

type MetaLogJsonViewProps = {
  value: unknown;
  className?: string;
  collapsed?: number | boolean;
};

type CollapseMode = boolean | number;

type JsonRenderProps = {
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
};

type JsonRenderContext = {
  type?: 'type' | 'value';
  value?: unknown;
  keyName?: string | number;
};

const SEARCH_HIT_CLASS = 'meta-log-search-hit bg-yellow-200 text-inherit rounded-sm px-0.5';
const SEARCH_HIT_ACTIVE_CLASS = 'meta-log-search-hit bg-orange-300 ring-1 ring-orange-500 text-inherit rounded-sm px-0.5';

function normalizeJsonValue(value: unknown): unknown {
  if (value == null) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}'))
      || (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    }
    return value;
  }

  return value;
}

function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = q.toLowerCase();
  if (!lowerText.includes(lowerQuery)) return text;

  const parts: ReactNode[] = [];
  let start = 0;
  let index = lowerText.indexOf(lowerQuery, start);

  while (index !== -1) {
    if (index > start) parts.push(text.slice(start, index));
    parts.push(
      <mark
        key={`${index}-${start}`}
        data-meta-log-match=""
        className={SEARCH_HIT_CLASS}
      >
        {text.slice(index, index + q.length)}
      </mark>,
    );
    start = index + q.length;
    index = lowerText.indexOf(lowerQuery, start);
  }

  if (start < text.length) parts.push(text.slice(start));
  return parts.length === 1 ? parts[0] : parts;
}

function textMatchesQuery(text: string, query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  return text.toLowerCase().includes(q.toLowerCase());
}

function countSearchMatches(value: unknown, query: string): number {
  const q = query.trim();
  if (!q) return 0;

  let count = 0;

  const walk = (node: unknown, key?: string | number) => {
    if (key != null) {
      const keyText = String(key);
      count += countTextOccurrences(keyText, q);
    }

    if (node == null || typeof node !== 'object') {
      if (node != null) count += countTextOccurrences(String(node), q);
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item) => walk(item));
      return;
    }

    Object.entries(node as Record<string, unknown>).forEach(([entryKey, entryValue]) => {
      walk(entryValue, entryKey);
    });
  };

  walk(value);
  return count;
}

function countTextOccurrences(text: string, query: string): number {
  const q = query.trim();
  if (!q) return 0;

  const lowerText = text.toLowerCase();
  const lowerQuery = q.toLowerCase();
  let count = 0;
  let start = 0;

  while (start <= lowerText.length) {
    const index = lowerText.indexOf(lowerQuery, start);
    if (index === -1) break;
    count += 1;
    start = index + lowerQuery.length;
  }

  return count;
}

function createHighlightedValueRenderer(searchQuery: string) {
  return (props: JsonRenderProps, context: JsonRenderContext) => {
    if (context.type !== 'value' || !searchQuery.trim()) return undefined;

    const text = String(props.children ?? context.value ?? '');
    if (!textMatchesQuery(text, searchQuery)) return undefined;

    return (
      <span {...props} className={[props.className, 'w-rjv-value'].filter(Boolean).join(' ')}>
        {highlightMatch(text, searchQuery)}
      </span>
    );
  };
}

function createHighlightedStringRenderer(searchQuery: string) {
  return (props: JsonRenderProps, context: JsonRenderContext) => {
    if (context.type !== 'value' || !searchQuery.trim()) return undefined;

    const text = String(props.children ?? context.value ?? '');
    if (!textMatchesQuery(text, searchQuery)) return undefined;

    return (
      <Fragment>
        <ValueQuote />
        <span {...props} className={[props.className, 'w-rjv-value'].filter(Boolean).join(' ')}>
          {highlightMatch(text, searchQuery)}
        </span>
        <ValueQuote />
      </Fragment>
    );
  };
}

function createHighlightedKeyRenderer(searchQuery: string) {
  return (props: JsonRenderProps, context: JsonRenderContext) => {
    if (!searchQuery.trim()) return undefined;

    const text = String(context.keyName ?? props.children ?? '');
    if (!textMatchesQuery(text, searchQuery)) return undefined;

    return <span {...props}>{highlightMatch(text, searchQuery)}</span>;
  };
}

function getSearchStatusLabel(matchCount: number, activeMatchIndex: number): string {
  if (matchCount === 0) return '0 збігів';

  if (activeMatchIndex >= 0) {
    return `${activeMatchIndex + 1} / ${matchCount}`;
  }

  if (matchCount === 1) return '1 збіг · Enter';
  if (matchCount < 5) return `${matchCount} збіги · Enter`;
  return `${matchCount} збігів · Enter`;
}

type SearchControlsProps = {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  matchCount: number;
  activeMatchIndex: number;
  showCollapseControls?: boolean;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
};

function SearchControls({
  searchQuery,
  onSearchQueryChange,
  onSearchKeyDown,
  matchCount,
  activeMatchIndex,
  showCollapseControls = false,
  onExpandAll,
  onCollapseAll,
}: SearchControlsProps) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 shrink-0">
      {showCollapseControls ? (
        <>
          <button
            type="button"
            onClick={onExpandAll}
            className="text-xs px-2.5 py-1 rounded border bg-white hover:bg-gray-50 text-gray-700"
          >
            Розгорнути все
          </button>
          <button
            type="button"
            onClick={onCollapseAll}
            className="text-xs px-2.5 py-1 rounded border bg-white hover:bg-gray-50 text-gray-700"
          >
            Згорнути все
          </button>
        </>
      ) : null}
      <input
        type="search"
        value={searchQuery}
        onChange={(event) => onSearchQueryChange(event.target.value)}
        onKeyDown={onSearchKeyDown}
        placeholder="Пошук у логу..."
        aria-label="Пошук у логу"
        className="min-w-[180px] flex-1 text-xs px-2.5 py-1 rounded border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-primary-300"
      />
      {searchQuery.trim() ? (
        <span className="text-xs text-gray-500 shrink-0">
          {getSearchStatusLabel(matchCount, activeMatchIndex)}
        </span>
      ) : null}
    </div>
  );
}

export default function MetaLogJsonView({
  value,
  className = '',
  collapsed = 2,
}: MetaLogJsonViewProps) {
  const normalized = normalizeJsonValue(value);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [collapseMode, setCollapseMode] = useState<CollapseMode>(collapsed);
  const [viewKey, setViewKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
  const hadSearchRef = useRef(false);

  useEffect(() => {
    setCollapseMode(collapsed);
    setViewKey((key) => key + 1);
    setSearchQuery('');
    setActiveMatchIndex(-1);
    hadSearchRef.current = false;
  }, [value, collapsed]);

  useEffect(() => {
    const hasSearch = Boolean(searchQuery.trim());
    if (hasSearch && !hadSearchRef.current) {
      setCollapseMode(false);
      setViewKey((key) => key + 1);
    }
    hadSearchRef.current = hasSearch;
    setActiveMatchIndex(-1);
  }, [searchQuery]);

  const matchCount = useMemo(() => {
    if (normalized == null) return 0;
    if (typeof normalized === 'string' || typeof normalized === 'number' || typeof normalized === 'boolean') {
      return countTextOccurrences(String(normalized), searchQuery);
    }
    if (typeof normalized === 'object') {
      return countSearchMatches(normalized, searchQuery);
    }
    return 0;
  }, [normalized, searchQuery]);

  const highlightedValueRenderer = useMemo(
    () => createHighlightedValueRenderer(searchQuery),
    [searchQuery],
  );
  const highlightedStringRenderer = useMemo(
    () => createHighlightedStringRenderer(searchQuery),
    [searchQuery],
  );
  const highlightedKeyRenderer = useMemo(
    () => createHighlightedKeyRenderer(searchQuery),
    [searchQuery],
  );

  const applyActiveMatchStyles = useCallback((index: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const marks = container.querySelectorAll<HTMLElement>('[data-meta-log-match]');
    marks.forEach((mark, markIndex) => {
      mark.className = markIndex === index ? SEARCH_HIT_ACTIVE_CLASS : SEARCH_HIT_CLASS;
    });

    marks[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  useEffect(() => {
    if (activeMatchIndex < 0) {
      const container = scrollContainerRef.current;
      container?.querySelectorAll<HTMLElement>('[data-meta-log-match]').forEach((mark) => {
        mark.className = SEARCH_HIT_CLASS;
      });
      return;
    }

    applyActiveMatchStyles(activeMatchIndex);
  }, [activeMatchIndex, searchQuery, viewKey, applyActiveMatchStyles]);

  const focusMatch = useCallback((direction: 'next' | 'prev') => {
    const container = scrollContainerRef.current;
    if (!container || !searchQuery.trim()) return;

    const marks = container.querySelectorAll('[data-meta-log-match]');
    if (marks.length === 0) return;

    setActiveMatchIndex((currentIndex) => {
      if (currentIndex < 0) {
        return direction === 'next' ? 0 : marks.length - 1;
      }

      if (direction === 'next') {
        return (currentIndex + 1) % marks.length;
      }

      return currentIndex <= 0 ? marks.length - 1 : currentIndex - 1;
    });
  }, [searchQuery]);

  const handleSearchKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || !searchQuery.trim()) return;

    event.preventDefault();
    focusMatch(event.shiftKey ? 'prev' : 'next');
  }, [focusMatch, searchQuery]);

  const applyCollapseMode = (mode: CollapseMode) => {
    setCollapseMode(mode);
    setViewKey((key) => key + 1);
    setActiveMatchIndex(-1);
  };

  if (normalized == null) {
    return <span className="text-gray-400">—</span>;
  }

  if (typeof normalized === 'string' || typeof normalized === 'number' || typeof normalized === 'boolean') {
    const text = String(normalized);

    return (
      <div className={`flex flex-col min-h-0 ${className}`}>
        <SearchControls
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onSearchKeyDown={handleSearchKeyDown}
          matchCount={matchCount}
          activeMatchIndex={activeMatchIndex}
        />
        <div
          ref={scrollContainerRef}
          className="overflow-auto rounded border border-gray-200 bg-white p-2 min-h-0 flex-1"
        >
          <pre className="text-xs whitespace-pre-wrap break-words">
            {highlightMatch(text, searchQuery)}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <SearchControls
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onSearchKeyDown={handleSearchKeyDown}
        matchCount={matchCount}
        activeMatchIndex={activeMatchIndex}
        showCollapseControls
        onExpandAll={() => applyCollapseMode(false)}
        onCollapseAll={() => applyCollapseMode(true)}
      />

      <div
        ref={scrollContainerRef}
        className="overflow-auto rounded border border-gray-200 bg-white p-2 min-h-0 flex-1"
      >
        <JsonView
          key={viewKey}
          value={normalized as object}
          style={lightTheme}
          collapsed={collapseMode}
          displayObjectSize={false}
          displayDataTypes={false}
          shortenTextAfterLength={searchQuery.trim() ? 0 : 30}
        >
          <JsonView.KeyName render={highlightedKeyRenderer} />
          <JsonView.String render={highlightedStringRenderer} />
          <JsonView.Int render={highlightedValueRenderer} />
          <JsonView.Float render={highlightedValueRenderer} />
          <JsonView.Bigint render={highlightedValueRenderer} />
          <JsonView.True render={highlightedValueRenderer} />
          <JsonView.False render={highlightedValueRenderer} />
          <JsonView.Null render={highlightedValueRenderer} />
          <JsonView.Undefined render={highlightedValueRenderer} />
          <JsonView.Date render={highlightedValueRenderer} />
        </JsonView>
      </div>
    </div>
  );
}
