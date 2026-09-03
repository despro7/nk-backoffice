import { useCallback, useState } from 'react';
import {
  HR_TIMESHEET_KIND_CODES,
  type HrTimesheetKindCode,
} from '@shared/types/hr';
import { SPEC_COLOR_HUE_NAMES } from '@shared/utils/specColorPalette';
import { HR_TIMESHEET_KIND_DEFAULT_HUES, kindHueOrDefault } from './hrUi';

const STORAGE_KEY = 'hr.timesheet.kindHues';

function isHue(value: string): boolean {
  return SPEC_COLOR_HUE_NAMES.includes(value);
}

function loadHues(): Partial<Record<HrTimesheetKindCode, string>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const next: Partial<Record<HrTimesheetKindCode, string>> = {};
    for (const code of HR_TIMESHEET_KIND_CODES) {
      const hue = parsed[code];
      if (hue && isHue(hue)) next[code] = hue;
    }
    return next;
  } catch {
    return {};
  }
}

function persist(hues: Partial<Record<HrTimesheetKindCode, string>>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hues));
  } catch {
    /* ignore quota */
  }
}

export function useHrTimesheetKindColors() {
  const [overrides, setOverrides] = useState<Partial<Record<HrTimesheetKindCode, string>>>(loadHues);

  const hueFor = useCallback(
    (code: HrTimesheetKindCode): string => kindHueOrDefault(code, overrides),
    [overrides],
  );

  const setHue = useCallback((code: HrTimesheetKindCode, hue: string | null) => {
    setOverrides((current) => {
      const next = { ...current };
      if (!hue || hue === HR_TIMESHEET_KIND_DEFAULT_HUES[code]) {
        delete next[code];
      } else if (isHue(hue)) {
        next[code] = hue;
      }
      persist(next);
      return next;
    });
  }, []);

  return { overrides, hueFor, setHue };
}
