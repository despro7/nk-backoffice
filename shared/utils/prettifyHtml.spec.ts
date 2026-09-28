import { describe, expect, it } from 'vitest';
import { prettifyHtml } from './prettifyHtml.js';

describe('prettifyHtml', () => {
  it('formats text-only block tags on one line', () => {
    const input =
      '<p>Приготований з натуральних інгредієнтів.</p><p>Містить сіль.</p><h3>11 порцій перших страв:</h3>';
    expect(prettifyHtml(input)).toBe(
      '<p>Приготований з натуральних інгредієнтів.</p>\n<p>Містить сіль.</p>\n<h3>11 порцій перших страв:</h3>',
    );
  });

  it('keeps list container expanded with compact list items', () => {
    const input =
      '<ul><li>Борщ з квасолею – 1 порція 470 г</li><li>Борщ з курятиною – 1 порція 400 г</li></ul>';
    expect(prettifyHtml(input)).toBe(
      '<ul>\n  <li>Борщ з квасолею – 1 порція 470 г</li>\n  <li>Борщ з курятиною – 1 порція 400 г</li>\n</ul>',
    );
  });

  it('formats storefront-like description compactly', () => {
    const input =
      '<p>Перший абзац.</p><p>Другий абзац.</p><h3>11 порцій перших страв (по 400-490 г):</h3><ul><li>Борщ з квасолею – 1 порція 470 г</li><li>Борщ з курятиною – 1 порція 400 г</li><li>Борщ зі свининою – 1 порція 400 г</li></ul>';
    expect(prettifyHtml(input)).toBe(
      '<p>Перший абзац.</p>\n<p>Другий абзац.</p>\n<h3>11 порцій перших страв (по 400-490 г):</h3>\n<ul>\n  <li>Борщ з квасолею – 1 порція 470 г</li>\n  <li>Борщ з курятиною – 1 порція 400 г</li>\n  <li>Борщ зі свининою – 1 порція 400 г</li>\n</ul>',
    );
  });

  it('keeps inline markup inside compact blocks on one line', () => {
    const input = '<p><strong>Важливо:</strong> деталі.</p>';
    expect(prettifyHtml(input)).toBe('<p><strong>Важливо:</strong> деталі.</p>');
  });
});
