import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  Checkbox,
  CheckboxGroup,
  Select,
  SelectItem,
  Spinner,
  Switch,
} from '@heroui/react';
import { ToastService } from '@/services/ToastService';
import { HR_PRODUCTION_CALENDAR_PRESETS } from '@shared/utils/hrProductionWeek';
import type { HrProductionCalendarDto, HrProductionWeekDto } from '@shared/types/hr';
import { HR_BTN_PRIMARY } from '../hrUi';

const CUSTOM_PRESET_LABEL = 'Власні налаштування';

const WEEKDAY_OPTIONS = [
  { value: '1', label: 'Пн' },
  { value: '2', label: 'Вт' },
  { value: '3', label: 'Ср' },
  { value: '4', label: 'Чт' },
  { value: '5', label: 'Пт' },
  { value: '6', label: 'Сб' },
  { value: '0', label: 'Нд' },
];

const WEEK_START_OPTIONS = [
  { value: '1', label: 'Понеділок' },
  { value: '2', label: 'Вівторок' },
  { value: '3', label: 'Середа' },
  { value: '4', label: 'Четвер' },
  { value: '5', label: "П'ятниця" },
  { value: '6', label: 'Субота' },
  { value: '0', label: 'Неділя' },
];

const SELECT_CLASS_NAMES = {
  trigger: 'shadow-none border border-border-subtle bg-surface-card',
};

function snapshotProductionConfig(config: HrProductionCalendarDto): string {
  return JSON.stringify({
    isEnabled: config.isEnabled,
    weekStartDay: config.weekStartDay,
    fopWeekdays: config.fopWeekdays,
    label: config.label,
  });
}

export interface ProductionCalendarTabHandle {
  save: () => Promise<void>;
}

interface ProductionCalendarTabProps {
  canManage: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

export const ProductionCalendarTab = forwardRef<ProductionCalendarTabHandle, ProductionCalendarTabProps>(
  function ProductionCalendarTab({ canManage, onDirtyChange }, ref) {
    const [config, setConfig] = useState<HrProductionCalendarDto | null>(null);
    const [preview, setPreview] = useState<HrProductionWeekDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const baselineRef = useRef('');
    const [baselineVersion, setBaselineVersion] = useState(0);

    const commitBaseline = useCallback((nextConfig: HrProductionCalendarDto) => {
      baselineRef.current = snapshotProductionConfig(nextConfig);
      setBaselineVersion((version) => version + 1);
    }, []);

    const fetchData = useCallback(async () => {
      setLoading(true);
      try {
        const [configRes, weeksRes] = await Promise.all([
          fetch('/api/hr/production-calendar', { credentials: 'include' }),
          fetch(`/api/hr/production-weeks?year=${new Date().getFullYear()}&month=${new Date().getMonth() + 1}`, {
            credentials: 'include',
          }),
        ]);
        const configJson = await configRes.json().catch(() => ({}));
        const weeksJson = await weeksRes.json().catch(() => ({}));
        if (configRes.ok) {
          const nextConfig = configJson.data ?? null;
          setConfig(nextConfig);
          if (nextConfig) commitBaseline(nextConfig);
        }
        if (weeksRes.ok) setPreview(Array.isArray(weeksJson.data) ? weeksJson.data.slice(0, 3) : []);
      } finally {
        setLoading(false);
      }
    }, [commitBaseline]);

    useEffect(() => {
      void fetchData();
    }, [fetchData]);

    const isDirty = useMemo(() => {
      if (!config || !baselineRef.current) return false;
      void baselineVersion;
      return snapshotProductionConfig(config) !== baselineRef.current;
    }, [config, baselineVersion]);

    useEffect(() => {
      onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    const preset = useMemo(() => {
      if (!config) return 'custom';
      if (
        config.weekStartDay === HR_PRODUCTION_CALENDAR_PRESETS.monFri.weekStartDay &&
        JSON.stringify(config.fopWeekdays) === JSON.stringify(HR_PRODUCTION_CALENDAR_PRESETS.monFri.fopWeekdays)
      ) {
        return 'monFri';
      }
      if (
        config.weekStartDay === HR_PRODUCTION_CALENDAR_PRESETS.friThu.weekStartDay &&
        JSON.stringify(config.fopWeekdays) === JSON.stringify(HR_PRODUCTION_CALENDAR_PRESETS.friThu.fopWeekdays)
      ) {
        return 'friThu';
      }
      return 'custom';
    }, [config]);

    const applyPreset = (key: 'monFri' | 'friThu' | 'custom') => {
      if (!config) return;
      if (key === 'custom') {
        setConfig({ ...config, label: CUSTOM_PRESET_LABEL });
        return;
      }
      const presetConfig = HR_PRODUCTION_CALENDAR_PRESETS[key];
      setConfig({
        ...config,
        weekStartDay: presetConfig.weekStartDay,
        fopWeekdays: [...presetConfig.fopWeekdays],
        label: presetConfig.label,
      });
    };

    const save = useCallback(async () => {
      if (!config) return;
      setSaving(true);
      try {
        const response = await fetch('/api/hr/production-calendar', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isEnabled: config.isEnabled,
            weekStartDay: config.weekStartDay,
            fopWeekdays: config.fopWeekdays,
            label: config.label,
          }),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          ToastService.show({ title: json.message || 'Помилка збереження', color: 'danger' });
          throw new Error(json.message || 'Помилка збереження');
        }
        ToastService.show({ title: 'Календар збережено', color: 'success' });
        const saved = json.data as HrProductionCalendarDto;
        setConfig(saved);
        commitBaseline(saved);
        await fetchData();
      } finally {
        setSaving(false);
      }
    }, [config, commitBaseline, fetchData]);

    useImperativeHandle(ref, () => ({
      save,
    }), [save]);

    if (loading || !config) {
      return (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <p className="text-xs text-text-secondary">
          Опційний виробничий календар для агрегації ФОП. Табель лишається на календарних тижнях (пн–нд).
        </p>

        <Card className="border border-border-subtle shadow-surface">
          <CardBody className="flex flex-col gap-4">
            <Switch
              size="sm"
              isSelected={config.isEnabled}
              isDisabled={!canManage}
              onValueChange={(value) => setConfig((prev) => (prev ? { ...prev, isEnabled: value } : prev))}
            >
              Увімкнути виробничий календар
            </Switch>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)] gap-4 items-end">
              <Select
                label="Пресет"
                labelPlacement="outside"
                variant="bordered"
                isDisabled={!canManage}
                selectedKeys={[preset]}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0];
                  if (value === 'monFri' || value === 'friThu' || value === 'custom') {
                    applyPreset(value);
                  }
                }}
                classNames={SELECT_CLASS_NAMES}
              >
                <SelectItem key="monFri">Стандарт пн–пт</SelectItem>
                <SelectItem key="friThu">Виробництво пт–чт</SelectItem>
                <SelectItem key="custom" description="Оберіть день початку та робочі дні вручну">
                  Власні налаштування
                </SelectItem>
              </Select>

              <Select
                label="День початку тижня"
                labelPlacement="outside"
                variant="bordered"
                isDisabled={!canManage || !config.isEnabled}
                selectedKeys={[String(config.weekStartDay)]}
                onSelectionChange={(keys) => {
                  const value = Number(Array.from(keys)[0]);
                  if (Number.isInteger(value)) {
                    setConfig((prev) =>
                      prev ? { ...prev, weekStartDay: value, label: CUSTOM_PRESET_LABEL } : prev,
                    );
                  }
                }}
                classNames={SELECT_CLASS_NAMES}
              >
                {WEEK_START_OPTIONS.map((item) => (
                  <SelectItem key={item.value}>{item.label}</SelectItem>
                ))}
              </Select>

              <CheckboxGroup
                label="Дні для розрахунку ФОП"
                isDisabled={!canManage || !config.isEnabled}
                value={config.fopWeekdays.map(String)}
                onValueChange={(values) => {
                  setConfig((prev) =>
                    prev
                      ? {
                          ...prev,
                          fopWeekdays: values.map(Number).sort((a, b) => a - b),
                          label: CUSTOM_PRESET_LABEL,
                        }
                      : prev,
                  );
                }}
              >
                <div className="flex flex-wrap gap-3">
                  {WEEKDAY_OPTIONS.map((item) => (
                    <Checkbox key={item.value} value={item.value}>
                      {item.label}
                    </Checkbox>
                  ))}
                </div>
              </CheckboxGroup>
            </div>

            {canManage ? (
              <Button
                size="sm"
                className={`${HR_BTN_PRIMARY} self-start`}
                isLoading={saving}
                isDisabled={!isDirty}
                onPress={() => void save()}
              >
                Зберегти
              </Button>
            ) : null}
          </CardBody>
        </Card>

        {config.isEnabled && preview.length > 0 ? (
          <Card className="border border-border-subtle shadow-surface">
            <CardBody className="space-y-2">
              <div className="text-sm font-semibold text-text-primary">Превʼю найближчих періодів</div>
              <ul className="space-y-1 text-sm text-text-secondary">
                {preview.map((week) => (
                  <li key={week.startDate}>{week.label}</li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}
      </div>
    );
  },
);
