import { useEffect, useState } from 'react';
import {
  Button,
  Divider,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Input,
  Select,
  SelectItem,
  Spinner,
  Textarea,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type {
  CatalogCreateGoodInput,
  CatalogGoodDetailDto,
  CatalogUnitDto,
  CatalogUpdateGoodInput,
  DrawerMode,
} from '../ProductsTypes';
import {
  CATALOG_ACC_POLICY_GOOD,
  CATALOG_ACC_POLICY_KIT,
  CATALOG_DEFAULT_MAIN_UNIT_ID,
  CATALOG_ROOT_ID,
} from '../ProductsTypes';
import { formatStock } from '../ProductsUtils';

interface ProductDrawerProps {
  mode: DrawerMode;
  parentFolderId: string;
  detail: CatalogGoodDetailDto | null;
  detailLoading?: boolean;
  units: CatalogUnitDto[];
  saving?: boolean;
  onClose: () => void;
  onCreate: (input: CatalogCreateGoodInput) => void;
  onUpdate: (id: string, input: CatalogUpdateGoodInput) => void;
  catalogSearch: (q: string) => Promise<Array<{ id: string; name: string; sku: string | null }>>;
}

interface BomRow {
  componentGoodId: string;
  componentName: string;
  componentSku: string | null;
  qty: number;
}

interface PriceRow {
  priceType: string;
  price: number;
  currency: string;
}

interface BarcodeRow {
  code: string;
  activity: boolean;
  /** Dilovod goodPart id */
  goodPart: string;
  /** Номер/назва партії для відображення */
  goodPartName: string;
}

const emptyForm = {
  name: '',
  sku: '',
  mainUnitId: CATALOG_DEFAULT_MAIN_UNIT_ID,
  packageRatio: '',
  weight: '',
  printName: '',
  description: '',
  isKit: false,
};

export function ProductDrawer({
  mode,
  parentFolderId,
  detail,
  detailLoading,
  units,
  saving,
  onClose,
  onCreate,
  onUpdate,
  catalogSearch,
}: ProductDrawerProps) {
  const open = mode != null;
  const isFolder = mode === 'create-folder' || Boolean(detail?.isGroup);
  const isEdit = mode === 'edit';

  const [form, setForm] = useState(emptyForm);
  const [components, setComponents] = useState<BomRow[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [barcodes, setBarcodes] = useState<BarcodeRow[]>([]);
  const [bomQuery, setBomQuery] = useState('');
  const [bomSuggestions, setBomSuggestions] = useState<Array<{ id: string; name: string; sku: string | null }>>([]);

  useEffect(() => {
    if (!open) return;
    if (isEdit && detail) {
      setForm({
        name: detail.name || '',
        sku: detail.sku || '',
        mainUnitId: detail.mainUnitId || CATALOG_DEFAULT_MAIN_UNIT_ID,
        packageRatio: detail.packageRatio != null ? String(detail.packageRatio) : '',
        weight: detail.weight != null ? String(detail.weight) : '',
        printName: detail.printName || '',
        description: detail.description || '',
        isKit: Boolean(detail.isKit),
      });
      setComponents(
        detail.components.map((c) => ({
          componentGoodId: c.componentGoodId,
          componentName: c.componentName || c.componentGoodId,
          componentSku: c.componentSku ?? null,
          qty: c.qty,
        }))
      );
      setPrices(
        detail.prices.map((p) => ({
          priceType: p.priceType,
          price: p.price,
          currency: p.currency || 'UAH',
        }))
      );
      setBarcodes(
        detail.barcodes.map((b) => ({
          code: b.code,
          activity: b.activity,
          goodPart: b.goodPart || '',
          goodPartName: b.goodPartName || '',
        }))
      );
    } else {
      setForm({ ...emptyForm, isKit: false });
      setComponents([]);
      setPrices([]);
      setBarcodes([]);
    }
  }, [open, isEdit, detail]);

  useEffect(() => {
    if (bomQuery.trim().length < 2) {
      setBomSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void catalogSearch(bomQuery.trim()).then((rows) => {
        if (!cancelled) setBomSuggestions(rows.filter((r) => !r.id.startsWith('folder')));
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [bomQuery, catalogSearch]);

  const title =
    mode === 'create'
      ? 'Новий товар'
      : mode === 'create-folder'
        ? 'Нова папка'
        : isFolder
          ? 'Папка'
          : 'Товар';

  const handleSave = () => {
    const name = form.name.trim();
    if (!name) return;

    const parentId =
      parentFolderId === CATALOG_ROOT_ID ? null : parentFolderId;

    const packageRatio = form.packageRatio ? parseFloat(form.packageRatio) : null;
    const weight = form.weight ? parseFloat(form.weight) : null;
    const accPolicyId = form.isKit || components.length > 0
      ? CATALOG_ACC_POLICY_KIT
      : CATALOG_ACC_POLICY_GOOD;

    if (isEdit && detail) {
      const input: CatalogUpdateGoodInput = {
        name,
        parentId: detail.parentId,
        sku: isFolder ? null : form.sku.trim() || null,
        mainUnitId: form.mainUnitId,
        packageRatio,
        weight,
        printName: form.printName.trim() || null,
        description: form.description.trim() || null,
        accPolicyId,
      };
      if (!isFolder) {
        input.components = components.map((c, idx) => ({
          componentGoodId: c.componentGoodId,
          qty: c.qty,
          rowNum: idx + 1,
        }));
        input.prices = prices.map((p) => ({
          priceType: p.priceType,
          price: p.price,
          currency: p.currency,
        }));
        input.barcodes = barcodes
          .filter((b) => b.code.trim())
          .map((b) => ({
            code: b.code.trim(),
            activity: b.activity,
            goodPart: b.goodPart.trim() || null,
            goodPartName: b.goodPartName.trim() || null,
          }));
      }
      onUpdate(detail.id, input);
      return;
    }

    const input: CatalogCreateGoodInput = {
      name,
      parentId,
      isGroup: isFolder,
      sku: isFolder ? null : form.sku.trim() || null,
      mainUnitId: form.mainUnitId,
      packageRatio,
      weight,
      printName: form.printName.trim() || null,
      description: form.description.trim() || null,
      accPolicyId,
    };
    if (!isFolder) {
      input.components = components.map((c, idx) => ({
        componentGoodId: c.componentGoodId,
        qty: c.qty,
        rowNum: idx + 1,
      }));
      input.prices = prices.map((p) => ({
        priceType: p.priceType,
        price: p.price,
        currency: p.currency,
      }));
      input.barcodes = barcodes
        .filter((b) => b.code.trim())
        .map((b) => ({
          code: b.code.trim(),
          activity: b.activity,
          goodPart: b.goodPart.trim() || null,
          goodPartName: b.goodPartName.trim() || null,
        }));
    }
    onCreate(input);
  };

  return (
    <Drawer isOpen={open} onClose={onClose} size="2xl" placement="right">
      <DrawerContent>
        <DrawerHeader className="flex flex-col gap-1">
          <span>{title}</span>
          {isEdit && detail?.sku && (
            <span className="text-xs font-normal text-default-500">SKU: {detail.sku}</span>
          )}
        </DrawerHeader>
        <DrawerBody className="gap-4">
          {isEdit && detailLoading ? (
            <div className="flex justify-center py-10">
              <Spinner label="Завантаження картки…" />
            </div>
          ) : (
            <>
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Основне</h3>
                <Input
                  label="Назва"
                  value={form.name}
                  onValueChange={(v) => setForm((f) => ({ ...f, name: v }))}
                  isRequired
                />
                {!isFolder && (
                  <Input
                    label="SKU (артикул)"
                    value={form.sku}
                    onValueChange={(v) => setForm((f) => ({ ...f, sku: v }))}
                    description="Порожнє = авто-виділення"
                  />
                )}
                <Input
                  label="Назва для друку"
                  value={form.printName}
                  onValueChange={(v) => setForm((f) => ({ ...f, printName: v }))}
                />
                <Textarea
                  label="Опис"
                  value={form.description}
                  onValueChange={(v) => setForm((f) => ({ ...f, description: v }))}
                  minRows={2}
                />
              </section>

              {!isFolder && (
                <>
                  <Divider />
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold">Упаковка</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <Select
                        label="Од. виміру"
                        selectedKeys={form.mainUnitId ? [form.mainUnitId] : []}
                        onSelectionChange={(keys) => {
                          const v = Array.from(keys)[0];
                          if (v) setForm((f) => ({ ...f, mainUnitId: String(v) }));
                        }}
                      >
                        {(units.length
                          ? units
                          : [{ id: CATALOG_DEFAULT_MAIN_UNIT_ID, name: 'шт.' }]
                        ).map((u) => (
                          <SelectItem key={u.id}>{u.name}</SelectItem>
                        ))}
                      </Select>
                      <Input
                        label="Порцій у коробці"
                        type="number"
                        value={form.packageRatio}
                        onValueChange={(v) => setForm((f) => ({ ...f, packageRatio: v }))}
                      />
                      <Input
                        label="Вага"
                        type="number"
                        value={form.weight}
                        onValueChange={(v) => setForm((f) => ({ ...f, weight: v }))}
                      />
                    </div>
                  </section>

                  <Divider />
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Склад комплекту (BOM)</h3>
                      <Button
                        size="sm"
                        variant="light"
                        onPress={() => setForm((f) => ({ ...f, isKit: !f.isKit }))}
                      >
                        {form.isKit || components.length > 0 ? 'Комплект' : 'Звичайний'}
                      </Button>
                    </div>
                    <Input
                      label="Додати компонент"
                      placeholder="Пошук товару…"
                      value={bomQuery}
                      onValueChange={setBomQuery}
                      startContent={<DynamicIcon name="search" size={14} />}
                    />
                    {bomSuggestions.length > 0 && (
                      <div className="max-h-36 overflow-auto rounded-md border border-default-200">
                        {bomSuggestions.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-default-100"
                            onClick={() => {
                              if (components.some((c) => c.componentGoodId === s.id)) return;
                              setComponents((prev) => [
                                ...prev,
                                {
                                  componentGoodId: s.id,
                                  componentName: s.name,
                                  componentSku: s.sku,
                                  qty: 1,
                                },
                              ]);
                              setBomQuery('');
                              setBomSuggestions([]);
                              setForm((f) => ({ ...f, isKit: true }));
                            }}
                          >
                            <span>{s.name}</span>
                            <span className="font-mono text-xs text-default-400">{s.sku}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {components.map((c, idx) => (
                      <div key={c.componentGoodId} className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{c.componentName}</div>
                          <div className="font-mono text-xs text-default-400">{c.componentSku}</div>
                        </div>
                        <Input
                          aria-label="Кількість"
                          type="number"
                          className="w-24"
                          size="sm"
                          value={String(c.qty)}
                          onValueChange={(v) => {
                            const qty = parseFloat(v) || 0;
                            setComponents((prev) =>
                              prev.map((row, i) => (i === idx ? { ...row, qty } : row))
                            );
                          }}
                        />
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          color="danger"
                          aria-label="Видалити компонент"
                          onPress={() =>
                            setComponents((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          <DynamicIcon name="x" size={14} />
                        </Button>
                      </div>
                    ))}
                  </section>

                  <Divider />
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Ціни</h3>
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() =>
                          setPrices((prev) => [
                            ...prev,
                            { priceType: '', price: 0, currency: 'UAH' },
                          ])
                        }
                      >
                        Додати
                      </Button>
                    </div>
                    {prices.map((p, idx) => (
                      <div key={idx} className="grid grid-cols-[1fr_100px_80px_auto] gap-2">
                        <Input
                          size="sm"
                          label="Тип ціни (id)"
                          value={p.priceType}
                          onValueChange={(v) =>
                            setPrices((prev) =>
                              prev.map((row, i) => (i === idx ? { ...row, priceType: v } : row))
                            )
                          }
                        />
                        <Input
                          size="sm"
                          label="Ціна"
                          type="number"
                          value={String(p.price)}
                          onValueChange={(v) =>
                            setPrices((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, price: parseFloat(v) || 0 } : row
                              )
                            )
                          }
                        />
                        <Input
                          size="sm"
                          label="Вал."
                          value={p.currency}
                          onValueChange={(v) =>
                            setPrices((prev) =>
                              prev.map((row, i) => (i === idx ? { ...row, currency: v } : row))
                            )
                          }
                        />
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          color="danger"
                          className="mt-4"
                          aria-label="Видалити ціну"
                          onPress={() => setPrices((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <DynamicIcon name="x" size={14} />
                        </Button>
                      </div>
                    ))}
                  </section>

                  <Divider />
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Штрихкоди</h3>
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() =>
                          setBarcodes((prev) => [
                            ...prev,
                            { code: '', activity: true, goodPart: '', goodPartName: '' },
                          ])
                        }
                      >
                        Додати
                      </Button>
                    </div>
                    {barcodes.map((b, idx) => (
                      <div key={idx} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                        <Input
                          size="sm"
                          label="Код"
                          className="flex-1"
                          value={b.code}
                          onValueChange={(v) =>
                            setBarcodes((prev) =>
                              prev.map((row, i) => (i === idx ? { ...row, code: v } : row))
                            )
                          }
                        />
                        <Input
                          size="sm"
                          label="Партія (ID)"
                          className="flex-1"
                          description="Dilovod goodPart"
                          value={b.goodPart}
                          onValueChange={(v) =>
                            setBarcodes((prev) =>
                              prev.map((row, i) => (i === idx ? { ...row, goodPart: v } : row))
                            )
                          }
                        />
                        <Input
                          size="sm"
                          label="Номер партії"
                          className="flex-1"
                          value={b.goodPartName}
                          onValueChange={(v) =>
                            setBarcodes((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, goodPartName: v } : row
                              )
                            )
                          }
                        />
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          color="danger"
                          className="mt-4 shrink-0"
                          aria-label="Видалити ШК"
                          onPress={() => setBarcodes((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <DynamicIcon name="x" size={14} />
                        </Button>
                      </div>
                    ))}
                  </section>

                  <Divider />
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">Залишки (лише читання)</h3>
                    {detail?.stock ? (
                      <p className="text-sm text-default-600">
                        Основний / Малий: {formatStock(detail.stock.mainStock, detail.stock.smallStock)}
                      </p>
                    ) : (
                      <p className="text-sm text-default-400">Немає даних у legacy products</p>
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </DrawerBody>
        <DrawerFooter>
          <Button variant="light" onPress={onClose} isDisabled={saving}>
            Скасувати
          </Button>
          <Button color="primary" onPress={handleSave} isLoading={saving}>
            Зберегти
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
