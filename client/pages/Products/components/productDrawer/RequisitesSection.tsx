import { Button, Input, Autocomplete, AutocompleteItem, Select, SelectItem, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatCatalogName, type CatalogFolderOption } from '../../ProductsUtils';
import type { CatalogDictItemDto } from '../../ProductsTypes';
import type { DrawerForm, DrawerObjectKind } from './productDrawerTypes';
import { OBJECT_KIND_TABS } from './productDrawerTypes';

interface RequisitesSectionProps {
  form: DrawerForm;
  objectKind: DrawerObjectKind | null;
  isCreate: boolean;
  isGood: boolean;
  isKit: boolean;
  isOther: boolean;
  showPrintName: boolean;
  nameHasWeight: boolean;
  skuGenerating: boolean;
  saving?: boolean;
  otherAccPolicies: CatalogDictItemDto[];
  folderOptions: CatalogFolderOption[];
  selectedFolderId: string;
  onFolderChange: (id: string) => void;
  onFormChange: (patch: Partial<DrawerForm> | ((prev: DrawerForm) => DrawerForm)) => void;
  onShowPrintNameToggle: () => void;
  onObjectKindChange: (key: DrawerObjectKind) => void;
  onOtherAccPolicyChange: (id: string) => void;
  onGenerateSku: () => void;
}

export function RequisitesSection({
  form,
  objectKind,
  isCreate,
  isGood,
  isKit,
  isOther,
  showPrintName,
  nameHasWeight,
  skuGenerating,
  saving,
  otherAccPolicies,
  folderOptions,
  selectedFolderId,
  onFolderChange,
  onFormChange,
  onShowPrintNameToggle,
  onObjectKindChange,
  onOtherAccPolicyChange,
  onGenerateSku,
}: RequisitesSectionProps) {
  const patchForm = (patch: Partial<DrawerForm>) => {
    onFormChange((f) => ({ ...f, ...patch }));
  };

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-1">
        <DynamicIcon name="receipt-text" size={14} />
        <span>Реквізити</span>
      </h3>
      {isCreate && (
        <Autocomplete
          label="Група"
          placeholder="Оберіть групу"
          isRequired
          selectedKey={selectedFolderId || null}
          items={folderOptions}
          allowsCustomValue={false}
          isClearable={false}
          isDisabled={saving}
          menuTrigger="focus"
          classNames={{ popoverContent: 'bg-default-100' }}
          onSelectionChange={(key) => {
            if (key == null) return;
            onFolderChange(String(key));
          }}
        >
          {(folder) => (
            <AutocompleteItem key={folder.id} textValue={folder.path}>
              <div
                className="flex items-center gap-2"
                style={{ paddingLeft: folder.depth * 12 }}
              >
                <DynamicIcon name="folder" size={16} className="shrink-0 text-default-500" />
                <span>{folder.name}</span>
              </div>
            </AutocompleteItem>
          )}
        </Autocomplete>
      )}
      <Input
        label="Назва"
        value={form.name}
        onValueChange={(v) => patchForm({ name: formatCatalogName(v) })}
        onBlur={() => onFormChange((f) => ({ ...f, name: formatCatalogName(f.name).trim() }))}
        endContent={
          <Tooltip
            content="Додати назву для друку"
            color="secondary"
            placement="top-end"
            showArrow={true}
            delay={200}
            classNames={{ base: 'before:rounded-[3px] before:z-[10]', content: 'rounded-sm' }}
          >
            <Button
              isIconOnly
              size="sm"
              variant="light"
              color="default"
              aria-label="Назва для друку"
              className={
                showPrintName
                  ? 'shadow-inner-sm ' +
                    (form.printName.length > 3
                      ? 'text-blue-600/75 bg-blue-600/10'
                      : 'text-default-500 bg-default-200/75')
                  : 'text-default-500 hover:text-default-600'
              }
              onPress={onShowPrintNameToggle}
            >
              {showPrintName ? (
                <DynamicIcon name="printer-check" size={16} />
              ) : (
                <DynamicIcon name="printer" size={16} />
              )}
            </Button>
          </Tooltip>
        }
        isRequired
        classNames={{
          description: nameHasWeight ? 'text-warning-700' : undefined,
        }}
        description={
          nameHasWeight
            ? 'У назві вказана вага – для неї є окреме поле «Вага, кг»'
            : undefined
        }
      />
      {showPrintName && (
        <Input
          label="Назва для друку"
          value={form.printName}
          onValueChange={(v) => patchForm({ printName: v })}
        />
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Select
          label="Тип обʼєкта"
          placeholder="Оберіть тип"
          isRequired
          selectedKeys={objectKind ? [objectKind] : []}
          classNames={{
            popoverContent: 'bg-default-100 w-auto min-w-max',
          }}
          onSelectionChange={(keys) => {
            const v = Array.from(keys)[0];
            if (!v) return;
            onObjectKindChange(String(v) as DrawerObjectKind);
          }}
          renderValue={(items) => {
            const key = items[0]?.key;
            const tab = OBJECT_KIND_TABS.find((t) => t.key === String(key));
            if (!tab) return null;
            return (
              <div className="flex items-center gap-2">
                <DynamicIcon name={tab.icon} size={16} className="shrink-0" />
                {tab.title}
              </div>
            );
          }}
        >
          {OBJECT_KIND_TABS.map((tab) => (
            <SelectItem key={tab.key} textValue={tab.title}>
              <div className="flex items-center gap-2">
                <DynamicIcon name={tab.icon} size={16} className="shrink-0" />
                {tab.title}
              </div>
            </SelectItem>
          ))}
        </Select>
        {isOther && (
          <Select
            label="Політика обліку"
            selectedKeys={form.accPolicyId ? [form.accPolicyId] : []}
            classNames={{ popoverContent: 'bg-default-100' }}
            onSelectionChange={(keys) => {
              const v = Array.from(keys)[0];
              if (!v) return;
              onOtherAccPolicyChange(String(v));
            }}
            description={
              otherAccPolicies.length === 0
                ? 'Немає інших типів у довіднику accPolicies'
                : undefined
            }
          >
            {otherAccPolicies.map((p) => (
              <SelectItem key={p.id}>{p.name}</SelectItem>
            ))}
          </Select>
        )}
        <Input
          label="SKU (артикул)"
          value={form.sku}
          isRequired={isGood || isKit}
          onValueChange={(v) => patchForm({ sku: v })}
          endContent={
            <Tooltip
              content="Згенерувати SKU автоматично"
              color="default"
              placement="top-end"
              showArrow={true}
              delay={200}
              classNames={{
                base: 'before:rounded-[3px] before:bg-blue-500 before:z-[10]',
                content: 'bg-blue-500 text-white rounded-sm',
              }}
            >
              <Button
                isIconOnly
                size="sm"
                variant="light"
                color="default"
                className={`text-default-500 hover:text-blue-600/75 hover:bg-blue-600/10!`}
                aria-label="Генерація SKU"
                onPress={onGenerateSku}
                isLoading={skuGenerating}
                isDisabled={saving}
              >
                <DynamicIcon name="dices" size={16} />
              </Button>
            </Tooltip>
          }
        />
      </div>
    </section>
  );
}
