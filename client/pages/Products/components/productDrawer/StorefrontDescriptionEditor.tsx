import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Editor as TipTapCoreEditor,
  Extension,
  Node,
  mergeAttributes,
} from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import Paragraph from '@tiptap/extension-paragraph';
import { EditorContent, useEditor } from '@tiptap/react';
import type { NodeViewRenderer } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Button, Divider, Textarea, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type {
  StorefrontBlockNodeAttrs,
  StorefrontBoundBlockValues,
  StorefrontDescriptionDoc,
} from '@shared/types/storefront';
import {
  getStorefrontBoundBlockEmptyMessage,
  isStorefrontTemplateBoundBlock,
  normalizeStorefrontBlockHtml,
  normalizeStorefrontDescriptionDoc,
  parseStorefrontDescriptionDoc,
  resolveStorefrontBlockPreviewHtml,
  stringifyStorefrontDescriptionDoc,
  resolveStorefrontPlaceholderLiveDisplay,
  templateFromStorefrontEditorHtml,
  templateHtmlForStorefrontEditorLive,
} from '@shared/utils/storefrontDescription';

interface StorefrontDescriptionEditorProps {
  value: string;
  boundValues: StorefrontBoundBlockValues;
  onChange: (json: string) => void;
  isDisabled?: boolean;
  minHeightClass?: string;
}

type StorefrontBlockExtensionOptions = {
  getBoundValues: () => StorefrontBoundBlockValues;
  getBoundRevision: () => number;
};

const BOUND_REFRESH_META = 'storefrontBoundRefresh';

const BOUND_BLOCK_CLICK_HINT =
  'Клікніть, щоб редагувати обрамлення блоку. Продуктові дані (склад, вага тощо) змінюються в окремих блоках форми, не тут.';
const OVERRIDE_BLOCK_CLICK_HINT =
  'Клікніть, щоб відкрити редагування тексту цього блоку';
const FROZEN_PLACEHOLDER_HINT =
  'Це значення береться з окремого блоку форми і тут не редагується. Змініть його у «Склад», «Харчова цінність» тощо.';

type StorefrontFloatingHint = {
  text: string;
  x: number;
  y: number;
};

function useStorefrontEditorFloatingHints(
  editor: TipTapCoreEditor | null,
  enabled: boolean,
): StorefrontFloatingHint | null {
  const [hint, setHint] = useState<StorefrontFloatingHint | null>(null);

  useEffect(() => {
    if (!editor || !enabled) {
      setHint(null);
      return;
    }

    const root = editor.view.dom;

    const showHint = (element: Element, text: string) => {
      const rect = element.getBoundingClientRect();
      setHint({
        text,
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      });
    };

    const onMouseOver = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const placeholder = target.closest('.storefront-ph-atom');
      if (placeholder) {
        showHint(placeholder, FROZEN_PLACEHOLDER_HINT);
        return;
      }

      const preview = target.closest('.storefront-block__preview--editable');
      if (!preview) return;

      const isBound = preview.closest('.storefront-block--protected') != null;
      showHint(preview, isBound ? BOUND_BLOCK_CLICK_HINT : OVERRIDE_BLOCK_CLICK_HINT);
    };

    const onMouseOut = (event: MouseEvent) => {
      const related = event.relatedTarget;
      if (related instanceof Element) {
        if (related.closest('.storefront-ph-atom, .storefront-block__preview--editable')) {
          return;
        }
      }
      setHint(null);
    };

    root.addEventListener('mouseover', onMouseOver);
    root.addEventListener('mouseout', onMouseOut);
    return () => {
      root.removeEventListener('mouseover', onMouseOver);
      root.removeEventListener('mouseout', onMouseOut);
      setHint(null);
    };
  }, [editor, enabled]);

  return hint;
}

function isEffectivelyEmptyParagraph(node: ProseMirrorNode): boolean {
  if (node.type.name !== 'paragraph') return false;
  if (node.content.size === 0) return true;
  let hasContent = false;
  node.content.forEach((child) => {
    if (child.type.name === 'hardBreak') return;
    if (child.type.name === 'text' && !child.text?.trim()) return;
    hasContent = true;
  });
  return !hasContent;
}

const RemoveTrailingEmptyParagraph = Extension.create({
  name: 'removeTrailingEmptyParagraph',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (_transactions, _oldState, newState) => {
          const last = newState.doc.lastChild;
          if (!last || !isEffectivelyEmptyParagraph(last)) return null;
          if (newState.doc.childCount <= 1) return null;
          return newState.tr.delete(
            newState.doc.content.size - last.nodeSize,
            newState.doc.content.size,
          );
        },
      }),
    ];
  },
});

const StorefrontPlaceholderNode = Node.create({
  name: 'storefrontPlaceholder',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,
  addAttributes() {
    return {
      key: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-storefront-placeholder'),
        renderHTML: (attributes) => ({
          'data-storefront-placeholder': attributes.key,
        }),
      },
      live: {
        default: '',
        parseHTML: (element) => element.textContent?.trim() ?? '',
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-storefront-placeholder]',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          return {
            key: element.getAttribute('data-storefront-placeholder') || '',
            live: element.textContent?.trim() ?? '',
          };
        },
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    const live = String(node.attrs.live ?? '').trim();
    const display = live || 'немає даних';
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: `storefront-ph-atom${live ? '' : ' storefront-ph-atom--empty'}`,
        contenteditable: 'false',
      }),
      display,
    ];
  },
});

const StorefrontAtomBackspaceGuard = Extension.create({
  name: 'storefrontAtomBackspaceGuard',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleKeyDown: (view, event) => {
            if (event.key !== 'Backspace') return false;
            const { state } = view;
            const { selection } = state;
            if (!selection.empty) return false;

            const { $from } = selection;
            if (!isEffectivelyEmptyParagraph($from.parent)) {
              return false;
            }

            const index = $from.index(-1);
            if (index <= 0) return false;

            const prev = $from.node(-1).child(index - 1);
            if (prev.type.name !== 'storefrontBlock') return false;

            const tr = state.tr
              .delete($from.before(), $from.after())
              .setMeta('skipTrailingNode', true);
            view.dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});

const StorefrontPlaceholderGuard = Extension.create({
  name: 'storefrontPlaceholderGuard',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction: (transaction, state) => {
          if (!transaction.docChanged) return true;
          const countPlaceholders = (doc: ProseMirrorNode) => {
            let count = 0;
            doc.descendants((child) => {
              if (child.type.name === 'storefrontPlaceholder') count += 1;
            });
            return count;
          };
          return countPlaceholders(transaction.doc) >= countPlaceholders(state.doc);
        },
      }),
    ];
  },
});

function stripTrailingEmptyParagraphs(state: import('@tiptap/pm/state').EditorState) {
  let tr = state.tr;
  let doc = state.doc;
  let changed = false;

  while (doc.childCount > 1) {
    const last = doc.lastChild;
    if (!last || !isEffectivelyEmptyParagraph(last)) break;
    tr = tr
      .delete(doc.content.size - last.nodeSize, doc.content.size)
      .setMeta('skipTrailingNode', true);
    doc = tr.doc;
    changed = true;
  }

  return changed ? tr : null;
}

function applyTrailingParagraphCleanup(editor: TipTapCoreEditor) {
  const tr = stripTrailingEmptyParagraphs(editor.state);
  if (tr) editor.view.dispatch(tr);
}

function attachMiniEditorBlurHandler(dom: HTMLElement, onBlur: () => void): () => void {
  const handleFocusOut = () => {
    window.requestAnimationFrame(() => {
      if (dom.contains(document.activeElement)) return;
      onBlur();
    });
  };
  dom.addEventListener('focusout', handleFocusOut);
  return () => dom.removeEventListener('focusout', handleFocusOut);
}

function refreshLivePlaceholdersInEditor(
  ed: TipTapCoreEditor,
  boundValues: StorefrontBoundBlockValues,
) {
  const { state } = ed;
  let tr = state.tr;
  let changed = false;

  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'storefrontPlaceholder') return;
    const key = String(node.attrs.key ?? '');
    const nextLive = resolveStorefrontPlaceholderLiveDisplay(key, boundValues);
    if (String(node.attrs.live ?? '') === nextLive) return;
    tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, live: nextLive });
    changed = true;
  });

  if (changed) {
    ed.view.dispatch(tr.setMeta('addToHistory', false));
  }
}

const STOREFRONT_TRAILING_NODE_OPTIONS = {
  notAfter: ['storefrontBlock', 'orderedList', 'bulletList'],
};

function createBlockMiniEditorExtensions(protectPlaceholders = false) {
  const extensions = [
    StarterKit.configure({
      heading: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
      trailingNode: STOREFRONT_TRAILING_NODE_OPTIONS,
      link: {
        openOnClick: false,
        HTMLAttributes: { class: 'text-primary underline' },
      },
    }),
  ];
  if (protectPlaceholders) {
    extensions.push(StorefrontPlaceholderNode, StorefrontPlaceholderGuard);
  }
  extensions.push(RemoveTrailingEmptyParagraph);
  return extensions;
}

function createStorefrontBlockNodeView(
  getOptions: () => StorefrontBlockExtensionOptions,
): NodeViewRenderer {
  return ({ node, getPos, editor }) => {
    let currentNode = node;
    let templateEdit = false;
    let overrideEdit = false;
    let miniEditor: TipTapCoreEditor | null = null;
    let detachMiniEditorBlur: (() => void) | null = null;
    let lastBoundRevision = getOptions().getBoundRevision();

    const dom = document.createElement('div');
    dom.dataset.storefrontBlock = '';

    const getBoundValues = () => getOptions().getBoundValues();

    const destroyMiniEditor = () => {
      detachMiniEditorBlur?.();
      detachMiniEditorBlur = null;
      miniEditor?.destroy();
      miniEditor = null;
    };

    const exitMiniEditor = () => {
      destroyMiniEditor();
      templateEdit = false;
      overrideEdit = false;
      render();
    };

    const posOrNull = (): number | null => {
      const pos = getPos();
      return typeof pos === 'number' ? pos : null;
    };

    const updateNodeAttr = (attrs: Partial<StorefrontBlockNodeAttrs>) => {
      const pos = posOrNull();
      if (pos == null) return;
      const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
        ...currentNode.attrs,
        ...attrs,
      });
      editor.view.dispatch(tr);
    };

    const renderTemplateWysiwygEditor = (attrs: StorefrontBlockNodeAttrs) => {
      dom.className =
        'storefront-block storefront-block--protected storefront-block--editing text-sm leading-relaxed';

      const editorHost = document.createElement('div');
      editorHost.className =
        'storefront-block__wysiwyg px-0 py-0 text-sm leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline';

      dom.replaceChildren(editorHost);
      destroyMiniEditor();

      const boundValues = getBoundValues();
      miniEditor = new TipTapCoreEditor({
        element: editorHost,
        extensions: createBlockMiniEditorExtensions(true),
        content: normalizeStorefrontBlockHtml(
          templateHtmlForStorefrontEditorLive(attrs.template, boundValues),
        ),
        editable: true,
        onCreate: ({ editor: ed }) => {
          applyTrailingParagraphCleanup(ed);
          ed.commands.focus('end');
        },
        onUpdate: ({ editor: ed }) => {
          applyTrailingParagraphCleanup(ed);
          updateNodeAttr({
            template: templateFromStorefrontEditorHtml(ed.getHTML()),
          });
        },
      });

      detachMiniEditorBlur = attachMiniEditorBlurHandler(dom, exitMiniEditor);
    };

    const renderWysiwygEditor = (attrs: StorefrontBlockNodeAttrs) => {
      dom.className =
        'storefront-block storefront-block--override storefront-block--editing text-sm leading-relaxed';

      const editorHost = document.createElement('div');
      editorHost.className =
        'storefront-block__wysiwyg px-0 py-0 text-sm leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline';

      dom.replaceChildren(editorHost);
      destroyMiniEditor();

      const initialHtml = normalizeStorefrontBlockHtml(
        attrs.overrideContent?.trim() || attrs.template,
      );
      if (initialHtml !== (attrs.overrideContent?.trim() || attrs.template)) {
        updateNodeAttr({ overrideContent: initialHtml });
      }
      miniEditor = new TipTapCoreEditor({
        element: editorHost,
        extensions: createBlockMiniEditorExtensions(),
        content: initialHtml,
        editable: true,
        onCreate: ({ editor: ed }) => {
          applyTrailingParagraphCleanup(ed);
          ed.commands.focus('end');
        },
        onUpdate: ({ editor: ed }) => {
          applyTrailingParagraphCleanup(ed);
          updateNodeAttr({
            overrideContent: normalizeStorefrontBlockHtml(ed.getHTML()),
          });
        },
      });

      detachMiniEditorBlur = attachMiniEditorBlurHandler(dom, exitMiniEditor);
    };

    const renderPreview = (attrs: StorefrontBlockNodeAttrs) => {
      const boundValues = getBoundValues();
      const templateBound = isStorefrontTemplateBoundBlock(attrs.resolver);
      const canEditTemplate = templateBound && editor.isEditable;
      const canEditOverride = !templateBound && editor.isEditable;

      dom.className = `storefront-block text-sm leading-relaxed ${
        templateBound ? 'storefront-block--protected' : 'storefront-block--overridable'
      }`;

      const preview = document.createElement('div');
      preview.className = 'storefront-block__preview';
      const previewHtml = resolveStorefrontBlockPreviewHtml(attrs, boundValues);
      preview.innerHTML = normalizeStorefrontBlockHtml(
        previewHtml ||
          (templateBound
            ? `<p class="text-default-400 italic">${getStorefrontBoundBlockEmptyMessage(attrs.resolver)}</p>`
            : `<p class="text-default-400 italic">${attrs.template || 'Порожній блок'}</p>`),
      );

      if (canEditTemplate) {
        preview.classList.add('storefront-block__preview--editable');
        preview.addEventListener('mousedown', (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          templateEdit = true;
          render();
        });
      } else if (canEditOverride) {
        preview.classList.add('storefront-block__preview--editable');
        preview.addEventListener('mousedown', (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          if (attrs.overrideContent == null) {
            updateNodeAttr({ overrideContent: attrs.template });
          }
          overrideEdit = true;
          render();
        });
      }

      dom.replaceChildren(preview);
    };

    const render = () => {
      const attrs = currentNode.attrs as StorefrontBlockNodeAttrs;
      const templateBound = isStorefrontTemplateBoundBlock(attrs.resolver);

      if (templateBound && templateEdit) {
        renderTemplateWysiwygEditor(attrs);
        return;
      }
      if (!templateBound && overrideEdit) {
        renderWysiwygEditor(attrs);
        return;
      }
      renderPreview(attrs);
    };

    render();

    return {
      dom,
      update(updatedNode) {
        if (updatedNode.type.name !== 'storefrontBlock') return false;
        currentNode = updatedNode;

        const revision = getOptions().getBoundRevision();
        if (templateEdit && miniEditor && revision !== lastBoundRevision) {
          lastBoundRevision = revision;
          refreshLivePlaceholdersInEditor(miniEditor, getBoundValues());
        }

        if (!templateEdit && !overrideEdit) {
          render();
        }
        return true;
      },
      destroy() {
        destroyMiniEditor();
      },
      stopEvent(event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return false;
        if (!dom.contains(target)) return false;
        if (target.closest('.storefront-block__preview')) return false;
        return target.closest('.ProseMirror') !== null;
      },
      ignoreMutation(mutation) {
        const target = mutation.target;
        return target instanceof globalThis.Node && dom.contains(target);
      },
    };
  };
}

const StorefrontBlockExtension = Node.create<StorefrontBlockExtensionOptions>({
  name: 'storefrontBlock',
  group: 'block',
  atom: true,
  selectable: false,
  addOptions() {
    return {
      getBoundValues: () => ({} as StorefrontBoundBlockValues),
      getBoundRevision: () => 0,
    };
  },
  addAttributes() {
    return {
      blockId: { default: '' },
      resolver: { default: 'template' },
      template: { default: '' },
      overrideContent: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-storefront-block]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-storefront-block': '' })];
  },
  addNodeView() {
    return createStorefrontBlockNodeView(() => this.options);
  },
});

const MarketingParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      class: {
        default: null,
        parseHTML: (element) => element.getAttribute('class'),
        renderHTML: (attributes) =>
          attributes.class ? { class: attributes.class } : {},
      },
    };
  },
});

export function StorefrontDescriptionEditor({
  value,
  boundValues,
  onChange,
  isDisabled,
  minHeightClass = 'min-h-[160px]',
}: StorefrontDescriptionEditorProps) {
  const [showSource, setShowSource] = useState(false);
  const [sourceText, setSourceText] = useState('');
  const [, setToolbarTick] = useState(0);
  const skipUpdateRef = useRef(true);
  const boundValuesRef = useRef(boundValues);
  const boundRevisionRef = useRef(0);
  boundValuesRef.current = boundValues;

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        paragraph: false,
        trailingNode: STOREFRONT_TRAILING_NODE_OPTIONS,
        link: {
          openOnClick: false,
          HTMLAttributes: { class: 'text-primary underline' },
        },
      }),
      MarketingParagraph,
      StorefrontAtomBackspaceGuard,
      RemoveTrailingEmptyParagraph,
      StorefrontBlockExtension.configure({
        getBoundValues: () => boundValuesRef.current,
        getBoundRevision: () => boundRevisionRef.current,
      }),
    ],
    [],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: { type: 'doc', content: [] },
    editable: !isDisabled,
    onUpdate: ({ editor: ed, transaction }) => {
      if (skipUpdateRef.current) return;
      if (transaction.getMeta(BOUND_REFRESH_META)) return;
      const json = normalizeStorefrontDescriptionDoc(ed.getJSON() as StorefrontDescriptionDoc);
      onChange(stringifyStorefrontDescriptionDoc(json));
    },
    onSelectionUpdate: () => setToolbarTick((t) => t + 1),
    onTransaction: ({ transaction }) => {
      if (transaction.docChanged) setToolbarTick((t) => t + 1);
    },
    editorProps: {
      attributes: {
        class: `${minHeightClass} bg-white px-3 py-2 focus:outline-none text-sm leading-relaxed storefront-description-editor [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline`,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;

    boundRevisionRef.current += 1;

    const ext = editor.extensionManager.extensions.find((e) => e.name === 'storefrontBlock');
    if (ext) {
      const opts = ext.options as StorefrontBlockExtensionOptions;
      opts.getBoundValues = () => boundValuesRef.current;
      opts.getBoundRevision = () => boundRevisionRef.current;
    }

    const frame = window.requestAnimationFrame(() => {
      if (editor.isDestroyed) return;
      skipUpdateRef.current = true;

      const { state } = editor;
      const blockNodes: Array<{ pos: number; node: ProseMirrorNode }> = [];
      state.doc.descendants((node, pos) => {
        if (node.type.name === 'storefrontBlock') blockNodes.push({ pos, node });
      });

      if (blockNodes.length === 0) {
        skipUpdateRef.current = false;
        return;
      }

      let tr = state.tr;
      for (let i = blockNodes.length - 1; i >= 0; i -= 1) {
        const { pos, node } = blockNodes[i];
        tr = tr.replaceWith(pos, pos + node.nodeSize, node.type.create(node.attrs));
      }

      tr = tr.setMeta('addToHistory', false).setMeta(BOUND_REFRESH_META, true);
      editor.view.dispatch(tr);
      skipUpdateRef.current = false;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [editor, boundValues]);

  useEffect(() => {
    if (!editor) return;
    skipUpdateRef.current = true;
    if (showSource) {
      setSourceText(value || '');
      skipUpdateRef.current = false;
      return;
    }
    const parsed = parseStorefrontDescriptionDoc(value);
    const current = editor.getJSON();
    const nextJson = normalizeStorefrontDescriptionDoc(parsed || { type: 'doc', content: [] });
    const normalizedChanged =
      parsed != null && JSON.stringify(parsed) !== JSON.stringify(nextJson);
    if (JSON.stringify(current) !== JSON.stringify(nextJson)) {
      if (normalizedChanged) skipUpdateRef.current = false;
      editor.commands.setContent(nextJson, { emitUpdate: normalizedChanged });
    }
    requestAnimationFrame(() => {
      applyTrailingParagraphCleanup(editor);
      if (normalizedChanged) {
        const cleaned = normalizeStorefrontDescriptionDoc(editor.getJSON() as StorefrontDescriptionDoc);
        onChange(stringifyStorefrontDescriptionDoc(cleaned));
      }
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
      setSourceText(value || '');
      setShowSource(true);
      return;
    }
    editor.commands.setContent(JSON.parse(sourceText || '{"type":"doc","content":[]}'), {
      emitUpdate: true,
    });
    setShowSource(false);
  };

  const fmtDisabled = isDisabled || !editor || showSource;
  const floatingHint = useStorefrontEditorFloatingHints(editor, !isDisabled && !showSource);

  return (
    <div className="relative flex flex-col gap-1.5">
      <div
        className={`overflow-hidden rounded-medium border border-default-200 bg-default-100 ${
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
            isDisabled={fmtDisabled}
            onPress={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <DynamicIcon name="list" size={14} />
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant={editor?.isActive('orderedList') ? 'flat' : 'light'}
            isDisabled={fmtDisabled}
            onPress={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <DynamicIcon name="list-ordered" size={14} />
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant={editor?.isActive('link') ? 'flat' : 'light'}
            isDisabled={fmtDisabled}
            onPress={setLink}
          >
            <DynamicIcon name="link" size={14} />
          </Button>
          <Divider orientation="vertical" className="mx-1 h-5" />
          <Button
            isIconOnly
            size="sm"
            variant={showSource ? 'flat' : 'light'}
            color={showSource ? 'primary' : 'default'}
            aria-label={showSource ? 'Візуальний редактор' : 'JSON source'}
            isDisabled={isDisabled || !editor}
            onPress={toggleSource}
          >
            <DynamicIcon name="code-xml" size={14} />
          </Button>
        </div>

        {showSource ? (
          <Textarea
            aria-label="Storefront doc JSON"
            minRows={8}
            value={sourceText}
            isDisabled={isDisabled}
            onValueChange={(next) => {
              setSourceText(next);
              onChange(next);
            }}
            classNames={{
              base: 'bg-white',
              inputWrapper: 'shadow-none border-0 rounded-none px-0 bg-white!',
              input: `${minHeightClass} px-3 py-2 font-mono text-xs leading-relaxed bg-white!`,
            }}
          />
        ) : (
          <EditorContent
            editor={editor}
            className="bg-default-50 [&_.tiptap]:bg-default-50 [&_.ProseMirror]:bg-default-50"
          />
        )}
      </div>

      {floatingHint ? (
        <Tooltip
          isOpen
          placement="top"
          delay={0}
          closeDelay={0}
          content={floatingHint.text}
          size="sm"
          classNames={{
            content: 'max-w-sm text-center leading-snug bg-default-700 text-default-50 px-3 py-2 rounded-medium',
            arrow: 'bg-default-800',
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none fixed z-[9999] h-px w-px"
            style={{ left: floatingHint.x, top: floatingHint.y }}
          />
        </Tooltip>
      ) : null}
    </div>
  );
}
