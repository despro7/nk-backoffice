import type { LabelPdfmeTemplate } from '@shared/types/labelTemplate';

/** Залишити content/type з target, геометрію (position/size/rotate) — з source. */
export function mergeLabelTemplateGeometry(
  source: LabelPdfmeTemplate,
  target: LabelPdfmeTemplate,
): LabelPdfmeTemplate {
  const geomByName = new Map<
    string,
    { position: { x: number; y: number }; width: number; height: number; rotate?: number }
  >();

  for (const page of source.schemas) {
    for (const field of page) {
      const name = String(field.name ?? '');
      if (!name) continue;
      geomByName.set(name, {
        position: field.position,
        width: field.width,
        height: field.height,
        rotate: field.rotate,
      });
    }
  }

  return {
    ...target,
    schemas: (target.schemas ?? []).map((page) =>
      page.map((field) => {
        const name = String(field.name ?? '');
        const geom = geomByName.get(name);
        if (!geom) return field;
        return {
          ...field,
          position: geom.position,
          width: geom.width,
          height: geom.height,
          rotate: geom.rotate,
        };
      }),
    ),
  };
}
