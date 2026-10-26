import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const NK_AABB_HELPER = `var nkGetSchemaAabbOffsets = (width, height, rotateDeg) => {
	const normRot = (rotateDeg % 360 + 360) % 360;
	let minOffsetX = 0;
	let maxOffsetX = width;
	let minOffsetY = 0;
	let maxOffsetY = height;
	if (normRot !== 0) {
		const rad = normRot * Math.PI / 180;
		const cos = Math.cos(rad);
		const sin = Math.sin(rad);
		const hw = width / 2;
		const hh = height / 2;
		const xs = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([dx, dy]) => hw + dx * cos - dy * sin);
		const ys = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([dx, dy]) => hh + dx * sin + dy * cos);
		minOffsetX = Math.min(...xs);
		maxOffsetX = Math.max(...xs);
		minOffsetY = Math.min(...ys);
		maxOffsetY = Math.max(...ys);
	}
	return { minOffsetX, maxOffsetX, minOffsetY, maxOffsetY };
};
`;

const OLD_TEMPLATE_TO_SCHEMAS_CLAMP = `\t\t\tconst xEdge = value.position.x + value.width;
\t\t\tconst yEdge = value.position.y + value.height;
\t\t\tif (xEdge > width) value.position.x = Math.max(0, width - value.width);
\t\t\tif (yEdge > height) value.position.y = Math.max(0, height - value.height);`;

const NEW_TEMPLATE_TO_SCHEMAS_CLAMP = `\t\t\tconst { minOffsetX, maxOffsetX, minOffsetY, maxOffsetY } = nkGetSchemaAabbOffsets(value.width, value.height, value.rotate ?? 0);
\t\t\tif (value.position.x + maxOffsetX > width) value.position.x = Math.max(-minOffsetX, width - maxOffsetX);
\t\t\tif (value.position.y + maxOffsetY > height) value.position.y = Math.max(-minOffsetY, height - maxOffsetY);`;

const OLD_HANDLE_POSITION = `var handlePositionSizeChange = (schema, key, value, basePdf, pageSize) => {
	const [pt, pr, pb, pl] = isBlankPdf(basePdf) ? basePdf.padding : [
		0,
		0,
		0,
		0
	];
	const { width: pw, height: ph } = pageSize;
	const calcBounds = (v, min, max) => Math.min(Math.max(Number(v), min), max);
	if (key === "position.x") schema.position.x = calcBounds(value, pl, pw - schema.width - pr);
	else if (key === "position.y") schema.position.y = calcBounds(value, pt, ph - schema.height - pb);
	else if (key === "width") schema.width = calcBounds(value, 0, pw - schema.position.x - pr);
	else if (key === "height") schema.height = calcBounds(value, 0, ph - schema.position.y - pb);
};`;

const NEW_HANDLE_POSITION = `${NK_AABB_HELPER}var handlePositionSizeChange = (schema, key, value, basePdf, pageSize) => {
	const [pt, pr, pb, pl] = isBlankPdf(basePdf) ? basePdf.padding : [
		0,
		0,
		0,
		0
	];
	const { width: pw, height: ph } = pageSize;
	const calcBounds = (v, min, max) => Math.min(Math.max(Number(v), min), max);
	const { minOffsetX, maxOffsetX, minOffsetY, maxOffsetY } = nkGetSchemaAabbOffsets(schema.width, schema.height, schema.rotate ?? 0);
	if (key === "position.x") schema.position.x = calcBounds(value, pl - minOffsetX, pw - pr - maxOffsetX);
	else if (key === "position.y") schema.position.y = calcBounds(value, pt - minOffsetY, ph - pb - maxOffsetY);
	else if (key === "width") {
		const rot = schema.rotate ?? 0;
		if (rot !== 0) schema.width = Math.max(0, Number(value));
		else schema.width = calcBounds(value, 0, pw - schema.position.x - pr);
	} else if (key === "height") {
		const rot = schema.rotate ?? 0;
		if (rot !== 0) schema.height = Math.max(0, Number(value));
		else schema.height = calcBounds(value, 0, ph - schema.position.y - pb);
	}
};`;

const OLD_APPLY_ASPECT = `var applyAspectRatio = (schema, changedKeys, pluginsRegistry, basePdf, pageSize) => {
	if (![...changedKeys].some((key) => ASPECT_RATIO_TRIGGER_KEYS.has(key))) return;`;

const NEW_APPLY_ASPECT = `var applyAspectRatio = (schema, changedKeys, pluginsRegistry, basePdf, pageSize) => {
	if ((schema.rotate ?? 0) !== 0) return;
	if (![...changedKeys].some((key) => ASPECT_RATIO_TRIGGER_KEYS.has(key))) return;`;

const OLD_VALIDATE_XY = `\t\tif (fieldName === "x") {
\t\t\tif (value < paddingLeft || value > pageSize.width - paddingRight) return true;
\t\t\tif (width > 0 && value + width > pageSize.width - paddingRight) return false;
\t\t} else if (fieldName === "y") {
\t\t\tif (value < paddingTop || value > pageSize.height - paddingBottom) return true;
\t\t\tif (height > 0 && value + height > pageSize.height - paddingBottom) return false;`;

const NEW_VALIDATE_XY = `\t\tif (fieldName === "x") {
\t\t\tconst { minOffsetX, maxOffsetX } = nkGetSchemaAabbOffsets(width, height, formValues.rotate ?? 0);
\t\t\tconst minX = paddingLeft - minOffsetX;
\t\t\tconst maxX = pageSize.width - paddingRight - maxOffsetX;
\t\t\tif (value < minX || value > maxX) return false;
\t\t} else if (fieldName === "y") {
\t\t\tconst { minOffsetY, maxOffsetY } = nkGetSchemaAabbOffsets(width, height, formValues.rotate ?? 0);
\t\t\tconst minY = paddingTop - minOffsetY;
\t\t\tconst maxY = pageSize.height - paddingBottom - maxOffsetY;
\t\t\tif (value < minY || value > maxY) return false;`;

const OLD_VALIDATE_WH = `\t\t} else if (fieldName === "width") {
\t\t\tif (position.x < paddingLeft || position.x > pageSize.width - paddingRight) return true;
\t\t\tif (value > 0 && position.x + value > pageSize.width - paddingRight) return false;
\t\t} else if (fieldName === "height") {
\t\t\tif (position.y < paddingTop || position.y > pageSize.height - paddingBottom) return true;
\t\t\tif (value > 0 && position.y + value > pageSize.height - paddingBottom) return false;
\t\t}
\t\treturn true;
\t};`;

const NEW_VALIDATE_WH = `\t\t} else if (fieldName === "width" || fieldName === "height") {
\t\t\tconst w = fieldName === "width" ? value : width;
\t\t\tconst h = fieldName === "height" ? value : height;
\t\t\tconst { minOffsetX, maxOffsetX, minOffsetY, maxOffsetY } = nkGetSchemaAabbOffsets(w, h, formValues.rotate ?? 0);
\t\t\tconst absMinX = position.x + minOffsetX;
\t\t\tconst absMaxX = position.x + maxOffsetX;
\t\t\tconst absMinY = position.y + minOffsetY;
\t\t\tconst absMaxY = position.y + maxOffsetY;
\t\t\tif (absMinX < paddingLeft || absMaxX > pageSize.width - paddingRight) return false;
\t\t\tif (absMinY < paddingTop || absMaxY > pageSize.height - paddingBottom) return false;
\t\t}
\t\treturn true;
\t};`;

const OLD_ALIGN_WIDGET_PROPS = `const { activeElements, changeSchemas, schemas, pageSize, schema } = props;`;

const NEW_ALIGN_WIDGET_PROPS = `const { activeElements, changeSchemas, schemas, pageSize, schema, basePdf } = props;`;

const OLD_ALIGN_COMMIT = `\t\tchangeSchemas(ass.map((as) => {
\t\t\tconst asWithSize = as;
\t\t\tconst sizeValue = tgtSize === "width" ? asWithSize.width || 0 : asWithSize.height || 0;
\t\t\treturn {
\t\t\t\tkey: \`position.\${tgtPos}\`,
\t\t\t\tvalue: round$1(basePos - adjust(sizeValue), 2),
\t\t\t\tschemaId: asWithSize.id
\t\t\t};
\t\t}));
\t};
\tconst distribute = (type) => {`;

const NEW_ALIGN_COMMIT = `\t\tconst [alignPt, alignPr, alignPb, alignPl] = isBlankPdf(basePdf) ? basePdf.padding : [0, 0, 0, 0];
\t\tchangeSchemas(ass.map((as) => {
\t\t\tconst asWithSize = as;
\t\t\tconst w = asWithSize.width || 0;
\t\t\tconst h = asWithSize.height || 0;
\t\t\tconst rot = asWithSize.rotate ?? 0;
\t\t\tif (isSingle && isVertical) {
\t\t\t\tconst { minOffsetX, maxOffsetX } = nkGetSchemaAabbOffsets(w, h, rot);
\t\t\t\tlet x = asWithSize.position.x;
\t\t\t\tif (type === "left") x = alignPl - minOffsetX;
\t\t\t\telse if (type === "right") x = pageSize.width - alignPr - maxOffsetX;
\t\t\t\telse if (type === "center") x = (pageSize.width - alignPr + alignPl - (maxOffsetX - minOffsetX)) / 2 - minOffsetX;
\t\t\t\treturn { key: "position.x", value: round$1(x, 2), schemaId: asWithSize.id };
\t\t\t}
\t\t\tif (isSingle && !isVertical) {
\t\t\t\tconst { minOffsetY, maxOffsetY } = nkGetSchemaAabbOffsets(w, h, rot);
\t\t\t\tlet y = asWithSize.position.y;
\t\t\t\tif (type === "top") y = alignPt - minOffsetY;
\t\t\t\telse if (type === "bottom") y = pageSize.height - alignPb - maxOffsetY;
\t\t\t\telse if (type === "middle") y = (pageSize.height - alignPb + alignPt - (maxOffsetY - minOffsetY)) / 2 - minOffsetY;
\t\t\t\treturn { key: "position.y", value: round$1(y, 2), schemaId: asWithSize.id };
\t\t\t}
\t\t\tconst sizeValue = tgtSize === "width" ? w : h;
\t\t\treturn {
\t\t\t\tkey: \`position.\${tgtPos}\`,
\t\t\t\tvalue: round$1(basePos - adjust(sizeValue), 2),
\t\t\t\tschemaId: asWithSize.id
\t\t\t};
\t\t}));
\t};
\tconst distribute = (type) => {`;

const OLD_KEYBOARD_CLAMP = `\t\treturn value > 0 ? value : 0;
\t};
\treturn activeSchemas.map((as) => {
\t\tlet value = getValue(as);
\t\tconst { width, height } = as;
\t\tif (key === "x") value = value > pageSize.width - width ? round$1(pageSize.width - width, 2) : value;
\t\telse value = value > pageSize.height - height ? round$1(pageSize.height - height, 2) : value;
\t\treturn {
\t\t\tkey: \`position.\${key}\`,
\t\t\tvalue,
\t\t\tschemaId: as.id
\t\t};
\t});
};`;

const NEW_KEYBOARD_CLAMP = `\t\treturn value;
\t};
\treturn activeSchemas.map((as) => {
\t\tlet value = getValue(as);
\t\tconst { width, height } = as;
\t\tconst { minOffsetX, maxOffsetX, minOffsetY, maxOffsetY } = nkGetSchemaAabbOffsets(width, height, as.rotate ?? 0);
\t\tif (key === "x") {
\t\t\tconst minX = -minOffsetX;
\t\t\tconst maxX = pageSize.width - maxOffsetX;
\t\t\tif (value < minX) value = round$1(minX, 2);
\t\t\telse if (value > maxX) value = round$1(maxX, 2);
\t\t} else {
\t\t\tconst minY = -minOffsetY;
\t\t\tconst maxY = pageSize.height - maxOffsetY;
\t\t\tif (value < minY) value = round$1(minY, 2);
\t\t\telse if (value > maxY) value = round$1(maxY, 2);
\t\t}
\t\treturn {
\t\t\tkey: \`position.\${key}\`,
\t\t\tvalue,
\t\t\tschemaId: as.id
\t\t};
\t});
};`;

const OLD_DRAG_CLAMP = `\t\tif (actualTop + targetHeight > pageHeight - bottomPadding) target.style.top = \`\${(pageHeight - targetHeight - bottomPadding) * ZOOM}px\`;
\t\telse target.style.top = \`\${top < topPadding ? topPadding : top}px\`;
\t\tif (actualLeft + targetWidth > pageWidth - rightPadding) target.style.left = \`\${(pageWidth - targetWidth - rightPadding) * ZOOM}px\`;
\t\telse target.style.left = \`\${left < leftPadding ? leftPadding : left}px\`;`;

const NEW_DRAG_CLAMP = `\t\tif (!target.__nkDragOrigin) target.__nkDragOrigin = { x: actualLeft, y: actualTop };
\t\tlet nextActualTop = actualTop;
\t\tlet nextActualLeft = actualLeft;
\t\tif (isPressShiftKey) {
\t\t\tconst dx = Math.abs(actualLeft - target.__nkDragOrigin.x);
\t\t\tconst dy = Math.abs(actualTop - target.__nkDragOrigin.y);
\t\t\tif (dx >= dy) nextActualTop = target.__nkDragOrigin.y;
\t\t\telse nextActualLeft = target.__nkDragOrigin.x;
\t\t}
\t\tconst rotateMatch = target.style.transform.match(/rotate\\(([-\\d.]+)deg\\)/);
\t\tconst rotateDeg = rotateMatch ? Number(rotateMatch[1]) : 0;
\t\tconst normRot = (rotateDeg % 360 + 360) % 360;
\t\tlet minOffsetX = 0;
\t\tlet maxOffsetX = targetWidth;
\t\tlet minOffsetY = 0;
\t\tlet maxOffsetY = targetHeight;
\t\tif (normRot !== 0) {
\t\t\tconst rad = normRot * Math.PI / 180;
\t\t\tconst cos = Math.cos(rad);
\t\t\tconst sin = Math.sin(rad);
\t\t\tconst hw = targetWidth / 2;
\t\t\tconst hh = targetHeight / 2;
\t\t\tconst xs = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([dx, dy]) => hw + dx * cos - dy * sin);
\t\t\tconst ys = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([dx, dy]) => hh + dx * sin + dy * cos);
\t\t\tminOffsetX = Math.min(...xs);
\t\t\tmaxOffsetX = Math.max(...xs);
\t\t\tminOffsetY = Math.min(...ys);
\t\t\tmaxOffsetY = Math.max(...ys);
\t\t}
\t\tconst padTopMm = isBlankPdf(basePdf) ? basePdf.padding[0] : 0;
\t\tconst padLeftMm = isBlankPdf(basePdf) ? basePdf.padding[3] : 0;
\t\tconst minY = padTopMm - minOffsetY;
\t\tconst maxY = pageHeight - bottomPadding - maxOffsetY;
\t\tconst minX = padLeftMm - minOffsetX;
\t\tconst maxX = pageWidth - rightPadding - maxOffsetX;
\t\tif (nextActualTop > maxY) nextActualTop = maxY;
\t\telse if (nextActualTop < minY) nextActualTop = minY;
\t\tif (nextActualLeft > maxX) nextActualLeft = maxX;
\t\telse if (nextActualLeft < minX) nextActualLeft = minX;
\t\ttarget.style.top = \`\${nextActualTop * ZOOM}px\`;
\t\ttarget.style.left = \`\${nextActualLeft * ZOOM}px\`;`;

const OLD_ON_DRAG_END_BLOCK = `\tconst onDragEnd = ({ target }) => {
\t\tconst { top, left } = target.style;
\t\tchangeSchemas([{
\t\t\tkey: "position.y",
\t\t\tvalue: fmt(top),
\t\t\tschemaId: target.id
\t\t}, {
\t\t\tkey: "position.x",
\t\t\tvalue: fmt(left),
\t\t\tschemaId: target.id
\t\t}]);
\t};`;

const NEW_ON_DRAG_END_BLOCK = `\tconst onDragEnd = ({ target }) => {
\t\tdelete target.__nkDragOrigin;
\t\tconst s = target.style;
\t\tlet leftPx = fmt4Num(s.left);
\t\tlet topPx = fmt4Num(s.top);
\t\tconst tr = s.transform || "";
\t\tconst tm = tr.match(/translate\\(\\s*([-\\d.]+)px\\s*,\\s*([-\\d.]+)px\\s*\\)/);
\t\tif (tm) {
\t\t\tleftPx += Number(tm[1]);
\t\t\ttopPx += Number(tm[2]);
\t\t\tconst rotM = tr.match(/rotate\\(([-\\d.]+)deg\\)/);
\t\t\ts.transform = rotM ? \`rotate(\${rotM[1]}deg)\` : "";
\t\t}
\t\ts.left = \`\${leftPx}px\`;
\t\ts.top = \`\${topPx}px\`;
\t\tchangeSchemas([{
\t\t\tkey: "position.y",
\t\t\tvalue: fmt(s.top),
\t\t\tschemaId: target.id
\t\t}, {
\t\t\tkey: "position.x",
\t\t\tvalue: fmt(s.left),
\t\t\tschemaId: target.id
\t\t}]);
\t};`;

const OLD_ON_RESIZE_END = `\tconst onResizeEnd = ({ target }) => {
\t\tconst { id, style } = target;
\t\tconst { width, height, top, left } = style;
\t\tchangeSchemas([
\t\t\t{
\t\t\t\tkey: "position.x",
\t\t\t\tvalue: fmt(left),
\t\t\t\tschemaId: id
\t\t\t},
\t\t\t{
\t\t\t\tkey: "position.y",
\t\t\t\tvalue: fmt(top),
\t\t\t\tschemaId: id
\t\t\t},
\t\t\t{
\t\t\t\tkey: "width",
\t\t\t\tvalue: fmt(width),
\t\t\t\tschemaId: id
\t\t\t},
\t\t\t{
\t\t\t\tkey: "height",
\t\t\t\tvalue: fmt(height),
\t\t\t\tschemaId: id
\t\t\t}
\t\t]);
\t};`;

const NEW_ON_RESIZE_END = `\tconst onResizeEnd = ({ target }) => {
\t\tconst { id, style } = target;
\t\tconst { width, height, top, left } = style;
\t\tconst pageSchemas = schemasList[pageCursor] || [];
\t\tconst touched = pageSchemas.find((s) => s.id === id);
\t\tconst rot = touched?.rotate ?? 0;
\t\tconst changes = [
\t\t\t{ key: "width", value: fmt(width), schemaId: id },
\t\t\t{ key: "height", value: fmt(height), schemaId: id }
\t\t];
\t\tif (rot === 0) {
\t\t\tchanges.push(
\t\t\t\t{ key: "position.x", value: fmt(left), schemaId: id },
\t\t\t\t{ key: "position.y", value: fmt(top), schemaId: id }
\t\t\t);
\t\t}
\t\tchangeSchemas(changes);
\t};`;

const OLD_ON_RESIZE_ENDS = `\tconst onResizeEnds = ({ targets }) => {
\t\tconst arg = targets.map(({ style: { width, height, top, left }, id }) => [
\t\t\t{
\t\t\t\tkey: "width",
\t\t\t\tvalue: fmt(width),
\t\t\t\tschemaId: id
\t\t\t},
\t\t\t{
\t\t\t\tkey: "height",
\t\t\t\tvalue: fmt(height),
\t\t\t\tschemaId: id
\t\t\t},
\t\t\t{
\t\t\t\tkey: "position.y",
\t\t\t\tvalue: fmt(top),
\t\t\t\tschemaId: id
\t\t\t},
\t\t\t{
\t\t\t\tkey: "position.x",
\t\t\t\tvalue: fmt(left),
\t\t\t\tschemaId: id
\t\t\t}
\t\t]);
\t\tchangeSchemas(flatten(arg));
\t};`;

const OLD_ON_RESIZE = `\tconst onResize = ({ target, width, height, direction }) => {
\t\tif (!target) return;
\t\tlet topPadding = 0;
\t\tlet rightPadding = 0;
\t\tlet bottomPadding = 0;
\t\tlet leftPadding = 0;
\t\tif (isBlankPdf(basePdf)) {
\t\t\tconst [t, r, b, l] = basePdf.padding;
\t\t\ttopPadding = t * ZOOM;
\t\t\trightPadding = mm2px(r);
\t\t\tbottomPadding = mm2px(b);
\t\t\tleftPadding = l * ZOOM;
\t\t}
\t\tconst pageWidth = mm2px(pageSizes[pageCursor].width);
\t\tconst pageHeight = mm2px(pageSizes[pageCursor].height);
\t\tconst obj = {
\t\t\twidth: \`\${width}px\`,
\t\t\theight: \`\${height}px\`
\t\t};
\t\tconst s = target.style;
\t\tlet newLeft = fmt4Num(s.left) + (fmt4Num(s.width) - width);
\t\tlet newTop = fmt4Num(s.top) + (fmt4Num(s.height) - height);
\t\tif (newLeft < leftPadding) newLeft = leftPadding;
\t\tif (newTop < topPadding) newTop = topPadding;
\t\tif (newLeft + width > pageWidth - rightPadding) obj.width = \`\${pageWidth - rightPadding - newLeft}px\`;
\t\tif (newTop + height > pageHeight - bottomPadding) obj.height = \`\${pageHeight - bottomPadding - newTop}px\`;
\t\tconst d = direction.toString();
\t\tif (isTopLeftResize(d)) {
\t\t\tobj.top = \`\${newTop}px\`;
\t\t\tobj.left = \`\${newLeft}px\`;
\t\t} else if (d === "1,-1") obj.top = \`\${newTop}px\`;
\t\telse if (d === "-1,1") obj.left = \`\${newLeft}px\`;
\t\tObject.assign(s, obj);
\t};`;

const NEW_ON_RESIZE = `\tconst onResize = ({ target, width, height, direction }) => {
\t\tif (!target) return;
\t\tconst pageSchemas = schemasList[pageCursor] || [];
\t\tconst touched = pageSchemas.find((s) => s.id === target.id);
\t\tconst rot = touched?.rotate ?? 0;
\t\tlet topPadding = 0;
\t\tlet rightPadding = 0;
\t\tlet bottomPadding = 0;
\t\tlet leftPadding = 0;
\t\tif (isBlankPdf(basePdf)) {
\t\t\tconst [t, r, b, l] = basePdf.padding;
\t\t\ttopPadding = t * ZOOM;
\t\t\trightPadding = mm2px(r);
\t\t\tbottomPadding = mm2px(b);
\t\t\tleftPadding = l * ZOOM;
\t\t}
\t\tconst pageWidth = mm2px(pageSizes[pageCursor].width);
\t\tconst pageHeight = mm2px(pageSizes[pageCursor].height);
\t\tconst obj = {
\t\t\twidth: \`\${width}px\`,
\t\t\theight: \`\${height}px\`
\t\t};
\t\tconst s = target.style;
\t\tif (rot === 0) {
\t\t\tlet newLeft = fmt4Num(s.left) + (fmt4Num(s.width) - width);
\t\t\tlet newTop = fmt4Num(s.top) + (fmt4Num(s.height) - height);
\t\t\tif (newLeft < leftPadding) newLeft = leftPadding;
\t\t\tif (newTop < topPadding) newTop = topPadding;
\t\t\tif (newLeft + width > pageWidth - rightPadding) obj.width = \`\${pageWidth - rightPadding - newLeft}px\`;
\t\t\tif (newTop + height > pageHeight - bottomPadding) obj.height = \`\${pageHeight - bottomPadding - newTop}px\`;
\t\t\tconst d = direction.toString();
\t\t\tif (isTopLeftResize(d)) {
\t\t\t\tobj.top = \`\${newTop}px\`;
\t\t\t\tobj.left = \`\${newLeft}px\`;
\t\t\t} else if (d === "1,-1") obj.top = \`\${newTop}px\`;
\t\t\telse if (d === "-1,1") obj.left = \`\${newLeft}px\`;
\t\t}
\t\tObject.assign(s, obj);
\t};`;

const NEW_ON_RESIZE_ENDS = `\tconst onResizeEnds = ({ targets }) => {
\t\tconst pageSchemas = schemasList[pageCursor] || [];
\t\tconst arg = targets.map(({ style: { width, height, top, left }, id }) => {
\t\t\tconst touched = pageSchemas.find((s) => s.id === id);
\t\t\tconst rot = touched?.rotate ?? 0;
\t\t\tconst changes = [
\t\t\t\t{ key: "width", value: fmt(width), schemaId: id },
\t\t\t\t{ key: "height", value: fmt(height), schemaId: id }
\t\t\t];
\t\t\tif (rot === 0) {
\t\t\t\tchanges.push(
\t\t\t\t\t{ key: "position.y", value: fmt(top), schemaId: id },
\t\t\t\t\t{ key: "position.x", value: fmt(left), schemaId: id }
\t\t\t\t);
\t\t\t}
\t\t\treturn changes;
\t\t});
\t\tchangeSchemas(flatten(arg));
\t};`;

const OLD_ROTATE_END = `\t\tconst normalizedRotate = normalizeRotate(Number(transform.replace("rotate(", "").replace("deg)", "")));
\t\tchangeSchemas([{
\t\t\tkey: "rotate",
\t\t\tvalue: normalizedRotate,
\t\t\tschemaId: target.id
\t\t}]);`;

const OLD_ON_ROTATE = `\tconst onRotate = ({ target, rotate }) => {
\t\ttarget.style.transform = \`rotate(\${rotate}deg)\`;
\t};`;

const NEW_ON_ROTATE = `\tconst onRotate = ({ target, rotate }) => {
\t\tlet nextRotate = rotate;
\t\tif (isPressShiftKey) nextRotate = Math.round(rotate / 15) * 15;
\t\ttarget.style.transform = \`rotate(\${nextRotate}deg)\`;
\t};`;

const NEW_ROTATE_END = `\t\tlet normalizedRotate = normalizeRotate(Number(transform.replace("rotate(", "").replace("deg)", "")));
\t\tif (isPressShiftKey) normalizedRotate = normalizeRotate(Math.round(normalizedRotate / 15) * 15);
\t\tchangeSchemas([{
\t\t\tkey: "rotate",
\t\t\tvalue: normalizedRotate,
\t\t\tschemaId: target.id
\t\t}]);`;

const OLD_ROTATE_GROUP_LINE = `\t\t\t\tvalue: normalizeRotate(Number(transform.replace("rotate(", "").replace("deg)", ""))),`;

const NEW_ROTATE_GROUP_LINE = `\t\t\t\tvalue: (() => {
\t\t\t\t\tlet r = normalizeRotate(Number(transform.replace("rotate(", "").replace("deg)", "")));
\t\t\t\t\tif (isPressShiftKey) r = normalizeRotate(Math.round(r / 15) * 15);
\t\t\t\t\treturn r;
\t\t\t\t})(),`;

const OLD_ALIGN_LAYOUT_START = `\tconst layoutBtns = [`;

const NEW_ALIGN_LAYOUT_START = `\tconst rotateBy = (delta) => {
\t\tconst ids = activeElements.map((ae) => ae.id);
\t\tconst ass = schemas.filter((s) => ids.includes(s.id));
\t\tif (ass.length === 0) return;
\t\tchangeSchemas(ass.map((as) => ({
\t\t\tkey: "rotate",
\t\t\tvalue: ((Number(as.rotate ?? 0) + delta) % 360 + 360) % 360,
\t\t\tschemaId: as.id
\t\t})));
\t};
\tconst layoutBtns = [`;

const OLD_ALIGN_LAYOUT_END = `\t\t{
\t\t\tid: "horizontal",
\t\t\ticon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlignHorizontalSpaceAround, { size: 15 }),
\t\t\tonClick: () => distribute("horizontal")
\t\t}
\t];
\treturn /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Form$1.Item, {
\t\tlabel: schema?.title,
\t\tchildren: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Space.Compact, { children: layoutBtns.map((btn) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(button_default, {
\t\t\tclassName: DESIGNER_CLASSNAME + "align-" + btn.id,
\t\t\tstyle: { padding: 7 },
\t\t\tdisabled: activeElements.length <= 2 && ["vertical", "horizontal"].includes(btn.id),
\t\t\t...btn
\t\t}, btn.id)) })
\t});`;

const NEW_ALIGN_LAYOUT_END = `\t\t{
\t\t\tid: "horizontal",
\t\t\ticon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlignHorizontalSpaceAround, { size: 15 }),
\t\t\tonClick: () => distribute("horizontal")
\t\t}
\t];
\tconst rotateBtns = [
\t\t{
\t\t\tid: "rotate-ccw",
\t\t\ticon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 11, fontWeight: 600 }, children: "−90°" }),
\t\t\tonClick: () => rotateBy(-90)
\t\t},
\t\t{
\t\t\tid: "rotate-cw",
\t\t\ticon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 11, fontWeight: 600 }, children: "+90°" }),
\t\t\tonClick: () => rotateBy(90)
\t\t}
\t];
\treturn /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Form$1.Item, {
\t\tlabel: schema?.title,
\t\tchildren: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }, children: [
\t\t\t/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Space.Compact, { children: layoutBtns.map((btn) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(button_default, {
\t\t\t\tclassName: DESIGNER_CLASSNAME + "align-" + btn.id,
\t\t\t\tstyle: { padding: 7 },
\t\t\t\tdisabled: activeElements.length <= 2 && ["vertical", "horizontal"].includes(btn.id),
\t\t\t\t...btn
\t\t\t}, btn.id)) }),
\t\t\t/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Space.Compact, { children: rotateBtns.map((btn) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(button_default, {
\t\t\t\tclassName: DESIGNER_CLASSNAME + "align-" + btn.id,
\t\t\t\tstyle: { padding: 7 },
\t\t\t\t...btn
\t\t\t}, btn.id)) })
\t\t] })
\t});`;

export function patchPdfmeUiBundle(source: string): { code: string; patched: boolean } {
  if (!source.includes('actualLeft + targetWidth > pageWidth') && !source.includes('handlePositionSizeChange')) {
    return { code: source, patched: false };
  }

  let code = source;
  let patched = false;

  if (code.includes(OLD_HANDLE_POSITION)) {
    code = code.replace(OLD_HANDLE_POSITION, NEW_HANDLE_POSITION);
    patched = true;
  }
  // Хелпер nkGetSchemaAabbOffsets вставляється разом з NEW_HANDLE_POSITION.
  if (code.includes('nkGetSchemaAabbOffsets') && code.includes(OLD_TEMPLATE_TO_SCHEMAS_CLAMP)) {
    code = code.replace(OLD_TEMPLATE_TO_SCHEMAS_CLAMP, NEW_TEMPLATE_TO_SCHEMAS_CLAMP);
    patched = true;
  }

  if (code.includes(OLD_VALIDATE_XY)) {
    code = code.replace(OLD_VALIDATE_XY, NEW_VALIDATE_XY);
    patched = true;
  }
  if (code.includes(OLD_VALIDATE_WH)) {
    code = code.replace(OLD_VALIDATE_WH, NEW_VALIDATE_WH);
    patched = true;
  }
  if (code.includes(OLD_ALIGN_WIDGET_PROPS)) {
    code = code.replace(OLD_ALIGN_WIDGET_PROPS, NEW_ALIGN_WIDGET_PROPS);
    patched = true;
  }
  if (code.includes(OLD_ALIGN_COMMIT)) {
    code = code.replace(OLD_ALIGN_COMMIT, NEW_ALIGN_COMMIT);
    patched = true;
  }
  if (code.includes(OLD_KEYBOARD_CLAMP)) {
    code = code.replace(OLD_KEYBOARD_CLAMP, NEW_KEYBOARD_CLAMP);
    patched = true;
  }

  if (code.includes(OLD_DRAG_CLAMP)) {
    code = code.replace(OLD_DRAG_CLAMP, NEW_DRAG_CLAMP);
    patched = true;
  }
  if (code.includes(OLD_ON_DRAG_END_BLOCK)) {
    code = code.replace(OLD_ON_DRAG_END_BLOCK, NEW_ON_DRAG_END_BLOCK);
    patched = true;
  }
  if (code.includes(OLD_ON_ROTATE)) {
    code = code.replace(OLD_ON_ROTATE, NEW_ON_ROTATE);
    patched = true;
  }
  if (code.includes(OLD_ROTATE_END)) {
    code = code.replace(OLD_ROTATE_END, NEW_ROTATE_END);
    patched = true;
  }
  if (code.includes(OLD_ROTATE_GROUP_LINE)) {
    code = code.replaceAll(OLD_ROTATE_GROUP_LINE, NEW_ROTATE_GROUP_LINE);
    patched = true;
  }
  if (code.includes(OLD_ALIGN_LAYOUT_START)) {
    code = code.replace(OLD_ALIGN_LAYOUT_START, NEW_ALIGN_LAYOUT_START);
    patched = true;
  }
  if (code.includes(OLD_ALIGN_LAYOUT_END)) {
    code = code.replace(OLD_ALIGN_LAYOUT_END, NEW_ALIGN_LAYOUT_END);
    patched = true;
  }
  if (code.includes(OLD_APPLY_ASPECT)) {
    code = code.replace(OLD_APPLY_ASPECT, NEW_APPLY_ASPECT);
    patched = true;
  }
  if (code.includes(OLD_ON_RESIZE_END)) {
    code = code.replace(OLD_ON_RESIZE_END, NEW_ON_RESIZE_END);
    patched = true;
  }
  if (code.includes(OLD_ON_RESIZE_ENDS)) {
    code = code.replace(OLD_ON_RESIZE_ENDS, NEW_ON_RESIZE_ENDS);
    patched = true;
  }
  if (code.includes(OLD_ON_RESIZE)) {
    code = code.replace(OLD_ON_RESIZE, NEW_ON_RESIZE);
    patched = true;
  }

  return { code, patched };
}

function createEsbuildPdfmePatchPlugin() {
  return {
    name: 'pdfme-ui-designer-patch-esbuild',
    setup(build: { onLoad: (opts: { filter: RegExp }, fn: (args: { path: string }) => Promise<{ contents: string; loader: 'js' }>) => void }) {
      build.onLoad({ filter: /@pdfme\/ui\/dist\/index\.js$/ }, async (args) => {
        const contents = await fs.promises.readFile(args.path, 'utf8');
        const { code, patched } = patchPdfmeUiBundle(contents);
        if (!patched) {
          console.warn('[pdfme-designer-patch] onLoad: expected blocks not found in', args.path);
        }
        return { contents: code, loader: 'js' };
      });
    },
  };
}

/** pdfme Designer: AABB clamp, Shift-drag axis, Shift-rotate 15°, ±90° у Align. */
export function pdfmeDesignerRotatedDragPatch(): Plugin {
  const esbuildPatchPlugin = createEsbuildPdfmePatchPlugin();

  return {
    name: 'pdfme-designer-rotated-drag-patch',
    enforce: 'pre',
    config() {
      return {
        optimizeDeps: {
          include: ['@pdfme/ui'],
          esbuildOptions: {
            plugins: [esbuildPatchPlugin],
          },
        },
      };
    },
    transform(code, id) {
      if (!id.includes('@pdfme/ui/dist/index.js')) return;
      const { code: next, patched } = patchPdfmeUiBundle(code);
      if (!patched) {
        console.warn('[pdfme-designer-patch] transform: expected blocks not found');
        return;
      }
      return { code: next, map: null };
    },
  };
}

export function isPdfmeUiBundlePatched(source: string): boolean {
  return source.includes('nkGetSchemaAabbOffsets') && source.includes('rotateBy');
}

export const PDFME_UI_INDEX_PATH = path.join(process.cwd(), 'node_modules/@pdfme/ui/dist/index.js');
