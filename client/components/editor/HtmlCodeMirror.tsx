import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { prettifyHtml } from '@shared/utils/prettifyHtml';

export type SourceCodeMirrorLanguage = 'html' | 'json';

interface HtmlCodeMirrorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  minHeight?: string;
  language?: SourceCodeMirrorLanguage;
  /** `panel` — bordered block for modals; `embedded` — flush inside editor shell */
  variant?: 'panel' | 'embedded';
}

export function HtmlCodeMirror({
  value,
  onChange,
  readOnly = true,
  minHeight = '320px',
  language = 'html',
  variant = 'panel',
}: HtmlCodeMirrorProps) {
  const extensions = useMemo(
    () => (language === 'json' ? [json()] : [html()]),
    [language],
  );

  const className =
    variant === 'embedded'
      ? 'overflow-hidden rounded-none border-0 text-xs'
      : 'overflow-hidden rounded-sm border border-default-200 text-sm';

  return (
    <CodeMirror
      value={value}
      height={minHeight}
      theme={oneDark}
      extensions={extensions}
      editable={!readOnly}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: !readOnly,
        highlightActiveLineGutter: !readOnly,
      }}
      className={className}
    />
  );
}

export function formatSourceCodeMirrorValue(
  value: string,
  language: SourceCodeMirrorLanguage,
): string {
  if (language === 'json') {
    try {
      return JSON.stringify(JSON.parse(value || '{}'), null, 2);
    } catch {
      return value;
    }
  }

  const trimmed = value.trim();
  if (!trimmed) return '';
  return prettifyHtml(trimmed);
}
