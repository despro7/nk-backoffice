import { useRef, useState } from 'react';
import {
  Button,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import {
  HR_PAY_GROUP_LABELS,
  type HrXlsxImportCommitDto,
  type HrXlsxImportPreviewDto,
} from '@shared/types/hr';

interface TimesheetImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

async function postFile(url: string, file: File): Promise<{ ok: boolean; data: unknown; message: string }> {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch(url, { method: 'POST', credentials: 'include', body });
  const json = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    data: json.data,
    message: json.message || json.error || 'Помилка імпорту',
  };
}

export function TimesheetImportModal({ isOpen, onClose, onImported }: TimesheetImportModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<HrXlsxImportPreviewDto | null>(null);
  const [result, setResult] = useState<HrXlsxImportCommitDto | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleClose = () => {
    if (loading) return;
    reset();
    onClose();
  };

  const runPreview = async (nextFile: File) => {
    setLoading(true);
    setResult(null);
    try {
      const response = await postFile('/api/hr/import/preview', nextFile);
      if (!response.ok) {
        ToastService.show({ title: response.message, color: 'danger' });
        return;
      }
      setPreview(response.data as HrXlsxImportPreviewDto);
    } finally {
      setLoading(false);
    }
  };

  const runCommit = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const response = await postFile('/api/hr/import/commit', file);
      if (!response.ok) {
        ToastService.show({ title: response.message, color: 'danger' });
        return;
      }
      const data = response.data as HrXlsxImportCommitDto;
      setResult(data);
      ToastService.show({
        title: `Імпорт завершено: ${data.createdEmployees} нових співробітників, ${data.upsertedEntries} клітинок табеля`,
        color: 'success',
      });
      onImported();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="2xl" scrollBehavior="inside" isDismissable={!loading}>
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-lg font-semibold">
          <DynamicIcon name="file-spreadsheet" size={18} />
          Імпорт табеля Excel
        </ModalHeader>
        <ModalBody className="space-y-4">
          <p className="text-sm text-gray-600">
            Історичне завантаження «Табель 2026». Внутрішній калькулятор, не податковий облік. Повторний імпорт
            оновлює ті самі людей за ключем прізвище|імʼя|по-батькові і не створює дублікати.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block w-full text-sm"
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setFile(next);
              setPreview(null);
              setResult(null);
              if (next) void runPreview(next);
            }}
          />
          {preview ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Chip size="sm" variant="flat">Людей: {preview.counts.employees}</Chip>
                <Chip size="sm" variant="flat">Зайнятостей: {preview.counts.employments}</Chip>
                <Chip size="sm" variant="flat">Клітинок: {preview.counts.entries}</Chip>
                <Chip size="sm" variant="flat">Ставок: {preview.counts.payTerms}</Chip>
                <Chip size="sm" variant="flat" color="warning">Пропусків: {preview.counts.skippedRows}</Chip>
              </div>
              <div className="max-h-56 overflow-auto rounded-lg border border-gray-200 text-sm">
                {preview.employees.slice(0, 40).map((person) => (
                  <div key={person.employeeKey} className="flex flex-wrap gap-x-3 gap-y-1 border-b border-gray-100 px-3 py-2">
                    <span className="font-medium">{person.displayName}</span>
                    <span className="text-gray-500 font-mono text-xs">{person.cardMasked || 'картка —'}</span>
                    <span className="text-gray-500 text-xs">{person.months.join(', ')}</span>
                    <span className="text-gray-500 text-xs">
                      {person.payGroups.map((group) => HR_PAY_GROUP_LABELS[group]).join(', ')}
                    </span>
                  </div>
                ))}
              </div>
              {preview.warnings.length > 0 ? (
                <p className="text-xs text-amber-700">
                  {preview.warnings.slice(0, 5).join(' · ')}
                  {preview.warnings.length > 5 ? ` · ще ${preview.warnings.length - 5}` : ''}
                </p>
              ) : null}
              {result ? (
                <p className="text-sm text-emerald-700">
                  Записано: +{result.createdEmployees} людей, {result.reusedEmployments} зайнятостей повторно,
                  {result.upsertedEntries} клітинок.
                  {result.skippedClosedMonths.length
                    ? ` Пропущено закриті місяці: ${result.skippedClosedMonths.join(', ')}.`
                    : ''}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Оберіть .xlsx, щоб побачити попередній перегляд.</p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={handleClose} isDisabled={loading}>
            Закрити
          </Button>
          <Button
            color="primary"
            onPress={() => void runCommit()}
            isLoading={loading}
            isDisabled={!file || !preview || Boolean(result)}
          >
            Записати в базу
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
