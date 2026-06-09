import { Card, Select, SelectItem, Tooltip } from '@heroui/react';
import { useDebug } from '@/contexts/DebugContext';
import { DateTimePicker } from '@/components/DateTimePicker';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useEffect, useState } from 'react';
import useWarehouseParams from './useWarehouseParams';

interface Props {
  returns: any;
  storages: any[];
  selectedStorage: string | null;
  setSelectedStorage: (v: string | null) => void;
}


export default function WarehouseDetails({ returns, storages, selectedStorage, setSelectedStorage }: Props) {
  const { isDebugMode } = useDebug();
  // useDilovodDirectories на верхньому рівні компонента (правило хуків)
  const params = useWarehouseParams({ returns, externalStorages: storages, selectedStorageProp: selectedStorage, setSelectedStorageProp: setSelectedStorage });
  const { storages: localStorages, firms: localFirms, dateForPicker, onDateChange, selectedStorageName } = params;
  // Ensure we only pass selectedKeys that actually exist in the rendered collection
  const storageSelectedKey = selectedStorage != null && localStorages?.some((ss: any) => String(ss.id) === String(selectedStorage)) ? String(selectedStorage) : '';
  const firmSelectedKey = returns.receiveFirmId != null && ((localFirms?.some((f: any) => String(f.id) === String(returns.receiveFirmId))) || (returns.availableFirms?.some((f: any) => String(f.id) === String(returns.receiveFirmId)))) ? String(returns.receiveFirmId) : '';
  const [directoriesError] = useState<string | null>(null);
  return (
    <>
    <h2 className="font-medium mb-2 mt-2">Параметри списання</h2>
    <Card className="rounded-xl bg-white mb-6 p-4">

      <div className="flex gap-4 items-end">
        <Select
          label="Склад для списання"
          labelPlacement="outside"
          value={selectedStorage ?? ''}
          isDisabled={!!directoriesError && (!localStorages || localStorages.length === 0)}
          disallowEmptySelection={true}
          onChange={(e: any) => setSelectedStorage(e.target.value || null)}
          renderValue={() => {
            const sel = localStorages.find((ss: any) => String(ss.id) === String(selectedStorage ?? ''));
            if (!sel) return '';
            return (
              <>
                {sel.name || sel.id}
                {isDebugMode && <span className="px-1.5 py-0.5 rounded bg-gray-400/10 text-gray-500 text-xs ml-2">{String(sel.id)}</span>}
              </>
            );
          }}
          selectedKeys={storageSelectedKey ? [storageSelectedKey] : []}
          classNames={{ base: 'w-full', label: 'text-xs font-medium text-gray-500!', trigger: 'w-full border border-gray-200 bg-white' }}
        >
          {(localStorages.map((s: any) => (
            <SelectItem key={String(s.id)} textValue={s.name || String(s.id)}>
              <>
                {s.name || s.id}
                {isDebugMode && (
                  <span className="px-1.5 py-0.5 rounded bg-gray-400/10 text-gray-500 text-xs ml-2">{String(s.id)}</span>
                )}
              </>
            </SelectItem>
          )) ) as any}
        </Select>

        <Select
          label="Фірма для списання"
          labelPlacement="outside"
          value={returns.receiveFirmId ?? ''}
          isDisabled={!!directoriesError && (!localFirms || localFirms.length === 0)}
          disallowEmptySelection={true}
          onChange={(e: any) => {
            const v = e.target.value || null;
            returns.setReceiveFirmId?.(v);
            const f = localFirms?.find((x: any) => x.id === v) || returns.availableFirms?.find((x: any) => x.id === v);
            returns.setReceiveFirmName?.(f?.name || '');
          }}
          selectedKeys={firmSelectedKey ? [firmSelectedKey] : []}
          renderValue={() => {
            const sel = localFirms?.find((ff: any) => String(ff.id) === String(returns.receiveFirmId ?? '')) || returns.availableFirms?.find((ff: any) => String(ff.id) === String(returns.receiveFirmId ?? ''));
            if (!sel) return '';
            return (
              <>
                {sel.name}
                {isDebugMode && <span className="px-1.5 py-0.5 rounded bg-gray-400/10 text-gray-500 text-xs ml-2">{String(sel.id)}</span>}
              </>
            );
          }}
          classNames={{ base: 'w-full', label: 'text-xs font-medium text-gray-500!', trigger: 'w-full border border-gray-200 bg-white' }}
        >
          {(localFirms?.map((f: any) => (
            <SelectItem key={String(f.id)} textValue={f.name}>
              <>
                {f.name}
                {isDebugMode && (
                  <span className="px-1.5 py-0.5 rounded bg-gray-400/10 text-gray-500 text-xs ml-2">{String(f.id)}</span>
                )}
              </>
            </SelectItem>
          )) ) as any}
        </Select>
        {directoriesError && (!localStorages || localStorages.length === 0 || !localFirms || localFirms.length === 0) && (
          <div className="text-sm text-red-600 mt-2">Не вистачає прав для завантаження довідників Dilovod. Зверніться до адміністратора.</div>
        )}
        <DateTimePicker
          value={dateForPicker}
          onChange={onDateChange}
          labelPlacement="outside"
          label={<span className="flex gap-1">Дата списання <Tooltip content="Уважно оберіть дату та час списання, це вплине на облік товарів на складі" color="primary" className="max-w-80"><DynamicIcon name="info" size={14} className="text-red-500" /></Tooltip></span>}
          size="md"
          labelStyle="text-xs font-medium text-gray-500"
          inputStyle="border border-gray-200 bg-white hover:bg-gray-100 focus-within:bg-gray-100"
          isDisabled={returns.isSubmitting}
        />
      </div>
    </Card>
    </>
  );
}
