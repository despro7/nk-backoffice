import type { Editor } from '@tiptap/core';
import { useEffect } from 'react';
import { attachStorefrontEditorBubbleToolbar } from './storefrontEditorBubbleToolbar.lib';

type StorefrontEditorBubbleToolbarProps = {
  editor: Editor;
  scrollTarget?: HTMLElement | null;
  appendTo?: HTMLElement | null;
};

export function StorefrontEditorBubbleToolbar({
  editor,
  scrollTarget,
  appendTo,
}: StorefrontEditorBubbleToolbarProps) {
  useEffect(() => {
    return attachStorefrontEditorBubbleToolbar(editor, { scrollTarget, appendTo });
  }, [editor, scrollTarget, appendTo]);

  return null;
}
