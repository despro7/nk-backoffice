import { Card, Select, SelectItem, Tooltip } from '@heroui/react';
import { useDebug } from '@/contexts/DebugContext';
import { DateTimePicker } from '@/components/DateTimePicker';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useEffect, useState } from 'react';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';

interface Props {
  returns: any;
  storages: any[];
  selectedStorage: string | null;
  setSelectedStorage: (v: string | null) => void;
}


export default function WarehouseDetails({ returns, storages, selectedStorage, setSelectedStorage }: Props) {
  const { isDebugMode } = useDebug();
  // useDilovodDirectories на верхньому рівні компонента (правило хуків)
  const dirsCtx = useDilovodDirectories();
  const [localFirms, setLocalFirms] = useState<Array<{ id: string; name: string }>>(returns.availableFirms || []);
  const [localStorages, setLocalStorages] = useState<any[]>(storages || []);
  const [directoriesError] = useState<string | null>(null);

  useEffect(() => {
    if (returns.availableFirms && returns.availableFirms.length > 0) setLocalFirms(returns.availableFirms);
  }, [returns.availableFirms]);

  useEffect(() => {
    if (Array.isArray(storages) && storages.length > 0) setLocalStorages(storages);
  }, [storages]);

  // Ініціює завантаження при монтуванні через централізований провайдер
  useEffect(() => { void dirsCtx.loadDirectories(); }, []);

  // Синхронізує локальні firms/storages щоразу, коли провайдер оновлює дані
  useEffect(() => {
    const d = dirsCtx.directories;
    if (!d) return;
    if (Array.isArray(d.storages) && d.storages.length > 0) setLocalStorages(d.storages);
    if (Array.isArray(d.firms) && d.firms.length > 0) {
      setLocalFirms(d.firms.map((f: any) => ({ id: f.id, name: f.name })));
    }
  }, [dirsCtx.directories]);
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
            const sel = localStorages.find((ss: any) => String(ss.id ?? ss.good_id) === String(selectedStorage ?? ''));
            if (!sel) return '(за замовчуванням)';
            return (
              <>
                {sel.name || sel.storageDisplayName || sel.storage || sel.id}
                {isDebugMode && <span className="px-1.5 py-0.5 rounded bg-gray-400/10 text-gray-500 text-xs ml-2">{String(sel.id ?? sel.good_id)}</span>}
              </>
            );
          }}
          selectedKeys={[selectedStorage ?? '']}
          classNames={{ base: 'w-full', label: 'text-xs font-medium text-gray-500!', trigger: 'w-full border border-gray-200 bg-white' }}
        >
          <SelectItem key="" textValue="(за замовчуванням)">(за замовчуванням)</SelectItem>
          {(localStorages.map((s: any) => (
            <SelectItem key={String(s.id ?? s.good_id)} textValue={s.name || s.storageDisplayName || s.storage || String(s.id)}>
              <>
                {s.name || s.storageDisplayName || s.storage || s.id}
                {isDebugMode && (
                  <span className="px-1.5 py-0.5 rounded bg-gray-400/10 text-gray-500 text-xs ml-2">{String(s.id ?? s.good_id)}</span>
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
          selectedKeys={[returns.receiveFirmId ?? '']}
          renderValue={() => {
            const sel = localFirms?.find((ff: any) => String(ff.id) === String(returns.receiveFirmId ?? '')) || returns.availableFirms?.find((ff: any) => String(ff.id) === String(returns.receiveFirmId ?? ''));
            if (!sel) return '(за замовчуванням)';
            return (
              <>
                {sel.name}
                {isDebugMode && <span className="px-1.5 py-0.5 rounded bg-gray-400/10 text-gray-500 text-xs ml-2">{String(sel.id)}</span>}
              </>
            );
          }}
          classNames={{ base: 'w-full', label: 'text-xs font-medium text-gray-500!', trigger: 'w-full border border-gray-200 bg-white' }}
        >
          <SelectItem key="" textValue="(за замовчуванням)">(за замовчуванням)</SelectItem>
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
          value={(() => {
            const s = returns.returnDate;
            if (!s) return new Date();
            try {
              if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
                const [datePart, timePart] = s.split(' ');
                const [y, m, d] = datePart.split('-').map(Number);
                const [hh, mm, ss] = timePart.split(':').map(Number);
                return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0);
              }
              const parsed = new Date(s);
              if (!Number.isNaN(parsed.getTime())) return parsed;
            } catch (e) {
              // ignore
            }
            return new Date();
          })()}
          onChange={(d) => {
            const pad = (n: number) => String(n).padStart(2, '0');
            const formatted = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
            returns.setReturnDate?.(formatted);
          }}
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
