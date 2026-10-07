import { useCallback, useEffect, useState } from 'react';
import type { HrPayGroup, HrPayGroupDto } from '@shared/types/hr';
import { SPEC_COLOR_HUE_NAMES } from '@shared/utils/specColorPalette';

const PAY_GROUP_HUES_EVENT = 'hr-pay-group-hues-changed';

function buildHueOverrides(groups: HrPayGroupDto[]): Partial<Record<HrPayGroup, string>> {
  const next: Partial<Record<HrPayGroup, string>> = {};
  for (const group of groups) {
    if (group.chipHue && SPEC_COLOR_HUE_NAMES.includes(group.chipHue)) {
      next[group.slug] = group.chipHue;
    }
  }
  return next;
}

export function notifyPayGroupHuesChanged(): void {
  window.dispatchEvent(new Event(PAY_GROUP_HUES_EVENT));
}

export function useHrPayGroupHues() {
  const [hueOverrides, setHueOverrides] = useState<Partial<Record<HrPayGroup, string>>>({});

  const refresh = useCallback(async () => {
    const response = await fetch('/api/hr/pay-groups?includeInactive=true', { credentials: 'include' });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(json.data)) return;
    setHueOverrides(buildHueOverrides(json.data as HrPayGroupDto[]));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = () => {
      void refresh();
    };
    window.addEventListener(PAY_GROUP_HUES_EVENT, handler);
    return () => window.removeEventListener(PAY_GROUP_HUES_EVENT, handler);
  }, [refresh]);

  return { hueOverrides, refresh };
}
