import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Button, Divider, Select, SelectItem } from '@heroui/react';
import type { SharedSelection } from '@heroui/react';
import {
  formatSourceCodeMirrorValue,
  HtmlCodeMirror,
} from '@/components/editor/HtmlCodeMirror';
import { EditorToolbarTooltip } from '@/components/editor/EditorToolbarTooltip';
import {
  clearStorefrontEditorFormatting,
  EDITOR_HEADING_LEVELS,
  EDITOR_HEADING_OPTIONS,
  EDITOR_SOURCE_MIN_HEIGHT,
  resolveActiveEditorHeadingKey,
  toggleStorefrontBulletList,
  toggleStorefrontOrderedList,
  type EditorHeadingLevel,
} from '@/components/editor/editorFormatting';
import { DynamicIcon } from 'lucide-react/dynamic';
import { StorefrontListItem } from './productDrawer/StorefrontListItem';
import { normalizeStorefrontBlockHtml } from '@shared/utils/storefrontDescription';

interface DescriptionEditorProps {
  value: string;
  onChange: (html: string) => void;
  isDisabled?: boolean;
  /** Tailwind min-height для області редактора */
  minHeightClass?: string;
}

const EDITOR_SURFACE_CLASS =
  'description-template-editor px-3 py-2 focus:outline-none text-sm leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-bold [&_h4]:text-base [&_h4]:font-bold [&_h5]:text-sm [&_h5]:font-bold [&_h6]:text-xs [&_h6]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline [&_li>p]:m-0 [&_li>p]:contents';

/**
 * Легкий TipTap WYSIWYG для catalog_goods.description / fullDescription (HTML).
 */
export function DescriptionEditor({
  value,
  onChange,
  isDisabled,
  minHeightClass = 'min-h-[88px]',
}: DescriptionEditorProps) {
  const [showSource, setShowSource] = useState(false);
  const [sourceText, setSourceText] = useState('');
  /** Тригер ре-рендеру тулбару після undo/redo / setContent */
  const [, setToolbarTick] = useState(0);
  const skipUpdateRef = useRef(true);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [...EDITOR_HEADING_LEVELS] },
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        listItem: false,
        link: {
          openOnClick: false,
          HTMLAttributes: { class: 'text-primary underline' },
        },
      }),
      StorefrontListItem,
    ],
    content: '',
    editable: !isDisabled,
    onUpdate: ({ editor: ed }) => {
      if (skipUpdateRef.current) return;
      const html = ed.isEmpty ? '' : normalizeStorefrontBlockHtml(ed.getHTML());
      onChange(html);
    },
    onTransaction: () => {
      setToolbarTick((t) => t + 1);
    },
    editorProps: {
      attributes: {
        class: `${minHeightClass} ${EDITOR_SURFACE_CLASS}`,
      },
    },
  });

  // Зовнішнє оновлення (load detail) — без зайвого onChange
  useEffect(() => {
    if (!editor) return;
    skipUpdateRef.current = true;
    if (showSource) {
      setSourceText(formatSourceCodeMirrorValue(value || '', 'html'));
      skipUpdateRef.current = false;
      return;
    }
    const normalizedValue = normalizeStorefrontBlockHtml(value || '');
    const current = editor.isEmpty ? '' : normalizeStorefrontBlockHtml(editor.getHTML());
    if (normalizedValue !== current) {
      editor.commands.setContent(normalizedValue, { emitUpdate: false });
    }
    requestAnimationFrame(() => {
      skipUpdateRef.current = false;
    });
  }, [value, editor, showSource]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!isDisabled && !showSource);
  }, [editor, isDisabled, showSource]);

  const setLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL посилання', prev || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const toggleSource = () => {
    if (!editor) return;
    if (!showSource) {
      const html = editor.isEmpty ? '' : normalizeStorefrontBlockHtml(editor.getHTML());
      setSourceText(formatSourceCodeMirrorValue(html, 'html'));
      setShowSource(true);
      return;
    }
    editor.commands.setContent(normalizeStorefrontBlockHtml(sourceText || ''), { emitUpdate: true });
    setShowSource(false);
  };

  const handleSourceChange = (next: string) => {
    setSourceText(next);
    onChange(normalizeStorefrontBlockHtml(next));
  };

  const fmtDisabled = isDisabled || !editor || showSource;
  const activeHeadingKey = resolveActiveEditorHeadingKey(editor);
  const activeHeadingOption =
    EDITOR_HEADING_OPTIONS.find((option) => option.key === activeHeadingKey) ??
    EDITOR_HEADING_OPTIONS[0];

  const setHeadingFormat = (keys: SharedSelection) => {
    if (!editor || keys === 'all') return;
    const key = Array.from(keys)[0]?.toString() ?? 'paragraph';
    if (key === 'paragraph') {
      editor.chain().focus().setParagraph().run();
      return;
    }
    const level = Number(key);
    if (!EDITOR_HEADING_LEVELS.includes(level as EditorHeadingLevel)) return;
    editor.chain().focus().setHeading({ level: level as EditorHeadingLevel }).run();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={`overflow-hidden rounded-medium border border-default-200 bg-default-100 ${
          isDisabled ? 'opacity-60' : ''
        }`}
      >
        <div className="flex flex-wrap items-center gap-0.5 border-b border-default-200 px-1 py-1">
          <EditorToolbarTooltip content="Скасувати">
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label="Скасувати"
              isDisabled={fmtDisabled || !editor?.can().undo()}
              onPress={() => editor?.chain().focus().undo().run()}
            >
              <DynamicIcon name="undo-2" size={14} />
            </Button>
          </EditorToolbarTooltip>
          <EditorToolbarTooltip content="Повторити">
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label="Повторити"
              isDisabled={fmtDisabled || !editor?.can().redo()}
              onPress={() => editor?.chain().focus().redo().run()}
            >
              <DynamicIcon name="redo-2" size={14} />
            </Button>
          </EditorToolbarTooltip>

          <Divider orientation="vertical" className="mx-1 h-5" />

          <Select
            aria-label="Формат абзацу"
            size="sm"
            variant="flat"
            isDisabled={fmtDisabled}
            selectedKeys={[activeHeadingKey]}
            onSelectionChange={setHeadingFormat}
            disallowEmptySelection
            className="w-[148px]"
            classNames={{
              trigger:
                'h-8 min-h-8 bg-transparent shadow-none data-[hover=true]:bg-default-100 px-2',
              value: 'text-xs',
              popoverContent: 'min-w-[220px]',
            }}
            renderValue={() => (
              <span
                className={
                  activeHeadingKey === 'paragraph'
                    ? 'text-xs'
                    : activeHeadingOption.itemClassName
                }
              >
                {activeHeadingOption.label}
              </span>
            )}
          >
            {EDITOR_HEADING_OPTIONS.map((option) => (
              <SelectItem key={option.key} textValue={option.label}>
                <span className={option.itemClassName ?? 'text-sm'}>{option.label}</span>
              </SelectItem>
            ))}
          </Select>

          <Divider orientation="vertical" className="mx-1 h-5" />

          <EditorToolbarTooltip content="Жирний">
            <Button
              isIconOnly
              size="sm"
              variant={editor?.isActive('bold') ? 'flat' : 'light'}
              aria-label="Жирний"
              isDisabled={fmtDisabled}
              onPress={() => editor?.chain().focus().toggleBold().run()}
            >
              <DynamicIcon name="bold" size={14} />
            </Button>
          </EditorToolbarTooltip>
          <EditorToolbarTooltip content="Курсив">
            <Button
              isIconOnly
              size="sm"
              variant={editor?.isActive('italic') ? 'flat' : 'light'}
              aria-label="Курсив"
              isDisabled={fmtDisabled}
              onPress={() => editor?.chain().focus().toggleItalic().run()}
            >
              <DynamicIcon name="italic" size={14} />
            </Button>
          </EditorToolbarTooltip>
          <EditorToolbarTooltip content="Закреслений">
            <Button
              isIconOnly
              size="sm"
              variant={editor?.isActive('strike') ? 'flat' : 'light'}
              aria-label="Закреслений"
              isDisabled={fmtDisabled}
              onPress={() => editor?.chain().focus().toggleStrike().run()}
            >
              <DynamicIcon name="strikethrough" size={14} />
            </Button>
          </EditorToolbarTooltip>
          <EditorToolbarTooltip content="Маркований список">
            <Button
              isIconOnly
              size="sm"
              variant={editor?.isActive('bulletList') ? 'flat' : 'light'}
              aria-label="Маркований список"
              isDisabled={fmtDisabled}
              onPress={() => editor && toggleStorefrontBulletList(editor)}
            >
              <DynamicIcon name="list" size={14} />
            </Button>
          </EditorToolbarTooltip>
          <EditorToolbarTooltip content="Нумерований список">
            <Button
              isIconOnly
              size="sm"
              variant={editor?.isActive('orderedList') ? 'flat' : 'light'}
              aria-label="Нумерований список"
              isDisabled={fmtDisabled}
              onPress={() => editor && toggleStorefrontOrderedList(editor)}
            >
              <DynamicIcon name="list-ordered" size={14} />
            </Button>
          </EditorToolbarTooltip>
          <EditorToolbarTooltip content="Посилання">
            <Button
              isIconOnly
              size="sm"
              variant={editor?.isActive('link') ? 'flat' : 'light'}
              aria-label="Посилання"
              isDisabled={fmtDisabled}
              onPress={setLink}
            >
              <DynamicIcon name="link" size={14} />
            </Button>
          </EditorToolbarTooltip>
          <EditorToolbarTooltip content="Очистити форматування">
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label="Очистити форматування"
              isDisabled={fmtDisabled}
              onPress={() => editor && clearStorefrontEditorFormatting(editor)}
            >
              <DynamicIcon name="remove-formatting" size={14} />
            </Button>
          </EditorToolbarTooltip>

          <Divider orientation="vertical" className="mx-1 h-5" />

          <EditorToolbarTooltip content={showSource ? 'Візуальний редактор' : 'HTML source'}>
            <Button
              isIconOnly
              size="sm"
              variant={showSource ? 'flat' : 'light'}
              color={showSource ? 'primary' : 'default'}
              aria-label={showSource ? 'Візуальний редактор' : 'HTML source'}
              isDisabled={isDisabled || !editor}
              onPress={toggleSource}
            >
              <DynamicIcon name="code-xml" size={14} />
            </Button>
          </EditorToolbarTooltip>
        </div>

        {showSource ? (
          <HtmlCodeMirror
            value={sourceText}
            language="html"
            variant="embedded"
            minHeight={EDITOR_SOURCE_MIN_HEIGHT}
            readOnly={isDisabled}
            onChange={handleSourceChange}
          />
        ) : (
          <EditorContent
            editor={editor}
            className="description-template-editor bg-default-50 [&_.tiptap]:bg-default-50 [&_.ProseMirror]:bg-default-50"
          />
        )}
      </div>
    </div>
  );
}
