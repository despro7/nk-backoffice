import { ListItem } from '@tiptap/extension-list';

function mergeListItemInlineContent(element: HTMLElement): HTMLElement {
  const hasDirectParagraph = Array.from(element.children).some((child) => child.tagName === 'P');
  if (!hasDirectParagraph) return element;

  const merged = document.createElement('span');
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName === 'P') {
      const paragraph = child as Element;
      for (const inner of Array.from(paragraph.childNodes)) {
        merged.appendChild(inner.cloneNode(true));
      }
      continue;
    }
    merged.appendChild(child.cloneNode(true));
  }
  return merged;
}

/** List item without paragraph wrapper — serializes as <li>text</li>. */
export const StorefrontListItem = ListItem.extend({
  content: 'inline*',

  parseHTML() {
    return [
      {
        tag: 'li',
        contentElement: (element) => mergeListItemInlineContent(element),
      },
    ];
  },
});
