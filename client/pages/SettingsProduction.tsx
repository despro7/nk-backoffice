import { Button, Card, CardBody, CardHeader, Input, RadioGroup, Spinner, Switch } from '@heroui/react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { CARD_RADIO_GROUP_CLASS_NAMES, CardRadio } from '@/components/ui/CardRadio';
import { useProductionSettings } from '@/hooks/useProductionSettings';
import { ToastService } from '@/services/ToastService';
import type { CatalogLossFormula, ProductionSettingsDto } from '@shared/types/production';
import { grossFromNet } from '@shared/utils/catalogLoss';

type EditableLossType = { key: string; id: number | null; name: string; isActive: boolean };

const FORMULA_OPTIONS: Array<{ value: CatalogLossFormula; label: string; formula: string; hint: string }> = [
  {
    value: 'additive',
    label: 'Адитивна',
    formula: 'брутто = нетто / (1 − (a + b))',
    hint: 'Як у Excel-техкартах: відсотки втрат складаються.',
  },
  {
    value: 'sequential',
    label: 'Послідовна',
    formula: 'брутто = нетто / ((1 − a) · (1 − b))',
    hint: 'Кожен тип втрат рахується від залишку після попереднього.',
  },
];

const INPUT_WRAPPER_CLASS = 'border-1 border-default-200';

let localKeySeq = 0;
const nextKey = () => `new-${++localKeySeq}`;

function toEditable(settings: ProductionSettingsDto): EditableLossType[] {
  return settings.lossTypes.map((t) => ({ key: `id-${t.id}`, id: t.id, name: t.name, isActive: t.isActive }));
}

function formatKg(value: number): string {
  return value.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Налаштування виробництва: типи втрат для розбивки в специфікації і формула брутто. */
export default function SettingsProduction() {
  const { settings, loading, error, save } = useProductionSettings();
  const [types, setTypes] = useState<EditableLossType[]>([]);
  const [formula, setFormula] = useState<CatalogLossFormula>(settings.lossFormula);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    setTypes(toEditable(settings));
    setFormula(settings.lossFormula);
  }, [loading, settings]);

  const isDirty = useMemo(() => {
    const saved = JSON.stringify(toEditable(settings).map(({ id, name, isActive }) => ({ id, name, isActive })));
    const current = JSON.stringify(types.map(({ id, name, isActive }) => ({ id, name: name.trim(), isActive })));
    return saved !== current || formula !== settings.lossFormula;
  }, [settings, types, formula]);

  const example = useMemo(() => {
    const losses = [
      { typeId: 1, percent: 32 },
      { typeId: 2, percent: 12 },
    ];
    return grossFromNet(171.6, { losses }, formula);
  }, [formula]);

  const handleDragEnd = (result: DropResult) => {
    const to = result.destination?.index;
    const from = result.source.index;
    if (to == null || to === from) return;
    setTypes((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await save({
        lossFormula: formula,
        lossTypes: types.map((t) => ({ id: t.id, name: t.name.trim(), isActive: t.isActive })),
      });
      setTypes(toEditable(saved));
      ToastService.show({ title: 'Налаштування виробництва збережено', color: 'success' });
    } catch (err) {
      ToastService.show({
        title: 'Не вдалося зберегти налаштування',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <p className="text-sm text-default-500">
        Типи втрат використовуються в специфікації товару: поле «Втрати» можна розділити на окремі типи
        (наприклад, очистка і розсип). Формула визначає, як вони складаються в брутто.
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}

      <Card>
        <CardHeader className="border-b border-default-200 gap-2">
          <DynamicIcon name="split" size={18} className="text-default-500" />
          <h2 className="text-lg font-semibold">Типи втрат</h2>
        </CardHeader>
        <CardBody className="p-4 flex flex-col gap-2">
          {types.length === 0 && <p className="text-sm text-default-500">Типів втрат ще немає.</p>}
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="loss-types">
              {(dropProvided) => (
                <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="flex flex-col">
                  {types.map((t, idx) => (
                    <Draggable key={t.key} draggableId={t.key} index={idx}>
                      {(dragProvided, snapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className={`flex items-center gap-2 py-1 ${snapshot.isDragging ? 'bg-default-100 shadow-sm rounded-md' : ''}`}
                        >
                          <span
                            {...dragProvided.dragHandleProps}
                            className="inline-flex h-8 w-5 shrink-0 items-center justify-center text-default-300 hover:text-default-500 cursor-grab active:cursor-grabbing"
                            title="Перетягнути для зміни порядку"
                            aria-label="Перетягнути для зміни порядку"
                          >
                            <DynamicIcon name="grip-vertical" size={16} />
                          </span>
                          <Input
                            id={`loss-type-${t.key}`}
                            size="sm"
                            aria-label="Назва типу втрат"
                            className="flex-1"
                            value={t.name}
                            maxLength={60}
                            isInvalid={!t.name.trim()}
                            classNames={{ inputWrapper: INPUT_WRAPPER_CLASS }}
                            onValueChange={(name) =>
                              setTypes((prev) => prev.map((row, i) => (i === idx ? { ...row, name } : row)))
                            }
                          />
                          <Switch
                            size="sm"
                            isSelected={t.isActive}
                            aria-label="Тип активний"
                            onValueChange={(isActive) =>
                              setTypes((prev) => prev.map((row, i) => (i === idx ? { ...row, isActive } : row)))
                            }
                          >
                            <span className="text-xs text-default-500 w-16 inline-block">
                              {t.isActive ? 'Активний' : 'Вимкнено'}
                            </span>
                          </Switch>
                          {t.id == null && (
                            <Button
                              size="sm"
                              variant="light"
                              color="danger"
                              isIconOnly
                              aria-label="Прибрати новий тип"
                              onPress={() => setTypes((prev) => prev.filter((_, i) => i !== idx))}
                            >
                              <DynamicIcon name="x" size={14} />
                            </Button>
                          )}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {dropProvided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
          <Button
            size="sm"
            variant="light"
            className="self-start"
            startContent={<DynamicIcon name="plus" size={14} />}
            onPress={() => setTypes((prev) => [...prev, { key: nextKey(), id: null, name: '', isActive: true }])}
          >
            Додати тип
          </Button>
          <p className="text-xs text-default-500">
            Збережені типи не видаляються, бо на них посилаються версії специфікацій. Вимкнений тип не
            пропонується для нових рядків, але його назва лишається в старих.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="border-b border-default-200 gap-2">
          <DynamicIcon name="sigma" size={18} className="text-default-500" />
          <h2 className="text-lg font-semibold">Формула брутто</h2>
        </CardHeader>
        <CardBody className="p-4 flex flex-col gap-3">
          <RadioGroup
            aria-label="Формула брутто"
            value={formula}
            onValueChange={(value) => setFormula(value as CatalogLossFormula)}
            classNames={CARD_RADIO_GROUP_CLASS_NAMES}
          >
            {FORMULA_OPTIONS.map((opt) => (
              <CardRadio
                key={opt.value}
                value={opt.value}
                description={
                  <span className="flex flex-col gap-1">
                    <span className="font-mono text-default-600">{opt.formula}</span>
                    <span>{opt.hint}</span>
                  </span>
                }
              >
                {opt.label}
              </CardRadio>
            ))}
          </RadioGroup>
          <p className="text-xs text-default-500">
            Приклад: картопля 171,6 кг нетто, очистка 32% і розсип 12% дають{' '}
            <span className="font-medium text-default-700 tabular-nums">{formatKg(example)} кг</span> брутто.
          </p>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button color="primary" isLoading={saving} isDisabled={!isDirty || saving} onPress={handleSave}>
          Зберегти
        </Button>
      </div>
    </div>
  );
}
