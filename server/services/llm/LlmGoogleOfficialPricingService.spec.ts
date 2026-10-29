import { describe, expect, it } from 'vitest';
import { parseGooglePricingHtml, resolveGooglePricingRow } from './LlmGoogleOfficialPricingService.js';

const SAMPLE = `
<div class="models-section">
  <em><a href="/gemini-api/docs/models/gemini-2.5-flash"><code dir="ltr" translate="no">gemini-2.5-flash</code></a></em>
</div>
<div><devsite-selector>
<section><h3 data-text="Standard">Standard</h3><table class="pricing-table">
  <tbody>
    <tr>
      <td>Input price</td>
      <td>Free of charge</td>
      <td>$0.30 (text / image / video)<br>$1.00 (audio)</td>
    </tr>
    <tr>
      <td>Output price (including thinking tokens)</td>
      <td>Free of charge</td>
      <td>$2.50</td>
    </tr>
  </tbody>
</table></section>
</div>
<div class="models-section">
  <em><a href="/gemini-api/docs/models/gemini-2.0-flash-lite"><code translate="no" dir="ltr">gemini-2.0-flash-lite</code></a></em>
</div>
<section><h3 data-text="Standard">Standard</h3><table class="pricing-table">
  <tbody>
    <tr>
      <td>Input price</td>
      <td>Free of charge</td>
      <td>$0.075</td>
    </tr>
    <tr>
      <td>Output price</td>
      <td>Free of charge</td>
      <td>$0.30</td>
    </tr>
  </tbody>
</table></section>
`;

describe('parseGooglePricingHtml', () => {
  it('parses Standard paid tier input/output per model anchor', () => {
    const map = parseGooglePricingHtml(SAMPLE);
    expect(map.get('gemini-2.5-flash')).toEqual({ inputUsdPerM: 0.3, outputUsdPerM: 2.5 });
    expect(map.get('gemini-2.0-flash-lite')).toEqual({ inputUsdPerM: 0.075, outputUsdPerM: 0.3 });
    expect(resolveGooglePricingRow(map, 'gemini-2.5-flash-preview-09-2025')).toEqual({
      inputUsdPerM: 0.3,
      outputUsdPerM: 2.5,
    });
  });
});
