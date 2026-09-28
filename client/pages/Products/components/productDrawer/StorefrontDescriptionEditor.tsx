import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { StorefrontListItem } from './StorefrontListItem';
import {
  Button,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Select,
  SelectItem,
  Tooltip,
} from '@heroui/react';
import type { SharedSelection } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import {
  formatSourceCodeMirrorValue,
  HtmlCodeMirror,
} from '@/components/editor/HtmlCodeMirror';
import { EditorToolbarTooltip } from '@/components/editor/EditorToolbarTooltip';
import {
  EDITOR_HEADING_LEVELS,
  EDITOR_HEADING_OPTIONS,
  EDITOR_SOURCE_MIN_HEIGHT,
  resolveActiveEditorHeadingKey,
  toggleStorefrontBulletList,
  toggleStorefrontOrderedList,
  type EditorHeadingLevel,
} from '@/components/editor/editorFormatting';
import { StorefrontHtmlPreviewModal } from '@/components/storefront/StorefrontHtmlPreviewModal';
import { StorefrontEditorBubbleToolbar } from './StorefrontEditorBubbleToolbar';
import {
  STOREFRONT_EDITOR_SCROLL_SELECTOR,
  STOREFRONT_EDITOR_SHELL_SELECTOR,
  attachStorefrontEditorBubbleToolbar,
  clearStorefrontEditorFormatting,
  closeAllStorefrontBubbleToolbars,
  isStorefrontBubbleToolbarTarget,
  promptStorefrontEditorLink,
} from './storefrontEditorBubbleToolbar.lib';
import { attachStorefrontBlockLongPressDrag } from './storefrontBlockDrag.lib';
import type {
  StorefrontBlockConfig,
  StorefrontBlockNodeAttrs,
  StorefrontBoundBlockValues,
  StorefrontDescriptionDoc,
} from '@shared/types/storefront';
import {
  createStorefrontBlockNodeAttrsFromPreset,
  getStorefrontBoundBlockEmptyMessage,
  getStorefrontPickerPresetBlocks,
  isStorefrontBlockActiveInProduct,
  isStorefrontDrawerTemplateEditable,
  isStorefrontTemplateBoundBlock,
  normalizeStorefrontBlockHtml,
  normalizeStorefrontDescriptionDoc,
  parseStorefrontDescriptionDoc,
  resolveStorefrontBlockPreviewHtml,
  stringifyStorefrontDescriptionDoc,
  resolveStorefrontPlaceholderLiveDisplay,
  resolveStorefrontDescriptionDocHtml,
  templateFromStorefrontEditorHtml,
  templateHtmlForStorefrontEditorLive,
  walkStorefrontDescriptionBlocks,
  type StorefrontRenderOptions,
} from '@shared/utils/storefrontDescription';
import { prettifyHtml } from '@shared/utils/prettifyHtml';

interface StorefrontDescriptionEditorProps {
  value: string;
  boundValues: StorefrontBoundBlockValues;
  presetBlocks: StorefrontBlockConfig[];
  renderOptions?: StorefrontRenderOptions;
  onChange: (json: string) => void;
  isDisabled?: boolean;
  minHeightClass?: string;
  overlayZClassName?: string;
}

function findStorefrontBlockPos(editor: TipTapCoreEditor, blockId: string): number | null {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found != null) return false;
    if (node.type.name === 'storefrontBlock' && node.attrs.blockId === blockId) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

function applyStorefrontBlockFromPreset(
  editor: TipTapCoreEditor,
  block: StorefrontBlockConfig,
  enabledBlockIds?: ReadonlySet<string>,
): void {
  const manualInclude = Boolean(enabledBlockIds?.size && !enabledBlockIds.has(block.id));
  const attrs = createStorefrontBlockNodeAttrsFromPreset(block, { manualInclude });
  const existingPos = findStorefrontBlockPos(editor, block.id);

  if (existingPos != null) {
    const tr = editor.state.tr.setNodeMarkup(existingPos, undefined, {
      ...attrs,
      manualExclude: null,
    });
    editor.view.dispatch(tr);
    editor.commands.setNodeSelection(existingPos);
    const nodeDom = editor.view.nodeDOM(existingPos);
    if (nodeDom instanceof HTMLElement) {
      nodeDom.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    return;
  }

  editor.chain().focus().insertContent({ type: 'storefrontBlock', attrs }).run();
}

type StorefrontBlockDeleteRequest = {
  delete: () => void;
};

type StorefrontBlockExtensionOptions = {
  getBoundValues: () => StorefrontBoundBlockValues;
  getRenderOptions: () => StorefrontRenderOptions | undefined;
  getBoundRevision: () => number;
  getInteractiveRevision: () => number;
  getIsInteractive: () => boolean;
  requestDeleteBlock: (request: StorefrontBlockDeleteRequest) => void;
  setOpenSubEditor: (editor: TipTapCoreEditor | null) => void;
};

const BOUND_REFRESH_META = 'storefrontBoundRefresh';

const BOUND_BLOCK_CLICK_HINT =
  'Клікніть, щоб редагувати обрамлення блоку. Продуктові дані (склад, вага тощо) змінюються в окремих блоках форми, не тут.';
const OVERRIDE_BLOCK_CLICK_HINT =
  'Клікніть, щоб відкрити редагування тексту цього блоку';
const KIT_COMPONENTS_BLOCK_HINT =
  'Оформлення списку складників комплекту можна змінити, обравши інший Шаблон опису ↗';
const FROZEN_PLACEHOLDER_HINT =
  'Це значення береться з окремого блоку форми. Змініть його у «Склад», «Харчова цінність» тощо.';

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
        x: rect.left - 10,
        y: rect.top + rect.height / 2,
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

      const kitBlock = target.closest('.storefront-block--kit-components');
      if (kitBlock) {
        showHint(kitBlock, KIT_COMPONENTS_BLOCK_HINT);
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
        if (
          related.closest(
            '.storefront-ph-atom, .storefront-block__preview--editable, .storefront-block--kit-components',
          )
        ) {
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

/** Toolbar / shell chrome outside the block — not the main editor scroll area. */
function isStorefrontEditorShellChromeTarget(target: EventTarget | null, blockDom: HTMLElement): boolean {
  if (!(target instanceof Element)) return false;
  const shell = blockDom.closest(STOREFRONT_EDITOR_SHELL_SELECTOR);
  if (!shell?.contains(target) || blockDom.contains(target)) return false;
  const scroll = shell.querySelector(STOREFRONT_EDITOR_SCROLL_SELECTOR);
  if (scroll?.contains(target)) return false;
  return true;
}

function attachMiniEditorBlurHandler(dom: HTMLElement, onBlur: () => void): () => void {
  let ignoreNextBlur = false;

  const handlePointerDown = (event: PointerEvent) => {
    if (isStorefrontBubbleToolbarTarget(event.target)) {
      ignoreNextBlur = true;
      return;
    }
    if (isStorefrontEditorShellChromeTarget(event.target, dom)) {
      ignoreNextBlur = true;
    }
  };

  const handleFocusOut = () => {
    window.requestAnimationFrame(() => {
      if (ignoreNextBlur) {
        ignoreNextBlur = false;
        return;
      }
      const active = document.activeElement;
      if (dom.contains(active)) return;
      if (isStorefrontBubbleToolbarTarget(active)) return;
      if (isStorefrontEditorShellChromeTarget(active, dom)) return;
      onBlur();
    });
  };

  document.addEventListener('pointerdown', handlePointerDown, true);
  dom.addEventListener('focusout', handleFocusOut);
  return () => {
    document.removeEventListener('pointerdown', handlePointerDown, true);
    dom.removeEventListener('focusout', handleFocusOut);
  };
}

function refreshTemplateEditorPlaceholdersInDom(
  container: HTMLElement,
  boundValues: StorefrontBoundBlockValues,
) {
  container.querySelectorAll('[data-storefront-placeholder]').forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    const key = element.getAttribute('data-storefront-placeholder') || '';
    const nextLive = resolveStorefrontPlaceholderLiveDisplay(key, boundValues);
    const display = nextLive || 'немає даних';
    element.textContent = display;
    element.classList.toggle('storefront-ph-atom--empty', !nextLive);
  });
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

function resolveBlockPreviewInnerHtml(
  attrs: StorefrontBlockNodeAttrs,
  boundValues: StorefrontBoundBlockValues,
  renderOptions?: StorefrontRenderOptions,
): string {
  if (attrs.manualExclude || !isStorefrontBlockActiveInProduct(attrs, renderOptions)) return '';
  const previewHtml = resolveStorefrontBlockPreviewHtml(attrs, boundValues, [], renderOptions);
  const templateBound = isStorefrontTemplateBoundBlock(attrs.resolver);
  return normalizeStorefrontBlockHtml(
    previewHtml ||
      (templateBound
        ? `<p class="text-default-400 italic">${getStorefrontBoundBlockEmptyMessage(attrs.resolver)}</p>`
        : `<p class="text-default-400 italic">${attrs.template || 'Порожній блок'}</p>`),
  );
}

/** Оновлює preview bound-блоків без кліку (обхід кешу NodeView у TipTap). */
function refreshAllStorefrontBlockViews(
  editor: TipTapCoreEditor,
  boundValues: StorefrontBoundBlockValues,
  renderOptions?: StorefrontRenderOptions,
) {
  const { state } = editor;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'storefrontBlock') return;
    const attrs = node.attrs as StorefrontBlockNodeAttrs;
    const nodeDom = editor.view.nodeDOM(pos);
    if (!(nodeDom instanceof HTMLElement)) return;

    if (attrs.manualExclude || !isStorefrontBlockActiveInProduct(attrs, renderOptions)) {
      nodeDom.style.display = 'none';
      return;
    }
    nodeDom.style.display = '';

    if (nodeDom.classList.contains('storefront-block--editing')) {
      const wysiwyg = nodeDom.querySelector('.storefront-block__wysiwyg');
      if (wysiwyg instanceof HTMLElement) {
        refreshTemplateEditorPlaceholdersInDom(wysiwyg, boundValues);
      }
      return;
    }

    const preview = nodeDom.querySelector('.storefront-block__preview');
    if (!(preview instanceof HTMLElement)) return;
    const nextHtml = resolveBlockPreviewInnerHtml(attrs, boundValues, renderOptions);
    if (preview.innerHTML !== nextHtml) {
      preview.innerHTML = nextHtml;
    }
  });
}

const STOREFRONT_TRAILING_NODE_OPTIONS = {
  notAfter: ['storefrontBlock', 'orderedList', 'bulletList'],
};

function configureStorefrontStarterKit(options: { paragraph?: false } = {}) {
  return StarterKit.configure({
    heading: { levels: [...EDITOR_HEADING_LEVELS] },
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    paragraph: options.paragraph === false ? false : undefined,
    trailingNode: STOREFRONT_TRAILING_NODE_OPTIONS,
    listItem: false,
    link: {
      openOnClick: false,
      HTMLAttributes: { class: 'text-primary underline' },
    },
  });
}

function createBlockMiniEditorExtensions(protectPlaceholders = false) {
  const extensions = [configureStorefrontStarterKit(), StorefrontListItem];
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
    let detachMiniEditorBubble: (() => void) | null = null;
    let lastBoundRevision = getOptions().getBoundRevision();
    let lastInteractiveRevision = getOptions().getInteractiveRevision();
    let detachBlockDrag: (() => void) | null = null;

    const dom = document.createElement('div');
    dom.dataset.storefrontBlock = '';

    const getBoundValues = () => getOptions().getBoundValues();
    const getRenderOptions = () => getOptions().getRenderOptions();

    const destroyMiniEditor = () => {
      detachMiniEditorBlur?.();
      detachMiniEditorBlur = null;
      detachMiniEditorBubble?.();
      detachMiniEditorBubble = null;
      getOptions().setOpenSubEditor(null);
      miniEditor?.destroy();
      miniEditor = null;
    };

    const exitMiniEditor = () => {
      if (miniEditor) {
        const attrs = currentNode.attrs as StorefrontBlockNodeAttrs;
        const html = normalizeStorefrontBlockHtml(miniEditor.getHTML());
        if (templateEdit) {
          updateNodeAttr({ template: templateFromStorefrontEditorHtml(html) });
        } else if (overrideEdit) {
          updateNodeAttr({ overrideContent: html });
        }
      }
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

    const createBlockWysiwygHost = () => {
      const editorHost = document.createElement('div');
      editorHost.className =
        'storefront-block__wysiwyg px-0 py-0 text-sm leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline [&_li>p]:m-0 [&_li>p]:contents';
      return editorHost;
    };

    const renderTemplateWysiwygEditor = (attrs: StorefrontBlockNodeAttrs) => {
      dom.className =
        'storefront-block storefront-block--protected storefront-block--editing text-sm leading-relaxed';

      const editorHost = createBlockWysiwygHost();
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
          getOptions().setOpenSubEditor(ed);
          applyTrailingParagraphCleanup(ed);
          const bubbleShell = dom.closest(STOREFRONT_EDITOR_SHELL_SELECTOR);
          const bubbleScroll = dom.closest(STOREFRONT_EDITOR_SCROLL_SELECTOR);
          detachMiniEditorBubble = attachStorefrontEditorBubbleToolbar(ed, {
            scrollTarget: bubbleScroll instanceof HTMLElement ? bubbleScroll : window,
            appendTo: bubbleShell instanceof HTMLElement ? bubbleShell : null,
          });
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

      const editorHost = createBlockWysiwygHost();
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
          getOptions().setOpenSubEditor(ed);
          applyTrailingParagraphCleanup(ed);
          const bubbleShell = dom.closest(STOREFRONT_EDITOR_SHELL_SELECTOR);
          const bubbleScroll = dom.closest(STOREFRONT_EDITOR_SCROLL_SELECTOR);
          detachMiniEditorBubble = attachStorefrontEditorBubbleToolbar(ed, {
            scrollTarget: bubbleScroll instanceof HTMLElement ? bubbleScroll : window,
            appendTo: bubbleShell instanceof HTMLElement ? bubbleShell : null,
          });
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

    const deleteBlock = () => {
      const pos = posOrNull();
      if (pos == null) return;
      const attrs = currentNode.attrs as StorefrontBlockNodeAttrs;
      const enabledIds = getRenderOptions()?.enabledBlockIds;
      const keepExcludedInDoc = Boolean(enabledIds?.size && enabledIds.has(attrs.blockId));

      if (keepExcludedInDoc) {
        const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
          ...attrs,
          manualExclude: true,
        });
        editor.view.dispatch(tr);
        return;
      }

      const tr = editor.state.tr.delete(pos, pos + currentNode.nodeSize);
      editor.view.dispatch(tr);
    };

    const renderPreview = (attrs: StorefrontBlockNodeAttrs) => {
      const renderOptions = getRenderOptions();
      if (attrs.manualExclude || !isStorefrontBlockActiveInProduct(attrs, renderOptions)) {
        dom.style.display = 'none';
        dom.innerHTML = '';
        return;
      }
      dom.style.display = '';

      const boundValues = getBoundValues();
      const templateBound = isStorefrontTemplateBoundBlock(attrs.resolver);
      const interactive = getOptions().getIsInteractive();
      const canEditTemplate = isStorefrontDrawerTemplateEditable(attrs.resolver) && interactive;
      const canEditOverride = !templateBound && interactive;
      const isKitComponents = attrs.resolver === 'kitComponents';

      dom.className = `storefront-block text-sm leading-relaxed ${
        templateBound ? 'storefront-block--protected' : 'storefront-block--overridable'
      }${isKitComponents ? ' storefront-block--kit-components' : ''}`;

      const shell = document.createElement('div');
      shell.className = 'storefront-block__shell';

      const dragHandle = document.createElement('button');
      dragHandle.type = 'button';
      dragHandle.className = 'storefront-block__drag-handle';
      dragHandle.setAttribute('aria-label', 'Перетягніть для зміни порядку блоку');
      dragHandle.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>';

      const preview = document.createElement('div');
      preview.className = 'storefront-block__preview';
      preview.innerHTML = resolveBlockPreviewInnerHtml(attrs, boundValues, getRenderOptions());

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

      shell.appendChild(dragHandle);
      shell.appendChild(preview);

      detachBlockDrag?.();
      if (interactive) {
        detachBlockDrag = attachStorefrontBlockLongPressDrag({
          handle: dragHandle,
          shell: dom,
          editor,
          getPos: posOrNull,
          isEnabled: () => getOptions().getIsInteractive() && !templateEdit && !overrideEdit,
        });
      } else {
        detachBlockDrag = null;
      }

      if (interactive) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'storefront-block__delete';
        deleteBtn.setAttribute('aria-label', 'Видалити блок');
        deleteBtn.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
        deleteBtn.addEventListener('mousedown', (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        deleteBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          getOptions().requestDeleteBlock({ delete: deleteBlock });
        });
        shell.appendChild(deleteBtn);
      }

      dom.replaceChildren(shell);
    };

    const render = () => {
      const attrs = currentNode.attrs as StorefrontBlockNodeAttrs;
      const templateBound = isStorefrontTemplateBoundBlock(attrs.resolver);

      if (isStorefrontDrawerTemplateEditable(attrs.resolver) && templateEdit) {
        renderTemplateWysiwygEditor(attrs);
        return;
      }
      if (!templateBound && overrideEdit) {
        renderWysiwygEditor(attrs);
        return;
      }
      renderPreview(attrs);
    };

    const handleInteractiveChange = () => {
      const interactiveRevision = getOptions().getInteractiveRevision();
      if (interactiveRevision === lastInteractiveRevision) return;
      lastInteractiveRevision = interactiveRevision;
      if (!getOptions().getIsInteractive() && (templateEdit || overrideEdit)) {
        exitMiniEditor();
        return;
      }
      if (!templateEdit && !overrideEdit) {
        render();
      }
    };

    const handleMainEditorActive = () => {
      if (!templateEdit && !overrideEdit) return;
      if (miniEditor?.view.hasFocus()) return;
      if (!editor.view.hasFocus()) return;
      exitMiniEditor();
    };

    editor.on('transaction', handleInteractiveChange);
    editor.on('focus', handleMainEditorActive);
    editor.on('selectionUpdate', handleMainEditorActive);

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
        editor.off('transaction', handleInteractiveChange);
        editor.off('focus', handleMainEditorActive);
        editor.off('selectionUpdate', handleMainEditorActive);
        detachBlockDrag?.();
        detachBlockDrag = null;
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
      getRenderOptions: () => undefined,
      getBoundRevision: () => 0,
      getInteractiveRevision: () => 0,
      getIsInteractive: () => true,
      requestDeleteBlock: () => undefined,
      setOpenSubEditor: () => undefined,
    };
  },
  addAttributes() {
    return {
      blockId: { default: '' },
      resolver: { default: 'template' },
      template: { default: '' },
      overrideContent: { default: null },
      manualInclude: { default: null },
      manualExclude: { default: null },
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
  presetBlocks,
  renderOptions,
  onChange,
  isDisabled,
  minHeightClass = 'min-h-[160px]',
  overlayZClassName,
}: StorefrontDescriptionEditorProps) {
  const [showSource, setShowSource] = useState(false);
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const [sourceText, setSourceText] = useState('');
  const [deleteRequest, setDeleteRequest] = useState<StorefrontBlockDeleteRequest | null>(null);
  const [toolbarTick, setToolbarTick] = useState(0);
  const skipUpdateRef = useRef(true);
  const [editorShellEl, setEditorShellEl] = useState<HTMLDivElement | null>(null);
  const [editorScrollEl, setEditorScrollEl] = useState<HTMLDivElement | null>(null);
  const boundValuesRef = useRef(boundValues);
  const renderOptionsRef = useRef(renderOptions);
  const boundRevisionRef = useRef(0);
  const interactiveRevisionRef = useRef(0);
  const isDisabledRef = useRef(isDisabled);
  const showSourceRef = useRef(showSource);
  const requestDeleteBlockRef = useRef<(request: StorefrontBlockDeleteRequest) => void>(() => {});
  const openSubEditorRef = useRef<TipTapCoreEditor | null>(null);
  const detachSubEditorListenersRef = useRef<(() => void) | null>(null);
  const setOpenSubEditorRef = useRef<(editor: TipTapCoreEditor | null) => void>(() => {});
  boundValuesRef.current = boundValues;
  renderOptionsRef.current = renderOptions;
  isDisabledRef.current = isDisabled;
  showSourceRef.current = showSource;
  requestDeleteBlockRef.current = (request) => setDeleteRequest(request);

  const setOpenSubEditor = useCallback((subEditor: TipTapCoreEditor | null) => {
    detachSubEditorListenersRef.current?.();
    detachSubEditorListenersRef.current = null;
    openSubEditorRef.current = subEditor;
    closeAllStorefrontBubbleToolbars(subEditor);
    setToolbarTick((tick) => tick + 1);

    if (!subEditor) return;

    const bumpToolbar = () => setToolbarTick((tick) => tick + 1);
    subEditor.on('transaction', bumpToolbar);
    subEditor.on('selectionUpdate', bumpToolbar);
    detachSubEditorListenersRef.current = () => {
      subEditor.off('transaction', bumpToolbar);
      subEditor.off('selectionUpdate', bumpToolbar);
    };
  }, []);
  setOpenSubEditorRef.current = setOpenSubEditor;

  const extensions = useMemo(
    () => [
      configureStorefrontStarterKit({ paragraph: false }),
      StorefrontListItem,
      MarketingParagraph,
      StorefrontAtomBackspaceGuard,
      RemoveTrailingEmptyParagraph,
      StorefrontBlockExtension.configure({
        getBoundValues: () => boundValuesRef.current,
        getRenderOptions: () => renderOptionsRef.current,
        getBoundRevision: () => boundRevisionRef.current,
        getInteractiveRevision: () => interactiveRevisionRef.current,
        getIsInteractive: () => !isDisabledRef.current && !showSourceRef.current,
        requestDeleteBlock: (request) => requestDeleteBlockRef.current(request),
        setOpenSubEditor: (subEditor) => setOpenSubEditorRef.current(subEditor),
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
        class: `${minHeightClass} bg-white pe-3 py-2 focus:outline-none text-sm leading-relaxed storefront-description-editor [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-bold [&_h4]:text-base [&_h4]:font-bold [&_h5]:text-sm [&_h5]:font-bold [&_h6]:text-xs [&_h6]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline [&_li>p]:m-0 [&_li>p]:contents`,
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
      opts.getRenderOptions = () => renderOptionsRef.current;
      opts.getBoundRevision = () => boundRevisionRef.current;
      opts.getInteractiveRevision = () => interactiveRevisionRef.current;
      opts.getIsInteractive = () => !isDisabledRef.current && !showSourceRef.current;
      opts.requestDeleteBlock = (request) => requestDeleteBlockRef.current(request);
      opts.setOpenSubEditor = (subEditor) => setOpenSubEditorRef.current(subEditor);
    }

    const frame = window.requestAnimationFrame(() => {
      if (editor.isDestroyed) return;
      refreshAllStorefrontBlockViews(editor, boundValues, renderOptionsRef.current);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [editor, boundValues, renderOptions]);

  useEffect(() => {
    if (!editor) return;
    skipUpdateRef.current = true;
    if (showSource) {
      setSourceText(formatSourceCodeMirrorValue(value || '{"type":"doc","content":[]}', 'json'));
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
    interactiveRevisionRef.current += 1;

    const frame = window.requestAnimationFrame(() => {
      if (editor.isDestroyed) return;
      refreshAllStorefrontBlockViews(editor, boundValuesRef.current, renderOptionsRef.current);
      editor.view.dispatch(editor.state.tr.setMeta(BOUND_REFRESH_META, true));
    });

    return () => window.cancelAnimationFrame(frame);
  }, [editor, isDisabled, showSource]);

  const getFmtEditor = () => openSubEditorRef.current ?? editor;
  const fmtEditor = getFmtEditor();
  const activeHeadingKey = resolveActiveEditorHeadingKey(fmtEditor);
  const activeHeadingOption =
    EDITOR_HEADING_OPTIONS.find((option) => option.key === activeHeadingKey) ??
    EDITOR_HEADING_OPTIONS[0];

  const setHeadingFormat = (keys: SharedSelection) => {
    const activeEditor = getFmtEditor();
    if (!activeEditor || keys === 'all') return;
    const key = Array.from(keys)[0]?.toString() ?? 'paragraph';
    if (key === 'paragraph') {
      activeEditor.chain().focus().setParagraph().run();
      return;
    }
    const level = Number(key);
    if (!EDITOR_HEADING_LEVELS.includes(level as EditorHeadingLevel)) return;
    activeEditor.chain().focus().setHeading({ level: level as EditorHeadingLevel }).run();
  };

  const setLink = () => {
    const activeEditor = getFmtEditor();
    if (!activeEditor) return;
    promptStorefrontEditorLink(activeEditor);
  };

  const toggleSource = () => {
    if (!editor) return;
    if (!showSource) {
      setSourceText(formatSourceCodeMirrorValue(value || '{"type":"doc","content":[]}', 'json'));
      setShowSource(true);
      return;
    }
    editor.commands.setContent(JSON.parse(sourceText || '{"type":"doc","content":[]}'), {
      emitUpdate: true,
    });
    setOpenSubEditor(null);
    closeAllStorefrontBubbleToolbars();
    setShowSource(false);
  };

  const fmtDisabled = isDisabled || !fmtEditor || showSource;
  const floatingHint = useStorefrontEditorFloatingHints(editor, !isDisabled && !showSource);

  const wcPreviewHtml = useMemo(() => {
    const doc = parseStorefrontDescriptionDoc(value);
    if (!doc) return '';
    const raw = resolveStorefrontDescriptionDocHtml(doc, boundValues, [], renderOptions);
    return prettifyHtml(raw);
  }, [value, boundValues, renderOptions]);

  const pickerBlocks = useMemo(
    () => getStorefrontPickerPresetBlocks(presetBlocks, { isKit: renderOptions?.isKit }),
    [presetBlocks, renderOptions?.isKit],
  );

  const existingBlockIds = useMemo(() => {
    let doc: StorefrontDescriptionDoc | null = null;
    if (editor && !showSource && !editor.isDestroyed) {
      doc = normalizeStorefrontDescriptionDoc(editor.getJSON() as StorefrontDescriptionDoc);
    } else {
      doc = parseStorefrontDescriptionDoc(value);
    }
    if (!doc) return new Set<string>();
    return new Set(
      walkStorefrontDescriptionBlocks(doc)
        .filter((block) => !block.manualExclude)
        .map((block) => block.blockId),
    );
  }, [editor, value, showSource, renderOptions, toolbarTick]);

  const insertPresetBlock = useCallback(
    (blockId: string) => {
      if (!editor || fmtDisabled) return;
      const block = pickerBlocks.find((item) => item.id === blockId);
      if (!block) return;
      setOpenSubEditor(null);
      closeAllStorefrontBubbleToolbars();
      applyStorefrontBlockFromPreset(editor, block, renderOptions?.enabledBlockIds);
    },
    [editor, fmtDisabled, pickerBlocks, renderOptions?.enabledBlockIds, setOpenSubEditor],
  );

  return (
    <div className="relative flex flex-col gap-1.5">
      <div
        ref={setEditorShellEl}
        data-storefront-editor-shell
        className={`relative overflow-hidden rounded-medium border border-default-200 bg-default-100 ${
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
              isDisabled={fmtDisabled || !fmtEditor?.can().undo()}
              onPress={() => getFmtEditor()?.chain().focus().undo().run()}
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
              isDisabled={fmtDisabled || !fmtEditor?.can().redo()}
              onPress={() => getFmtEditor()?.chain().focus().redo().run()}
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
              variant={fmtEditor?.isActive('bold') ? 'flat' : 'light'}
              aria-label="Жирний"
              isDisabled={fmtDisabled}
              onPress={() => getFmtEditor()?.chain().focus().toggleBold().run()}
            >
              <DynamicIcon name="bold" size={14} />
            </Button>
          </EditorToolbarTooltip>
          <EditorToolbarTooltip content="Курсив">
            <Button
              isIconOnly
              size="sm"
              variant={fmtEditor?.isActive('italic') ? 'flat' : 'light'}
              aria-label="Курсив"
              isDisabled={fmtDisabled}
              onPress={() => getFmtEditor()?.chain().focus().toggleItalic().run()}
            >
              <DynamicIcon name="italic" size={14} />
            </Button>
          </EditorToolbarTooltip>
          <EditorToolbarTooltip content="Закреслений">
            <Button
              isIconOnly
              size="sm"
              variant={fmtEditor?.isActive('strike') ? 'flat' : 'light'}
              aria-label="Закреслений"
              isDisabled={fmtDisabled}
              onPress={() => getFmtEditor()?.chain().focus().toggleStrike().run()}
            >
              <DynamicIcon name="strikethrough" size={14} />
            </Button>
          </EditorToolbarTooltip>
          <EditorToolbarTooltip content="Маркований список">
            <Button
              isIconOnly
              size="sm"
              variant={fmtEditor?.isActive('bulletList') ? 'flat' : 'light'}
              aria-label="Маркований список"
              isDisabled={fmtDisabled}
              onPress={() => {
                const activeEditor = getFmtEditor();
                if (activeEditor) toggleStorefrontBulletList(activeEditor);
              }}
            >
              <DynamicIcon name="list" size={14} />
            </Button>
          </EditorToolbarTooltip>
          <EditorToolbarTooltip content="Нумерований список">
            <Button
              isIconOnly
              size="sm"
              variant={fmtEditor?.isActive('orderedList') ? 'flat' : 'light'}
              aria-label="Нумерований список"
              isDisabled={fmtDisabled}
              onPress={() => {
                const activeEditor = getFmtEditor();
                if (activeEditor) toggleStorefrontOrderedList(activeEditor);
              }}
            >
              <DynamicIcon name="list-ordered" size={14} />
            </Button>
          </EditorToolbarTooltip>
          <EditorToolbarTooltip content="Посилання">
            <Button
              isIconOnly
              size="sm"
              variant={fmtEditor?.isActive('link') ? 'flat' : 'light'}
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
              onPress={() => {
                const activeEditor = getFmtEditor();
                if (activeEditor) clearStorefrontEditorFormatting(activeEditor);
              }}
            >
              <DynamicIcon name="remove-formatting" size={14} />
            </Button>
          </EditorToolbarTooltip>
          {pickerBlocks.length > 0 ? (
            <>
              <Divider orientation="vertical" className="mx-1 h-5" />
              <Dropdown placement="bottom-start">
                <DropdownTrigger>
                  <Button
                    size="sm"
                    variant="light"
                    aria-label="Додати блок з шаблону"
                    isDisabled={fmtDisabled}
                    className="h-8 min-h-8 px-2 text-xs"
                    startContent={<DynamicIcon name="layout-template" size={14} />}
                  >
                    Блок
                  </Button>
                </DropdownTrigger>
                <DropdownMenu
                  aria-label="Блоки шаблону опису"
                  className="max-h-80 overflow-y-auto"
                  onAction={(key) => insertPresetBlock(String(key))}
                >
                  {pickerBlocks.map((block) => {
                    const inDoc = existingBlockIds.has(block.id);
                    const descriptionParts = [
                      inDoc ? 'Скинути до початкового шаблону' : 'Вставити в позицію курсора',
                      // !block.enabled ? 'Вимкнено в шаблоні' : null,
                    ].filter(Boolean);

                    return (
                      <DropdownItem
                        key={block.id}
                        textValue={block.label}
                        description={descriptionParts.join(' · ')}
                      >
                        <span className="flex items-center gap-2">
                          <span className="truncate">{block.label}</span>
                          {inDoc ? (
                            <span className="shrink-0 text-[9px] uppercase tracking-wide leading-none text-lime-600 border border-lime-600/40 rounded-full px-1 py-0.5">
                              додано
                            </span>
                          ) : null}
                        </span>
                      </DropdownItem>
                    );
                  })}
                </DropdownMenu>
              </Dropdown>
            </>
          ) : null}
          <Divider orientation="vertical" className="mx-1 h-5" />
          <EditorToolbarTooltip content={showSource ? 'Візуальний редактор' : 'JSON source'}>
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
          </EditorToolbarTooltip>
          <EditorToolbarTooltip content="HTML для WooCommerce">
            <Button
              isIconOnly
              size="sm"
              variant={showHtmlPreview ? 'flat' : 'light'}
              color={showHtmlPreview ? 'primary' : 'default'}
              aria-label="Переглянути HTML для WooCommerce"
              isDisabled={isDisabled}
              onPress={() => setShowHtmlPreview(true)}
            >
              <DynamicIcon name="file-code-2" size={14} />
            </Button>
          </EditorToolbarTooltip>
        </div>

        {showSource ? (
          <HtmlCodeMirror
            value={sourceText}
            language="json"
            variant="embedded"
            minHeight={EDITOR_SOURCE_MIN_HEIGHT}
            readOnly={isDisabled}
            onChange={(next) => {
              setSourceText(next);
              onChange(next);
            }}
          />
        ) : (
          <div
            ref={setEditorScrollEl}
            data-storefront-editor-scroll
            className="relative bg-default-50 max-h-[500px] overflow-y-auto [&_.tiptap]:bg-default-50 [&_.ProseMirror]:bg-default-50"
          >
            <EditorContent editor={editor} className="bg-default-50 [&_.tiptap]:bg-default-50 [&_.ProseMirror]:bg-default-50" />
            {editor && !fmtDisabled ? (
              <StorefrontEditorBubbleToolbar
                editor={editor}
                scrollTarget={editorScrollEl}
                appendTo={editorShellEl}
              />
            ) : null}
          </div>
        )}
      </div>

      {floatingHint ? (
        <Tooltip
          isOpen
          placement="left-start"
          delay={0}
          closeDelay={0}
          content={floatingHint.text}
          size="sm"
          crossOffset={-20}
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

      <ConfirmModal
        isOpen={deleteRequest != null}
        title="Видалити блок?"
        message="Видалити цей блок з опису?"
        confirmText="Видалити"
        confirmColor="danger"
        overlayZClassName={overlayZClassName}
        onConfirm={() => {
          deleteRequest?.delete();
          setDeleteRequest(null);
        }}
        onCancel={() => setDeleteRequest(null)}
      />

      <StorefrontHtmlPreviewModal
        isOpen={showHtmlPreview}
        html={wcPreviewHtml}
        overlayZClassName={overlayZClassName}
        onClose={() => setShowHtmlPreview(false)}
      />
    </div>
  );
}
