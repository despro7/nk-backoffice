import { describe, expect, it } from 'vitest';
import { PDFME_DESIGNER_MM_TO_PX } from '@shared/utils/schemaRotatedBounds';
import {
  readDesignerFieldGeometryFromElement,
  syncLabelTemplateFromDesignerDom,
} from './syncDesignerDomToTemplate';
import type { LabelPdfmeTemplate } from '@shared/types/labelTemplate';

describe('syncLabelTemplateFromDesignerDom', () => {
  it('reads geometry from wrapper div[title=name]', () => {
    const wrapper = {
      className: 'selectable',
      title: 'barcode',
      style: {
        left: `${10 * PDFME_DESIGNER_MM_TO_PX}px`,
        top: `${20 * PDFME_DESIGNER_MM_TO_PX}px`,
        width: `${30 * PDFME_DESIGNER_MM_TO_PX}px`,
        height: `${40 * PDFME_DESIGNER_MM_TO_PX}px`,
        transform: 'rotate(270deg)',
      },
    };
    const host = {
      querySelector: (sel: string) =>
        sel === 'div.selectable[title="barcode"]' ? wrapper : null,
    } as unknown as HTMLElement;

    const template: LabelPdfmeTemplate = {
      basePdf: { width: 100, height: 100, padding: [0, 0, 0, 0] },
      schemas: [
        [
          {
            name: 'barcode',
            type: 'ean13',
            position: { x: 0, y: 0 },
            width: 1,
            height: 1,
          },
        ],
      ],
    };

    const synced = syncLabelTemplateFromDesignerDom(host, template);
    const field = synced.schemas[0][0];
    expect(field.position).toEqual({ x: 10, y: 20 });
    expect(field.width).toBe(30);
    expect(field.height).toBe(40);
    expect(field.rotate).toBe(270);
  });

  it('adds translate() from transform to position', () => {
    const z = PDFME_DESIGNER_MM_TO_PX;
    const wrapper = {
      className: 'selectable',
      title: 'barcode',
      style: {
        left: `${10 * z}px`,
        top: `${20 * z}px`,
        width: `${30 * z}px`,
        height: `${40 * z}px`,
        transform: 'translate(3.78px, 7.56px) rotate(270deg)',
      },
    } as unknown as HTMLElement;

    const geom = readDesignerFieldGeometryFromElement(wrapper);
    expect(geom.x).toBe(11);
    expect(geom.y).toBe(22);
    expect(geom.rotate).toBe(270);
  });
});
