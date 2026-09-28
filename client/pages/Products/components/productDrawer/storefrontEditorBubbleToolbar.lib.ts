import type { Placement } from '@floating-ui/dom';
import type { Editor } from '@tiptap/core';
import { BubbleMenuPlugin } from '@tiptap/extension-bubble-menu';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { PluginKey } from '@tiptap/pm/state';
import {
  clearStorefrontEditorFormatting,
  EDITOR_HEADING_LEVELS,
} from '@/components/editor/editorFormatting';

export { clearStorefrontEditorFormatting } from '@/components/editor/editorFormatting';

export const STOREFRONT_BUBBLE_TOOLBAR_SELECTOR = '.storefront-editor-bubble-toolbar';

export const STOREFRONT_EDITOR_SCROLL_SELECTOR = '[data-storefront-editor-scroll]';

export const STOREFRONT_EDITOR_SHELL_SELECTOR = '[data-storefront-editor-shell]';

const storefrontBubbleToolbarRegistry = new Map<
  Editor,
  { element: HTMLElement; pluginKey: PluginKey }
>();

/** Keep a single Bubble Menu visible across main editor and bound-block mini editors. */
export function closeAllStorefrontBubbleToolbars(exceptEditor?: Editor | null): void {
  for (const [editor, { element }] of storefrontBubbleToolbarRegistry) {
    if (exceptEditor && editor === exceptEditor) continue;
    element.style.display = 'none';
  }
}

const BUBBLE_TOOLBAR_BASE_CLASS =
  'storefront-editor-bubble-toolbar flex items-center gap-0.5 rounded-medium border border-default-200 bg-default-100 px-1 py-0.5 shadow-md !z-[10050]';

const BUBBLE_BUTTON_CLASS =
  'inline-flex h-7 min-w-0 items-center justify-center rounded-small px-1.5 text-xs text-default-700 hover:bg-default-200/70';

const BUBBLE_ICON_BUTTON_CLASS = `${BUBBLE_BUTTON_CLASS} w-7 px-0`;

const BUBBLE_BUTTON_ACTIVE_CLASSES = ['bg-default-200', 'text-default-900'] as const;

const LINK_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

const CLEAR_FORMAT_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7V4h16v3"/><path d="M5 20h6"/><path d="M13 4 8 20"/><path d="m15 15 5 5"/><path d="m20 15-5 5"/></svg>';

function createBubbleDivider(): HTMLSpanElement {
  const divider = document.createElement('span');
  divider.className = 'mx-0.5 h-5 w-px shrink-0 bg-default-200';
  divider.setAttribute('aria-hidden', 'true');
  return divider;
}

export function promptStorefrontEditorLink(editor: Editor): void {
  const prev = editor.getAttributes('link').href as string | undefined;
  const url = window.prompt('URL посилання', prev || 'https://');
  if (url === null) return;
  if (url === '') {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
}

function selectionIncludesFirstContentLine(doc: ProseMirrorNode, from: number, to: number): boolean {
  if (doc.childCount === 0) return false;
  const firstBlock = doc.firstChild;
  if (!firstBlock) return false;
  const firstBlockStart = 1;
  const firstBlockEnd = firstBlockStart + firstBlock.nodeSize - 1;
  return from <= firstBlockEnd && to >= firstBlockStart;
}

function resolveBubbleToolbarPlacement(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): Placement {
  return selectionIncludesFirstContentLine(doc, from, to) ? 'bottom' : 'top';
}

function shouldShowStorefrontBubbleToolbar({
  editor,
  element,
  from,
  to,
}: {
  editor: Editor;
  element: HTMLElement;
  from: number;
  to: number;
}): boolean {
  if (!editor.isEditable || from === to) {
    element.style.display = 'none';
    return false;
  }
  const isChildOfMenu = element.contains(document.activeElement);
  if (!editor.view.hasFocus() && !isChildOfMenu) {
    element.style.display = 'none';
    return false;
  }
  closeAllStorefrontBubbleToolbars(editor);
  element.style.display = '';
  return true;
}

function setBubbleButtonActive(button: HTMLButtonElement, active: boolean) {
  for (const className of BUBBLE_BUTTON_ACTIVE_CLASSES) {
    button.classList.toggle(className, active);
  }
}

function syncBubbleToolbarState(toolbar: HTMLElement, editor: Editor) {
  const paragraphButton = toolbar.querySelector<HTMLButtonElement>('[data-block="paragraph"]');
  if (paragraphButton) {
    setBubbleButtonActive(
      paragraphButton,
      editor.isActive('paragraph') && !editor.isActive('heading'),
    );
  }

  toolbar.querySelectorAll<HTMLButtonElement>('[data-heading-level]').forEach((button) => {
    const level = Number(button.dataset.headingLevel);
    setBubbleButtonActive(button, editor.isActive('heading', { level }));
  });

  for (const mark of ['bold', 'italic', 'strike', 'link'] as const) {
    const button = toolbar.querySelector<HTMLButtonElement>(`[data-mark="${mark}"]`);
    if (button) setBubbleButtonActive(button, editor.isActive(mark));
  }
}

function createBubbleButton(
  label: string,
  options: {
    className?: string;
    ariaLabel?: string;
    title?: string;
    dataset?: Record<string, string>;
    onPress: () => void;
  },
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = options.className ?? BUBBLE_BUTTON_CLASS;
  button.textContent = label;
  if (options.ariaLabel) button.setAttribute('aria-label', options.ariaLabel);
  if (options.title ?? options.ariaLabel) {
    button.title = options.title ?? options.ariaLabel ?? '';
  }
  if (options.dataset) {
    for (const [key, value] of Object.entries(options.dataset)) {
      button.dataset[key] = value;
    }
  }
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onPress();
  });
  return button;
}

function createBubbleToolbarElement(editor: Editor): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = BUBBLE_TOOLBAR_BASE_CLASS;
  toolbar.style.zIndex = '10050';

  toolbar.appendChild(
    createBubbleButton('P', {
      className: BUBBLE_ICON_BUTTON_CLASS,
      ariaLabel: 'Параграф',
      dataset: { block: 'paragraph' },
      onPress: () => editor.chain().focus().setParagraph().run(),
    }),
  );

  for (const level of EDITOR_HEADING_LEVELS) {
    toolbar.appendChild(
      createBubbleButton(`H${level}`, {
        className: `${BUBBLE_BUTTON_CLASS} font-semibold`,
        ariaLabel: `Заголовок ${level}`,
        dataset: { headingLevel: String(level) },
        onPress: () => editor.chain().focus().setHeading({ level }).run(),
      }),
    );
  }

  toolbar.appendChild(createBubbleDivider());

  toolbar.appendChild(
    createBubbleButton('B', {
      className: `${BUBBLE_ICON_BUTTON_CLASS} font-bold`,
      ariaLabel: 'Жирний',
      dataset: { mark: 'bold' },
      onPress: () => editor.chain().focus().toggleBold().run(),
    }),
  );
  toolbar.appendChild(
    createBubbleButton('I', {
      className: `${BUBBLE_ICON_BUTTON_CLASS} italic`,
      ariaLabel: 'Курсив',
      dataset: { mark: 'italic' },
      onPress: () => editor.chain().focus().toggleItalic().run(),
    }),
  );
  toolbar.appendChild(
    createBubbleButton('S', {
      className: `${BUBBLE_ICON_BUTTON_CLASS} line-through`,
      ariaLabel: 'Закреслений',
      dataset: { mark: 'strike' },
      onPress: () => editor.chain().focus().toggleStrike().run(),
    }),
  );

  const linkButton = createBubbleButton('', {
    className: BUBBLE_ICON_BUTTON_CLASS,
    ariaLabel: 'Посилання',
    dataset: { mark: 'link' },
    onPress: () => promptStorefrontEditorLink(editor),
  });
  linkButton.innerHTML = LINK_ICON_SVG;
  toolbar.appendChild(linkButton);

  toolbar.appendChild(createBubbleDivider());

  const clearFormatButton = createBubbleButton('', {
    className: BUBBLE_ICON_BUTTON_CLASS,
    ariaLabel: 'Очистити форматування',
    onPress: () => clearStorefrontEditorFormatting(editor),
  });
  clearFormatButton.innerHTML = CLEAR_FORMAT_ICON_SVG;
  toolbar.appendChild(clearFormatButton);

  return toolbar;
}

type AttachStorefrontEditorBubbleToolbarOptions = {
  scrollTarget?: HTMLElement | Window | null;
  appendTo?: HTMLElement | null;
};

function resolveBubbleToolbarHost(
  editor: Editor,
  options: AttachStorefrontEditorBubbleToolbarOptions,
): HTMLElement {
  return (
    options.appendTo ??
    (options.scrollTarget instanceof HTMLElement ? options.scrollTarget : null) ??
    editor.view.dom.parentElement ??
    editor.view.dom
  );
}

export function attachStorefrontEditorBubbleToolbar(
  editor: Editor,
  options: AttachStorefrontEditorBubbleToolbarOptions = {},
): () => void {
  const element = createBubbleToolbarElement(editor);
  const pluginKey = new PluginKey(`storefrontBubbleMenu-${Math.random().toString(36).slice(2)}`);

  const host = () => resolveBubbleToolbarHost(editor, options);
  const scrollTarget =
    options.scrollTarget instanceof HTMLElement
      ? options.scrollTarget
      : options.scrollTarget ?? host();

  const bubbleFallbackPlacements: Placement[] = ['bottom', 'top'];
  let bubblePlacement: Placement = 'top';
  const bubbleFloatingOptions = {
    placement: bubblePlacement,
    offset: 8,
    flip: { fallbackPlacements: bubbleFallbackPlacements },
    scrollTarget,
  };

  const plugin = BubbleMenuPlugin({
    editor,
    element,
    pluginKey,
    appendTo: host,
    updateDelay: 0,
    shouldShow: shouldShowStorefrontBubbleToolbar,
    options: bubbleFloatingOptions,
  });

  editor.registerPlugin(plugin);
  storefrontBubbleToolbarRegistry.set(editor, { element, pluginKey });

  const hideBubble = () => {
    element.style.display = 'none';
  };

  const handleSelectionUpdate = () => {
    if (!editor.view.hasFocus()) {
      hideBubble();
      return;
    }
    closeAllStorefrontBubbleToolbars(editor);
  };

  const handleBlur = () => {
    hideBubble();
  };

  const handlePointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (isStorefrontBubbleToolbarTarget(target)) return;

    let clickedEditor: Editor | null = null;
    for (const [registeredEditor] of storefrontBubbleToolbarRegistry) {
      if (registeredEditor.view.dom.contains(target)) {
        clickedEditor = registeredEditor;
        break;
      }
    }

    if (clickedEditor) {
      closeAllStorefrontBubbleToolbars(clickedEditor);
      return;
    }

    closeAllStorefrontBubbleToolbars();
  };

  editor.on('selectionUpdate', handleSelectionUpdate);
  editor.on('blur', handleBlur);
  document.addEventListener('pointerdown', handlePointerDown, true);

  const syncPlacement = () => {
    const { from, to } = editor.state.selection;
    const placement = resolveBubbleToolbarPlacement(editor.state.doc, from, to);
    if (placement === bubblePlacement) return;
    bubblePlacement = placement;
    editor.view.dispatch(
      editor.state.tr.setMeta(pluginKey, {
        type: 'updateOptions',
        options: {
          options: {
            ...bubbleFloatingOptions,
            placement: bubblePlacement,
          },
        },
      }),
    );
  };

  const syncState = () => {
    syncBubbleToolbarState(element, editor);
    syncPlacement();
  };
  editor.on('selectionUpdate', syncState);
  editor.on('transaction', syncState);
  syncState();

  return () => {
    editor.off('selectionUpdate', syncState);
    editor.off('transaction', syncState);
    editor.off('selectionUpdate', handleSelectionUpdate);
    editor.off('blur', handleBlur);
    document.removeEventListener('pointerdown', handlePointerDown, true);
    editor.unregisterPlugin(pluginKey);
    storefrontBubbleToolbarRegistry.delete(editor);
    element.remove();
  };
}

export function isStorefrontBubbleToolbarTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(STOREFRONT_BUBBLE_TOOLBAR_SELECTOR) != null;
}
