import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Button, Divider, Textarea } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface DescriptionEditorProps {
  value: string;
  onChange: (html: string) => void;
  isDisabled?: boolean;
  /** Tailwind min-height для області редактора */
  minHeightClass?: string;
}

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

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          HTMLAttributes: { class: 'text-primary underline' },
        },
      }),
    ],
    content: value || '',
    editable: !isDisabled,
    onUpdate: ({ editor: ed }) => {
      const html = ed.isEmpty ? '' : ed.getHTML();
      onChange(html);
    },
    onTransaction: () => {
      setToolbarTick((t) => t + 1);
    },
    editorProps: {
      attributes: {
        class: `${minHeightClass} px-3 py-2 focus:outline-none text-sm leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline`,
      },
    },
  });

  // Зовнішнє оновлення (load detail) — без зайвого onChange
  useEffect(() => {
    if (!editor) return;
    if (showSource) {
      setSourceText(value || '');
      return;
    }
    const current = editor.isEmpty ? '' : editor.getHTML();
    if ((value || '') !== current) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
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
      const html = editor.isEmpty ? '' : editor.getHTML();
      setSourceText(html);
      setShowSource(true);
      return;
    }
    editor.commands.setContent(sourceText || '', { emitUpdate: true });
    setShowSource(false);
  };

  const handleSourceChange = (next: string) => {
    setSourceText(next);
    onChange(next);
  };

  const fmtDisabled = isDisabled || !editor || showSource;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={`overflow-hidden rounded-medium border border-default-200 bg-default-50 ${
          isDisabled ? 'opacity-60' : ''
        }`}
      >
        <div className="flex flex-wrap items-center gap-0.5 border-b border-default-200 px-1 py-1">
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

          <Divider orientation="vertical" className="mx-1 h-5" />

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
          <Button
            isIconOnly
            size="sm"
            variant={editor?.isActive('strike') ? 'flat' : 'light'}
            className="hidden md:block"
            aria-label="Закреслений"
            isDisabled={fmtDisabled}
            onPress={() => editor?.chain().focus().toggleStrike().run()}
          >
            <DynamicIcon name="strikethrough" size={14} />
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant={editor?.isActive('bulletList') ? 'flat' : 'light'}
            aria-label="Маркований список"
            isDisabled={fmtDisabled}
            onPress={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <DynamicIcon name="list" size={14} />
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant={editor?.isActive('orderedList') ? 'flat' : 'light'}
            aria-label="Нумерований список"
            isDisabled={fmtDisabled}
            onPress={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <DynamicIcon name="list-ordered" size={14} />
          </Button>
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
          <Button
            isIconOnly
            size="sm"
            variant="light"
            aria-label="Очистити форматування"
            isDisabled={fmtDisabled}
            onPress={() =>
              editor?.chain().focus().unsetAllMarks().clearNodes().run()
            }
          >
            <DynamicIcon name="remove-formatting" size={14} />
          </Button>

          <Divider orientation="vertical" className="mx-1 h-5" />

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
        </div>

        {showSource ? (
          <Textarea
            aria-label="HTML source"
            minRows={4}
            value={sourceText}
            isDisabled={isDisabled}
            onValueChange={handleSourceChange}
            classNames={{
              inputWrapper:
                'shadow-none bg-transparent border-0 rounded-none px-0',
              input: `${minHeightClass} px-3 py-2 font-mono text-xs leading-relaxed`,
            }}
          />
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>
    </div>
  );
}
