import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Chip,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { LabelTemplateGoodOverrideLink } from '@shared/types/labelTemplate';
import type { LabelTemplateAudience } from '@shared/types/labelTemplate';
import type { ProductLabelKind } from '@shared/types/productLabel';
import { LABEL_TEMPLATE_AUDIENCE_LABEL, LABEL_TEMPLATE_KIND_LABEL } from './labelTemplateUi';
import { LabelTemplateService } from '@/services/LabelTemplateService';
import { ProductLabelService } from '@/services/ProductLabelService';
import { ToastService } from '@/services/ToastService';


type LabelTemplateGoodOverridesTableProps = {
  templateId: string;
  onOpenGood: (goodId: string) => void;
  onChanged?: () => void;
  onCountChange?: (count: number) => void;
};

export function LabelTemplateGoodOverridesTable({
  templateId,
  onOpenGood,
  onChanged,
  onCountChange,
}: LabelTemplateGoodOverridesTableProps) {
  const [rows, setRows] = useState<LabelTemplateGoodOverrideLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [unlinkingKey, setUnlinkingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await LabelTemplateService.listGoodOverrides(templateId);
      setRows(data);
      onCountChange?.(data.length);
    } catch (err) {
      ToastService.show({
        title: 'Привʼязки товарів',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
      setRows([]);
      onCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [templateId, onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUnlink = async (row: LabelTemplateGoodOverrideLink) => {
    const key = `${row.goodId}:${row.labelKind}`;
    setUnlinkingKey(key);
    try {
      await ProductLabelService.setTemplateOverride(row.goodId, row.labelKind, null);
      await load();
      onChanged?.();
      ToastService.show({
        title: 'Привʼязку знято',
        description: `«${row.name}» — ${LABEL_TEMPLATE_KIND_LABEL[row.labelKind]}`,
        color: 'success',
      });
    } catch (err) {
      ToastService.show({
        title: 'Не вдалося відвʼязати',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setUnlinkingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-default-500">
        <Spinner size="sm" />
        Завантаження привʼязок…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="py-2 text-sm text-default-500">
        Немає товарів з прямим override цього шаблону на картці.
      </p>
    );
  }

  return (
    <Table
      aria-label="Товари з override шаблону наліпки"
      removeWrapper
      classNames={{
        th: 'bg-default-100 text-default-600 text-xs',
        td: 'text-sm',
      }}
    >
      <TableHeader>
        <TableColumn>Товар</TableColumn>
        <TableColumn>SKU</TableColumn>
        <TableColumn width={120}>Аудиторія</TableColumn>
        <TableColumn width={100}>Слот</TableColumn>
        <TableColumn width={88} align="end">Дії</TableColumn>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const rowKey = `${row.goodId}:${row.labelKind}`;
          const busy = unlinkingKey === rowKey;
          return (
            <TableRow key={rowKey}>
              <TableCell>
                <Button
                  variant="light"
                  // size="sm"
                  className="h-auto min-h-0 min-w-0 max-w-full justify-start px-2 py-1 -mx-2 font-normal rounded-sm text-gray-900"
                  onPress={() => onOpenGood(row.goodId)}
                >
                  <span className="truncate text-left">{row.name}</span>
                </Button>
              </TableCell>
              <TableCell>
                <span className="font-mono text-sm text-default-600">{row.sku || '—'}</span>
              </TableCell>
              <TableCell>
                <Chip size="sm" variant="flat">
                  {LABEL_TEMPLATE_AUDIENCE_LABEL[row.audience as LabelTemplateAudience]}
                </Chip>
              </TableCell>
              <TableCell>
                <Chip size="sm" variant="flat">{LABEL_TEMPLATE_KIND_LABEL[row.labelKind]}</Chip>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Tooltip content="Відкрити картку товару" placement="top">
                    <Button
                      size="sm"
                      variant="light"
                      isIconOnly
                      className="text-blue-600"
                      aria-label="Відкрити картку товару"
                      onPress={() => onOpenGood(row.goodId)}
                    >
                      <DynamicIcon name="panel-right-open" size={16} />
                    </Button>
                  </Tooltip>
                  <Tooltip content="Відвʼязати шаблон від товару" placement="top">
                    <Button
                      size="sm"
                      variant="light"
                      isIconOnly
                      color="danger"
                      className="text-rose-600"
                      aria-label="Відвʼязати шаблон від товару"
                      isLoading={busy}
                      isDisabled={unlinkingKey != null && !busy}
                      onPress={() => void handleUnlink(row)}
                    >
                      {!busy ? <DynamicIcon name="unlink" size={16} /> : null}
                    </Button>
                  </Tooltip>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
