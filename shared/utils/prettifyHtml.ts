/** Просте форматування HTML для превʼю (без зовнішніх залежностей). */

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const INLINE_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'cite',
  'code',
  'data',
  'dfn',
  'em',
  'i',
  'kbd',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
]);

/** Блоки з коротким текстовим вмістом — в один рядок. */
const COMPACT_BLOCK_TAGS = new Set([
  'caption',
  'dd',
  'dt',
  'figcaption',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'label',
  'li',
  'p',
  'td',
  'th',
]);

/** Контейнери, дочірні елементи яких виводяться з відступом. */
const EXPAND_CONTAINER_TAGS = new Set([
  'article',
  'blockquote',
  'div',
  'ol',
  'section',
  'table',
  'tbody',
  'tfoot',
  'thead',
  'tr',
  'ul',
]);

type HtmlElement = {
  tag: string;
  attrs: string;
  children: HtmlNode[];
  void: boolean;
};

type HtmlNode = string | HtmlElement;

function isTextOnlyChildren(children: HtmlNode[]): boolean {
  return children.every((child) => typeof child === 'string');
}

function hasOnlyInlineChildren(element: HtmlElement): boolean {
  return element.children.every((child) => {
    if (typeof child === 'string') return true;
    const tag = child.tag.toLowerCase();
    return (INLINE_TAGS.has(tag) || VOID_TAGS.has(tag)) && hasOnlyInlineChildren(child);
  });
}

function serializeInner(children: HtmlNode[]): string {
  return children
    .map((child) => (typeof child === 'string' ? child : serializeInline(child)))
    .join('');
}

function serializeInline(element: HtmlElement): string {
  const open = `<${element.tag}${element.attrs}>`;
  if (element.void) return open;
  return `${open}${serializeInner(element.children)}</${element.tag}>`;
}

function formatElement(element: HtmlElement, indent: number): string {
  const pad = '  '.repeat(indent);
  const tag = element.tag.toLowerCase();
  const open = `<${element.tag}${element.attrs}>`;
  const close = `</${element.tag}>`;

  if (element.void) return `${pad}${open}`;

  if (
    (COMPACT_BLOCK_TAGS.has(tag) || INLINE_TAGS.has(tag)) &&
    (isTextOnlyChildren(element.children) || hasOnlyInlineChildren(element))
  ) {
    const inner = serializeInner(element.children).trim();
    return `${pad}${open}${inner}${close}`;
  }

  if (EXPAND_CONTAINER_TAGS.has(tag)) {
    const lines = [`${pad}${open}`];
    for (const child of element.children) {
      if (typeof child === 'string') {
        const text = child.trim();
        if (text) lines.push(`${pad}  ${text}`);
        continue;
      }
      lines.push(formatElement(child, indent + 1));
    }
    lines.push(`${pad}${close}`);
    return lines.join('\n');
  }

  if (hasOnlyInlineChildren(element)) {
    const inner = serializeInner(element.children).trim();
    return `${pad}${open}${inner}${close}`;
  }

  const lines = [`${pad}${open}`];
  for (const child of element.children) {
    if (typeof child === 'string') {
      const text = child.trim();
      if (text) lines.push(`${pad}  ${text}`);
      continue;
    }
    lines.push(formatElement(child, indent + 1));
  }
  lines.push(`${pad}${close}`);
  return lines.join('\n');
}

function formatNodes(nodes: HtmlNode[], indent = 0): string {
  const lines: string[] = [];

  for (const node of nodes) {
    if (typeof node === 'string') {
      const text = node.trim();
      if (text) lines.push(`${'  '.repeat(indent)}${text}`);
      continue;
    }
    lines.push(formatElement(node, indent));
  }

  return lines.join('\n');
}

function parseHtml(html: string): HtmlNode[] {
  const nodes: HtmlNode[] = [];
  let index = 0;

  const pushText = (text: string) => {
    if (!text) return;
    nodes.push(text);
  };

  while (index < html.length) {
    const lt = html.indexOf('<', index);
    if (lt === -1) {
      pushText(html.slice(index));
      break;
    }

    if (lt > index) pushText(html.slice(index, lt));

    const tagEnd = html.indexOf('>', lt);
    if (tagEnd === -1) {
      pushText(html.slice(lt));
      break;
    }

    const rawTag = html.slice(lt + 1, tagEnd).trim();
    index = tagEnd + 1;

    if (!rawTag || rawTag.startsWith('!--')) {
      pushText(html.slice(lt, index));
      continue;
    }

    if (rawTag.startsWith('!') || rawTag.startsWith('?')) {
      pushText(html.slice(lt, index));
      continue;
    }

    const isClosing = rawTag.startsWith('/');
    const isSelfClosing = rawTag.endsWith('/');
    const tagBody = isClosing
      ? rawTag.slice(1)
      : isSelfClosing
        ? rawTag.slice(0, -1).trim()
        : rawTag;
    const tagMatch = /^([\w-]+)([\s\S]*)$/.exec(tagBody);
    if (!tagMatch) {
      pushText(html.slice(lt, index));
      continue;
    }

    const tagName = tagMatch[1];
    const attrs = tagMatch[2] ?? '';
    const lowerTag = tagName.toLowerCase();

    if (isClosing) {
      pushText(`</${tagName}>`);
      continue;
    }

    if (isSelfClosing || VOID_TAGS.has(lowerTag)) {
      nodes.push({
        tag: tagName,
        attrs,
        children: [],
        void: true,
      });
      continue;
    }

    const closeTag = `</${tagName}>`;
    const closeIndex = html.toLowerCase().indexOf(closeTag.toLowerCase(), index);
    if (closeIndex === -1) {
      nodes.push({
        tag: tagName,
        attrs,
        children: [],
        void: true,
      });
      continue;
    }

    const innerHtml = html.slice(index, closeIndex);
    nodes.push({
      tag: tagName,
      attrs,
      children: parseHtml(innerHtml),
      void: false,
    });
    index = closeIndex + closeTag.length;
  }

  return nodes;
}

/** Просте форматування HTML для превʼю (без зовнішніх залежностей). */
export function prettifyHtml(html: string): string {
  const normalized = html.replace(/>\s+</g, '><').trim();
  if (!normalized) return '';
  return formatNodes(parseHtml(normalized));
}
