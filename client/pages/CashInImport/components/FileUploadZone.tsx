import React, { useRef, useState, useCallback } from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { Button } from '@heroui/react';

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
const ACCEPTED_MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
];

export default function FileUploadZone({ onFileSelect, isLoading }: FileUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = (file: File): boolean => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext) && !ACCEPTED_MIME.includes(file.type)) {
      setError(`Непідтримуваний формат файлу. Дозволено: ${ACCEPTED_EXTENSIONS.join(', ')}`);
      return false;
    }
    setError(null);
    return true;
  };

  const handleFile = useCallback((file: File) => {
    if (validate(file)) {
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Скидаємо input щоб можна було завантажити той самий файл повторно
    e.target.value = '';
  };

  return (
    <div className="flex flex-col items-center gap-4 py-10">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isLoading && inputRef.current?.click()}
        className={[
          'w-full max-w-xl border-2 border-dashed rounded-xl px-8 py-12',
          'flex flex-col items-center justify-center gap-3 cursor-pointer',
          'transition-colors duration-200',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-gray-300 hover:border-primary/60 hover:bg-gray-50',
          isLoading ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
      >
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <DynamicIcon name="file-spreadsheet" size={28} className="text-primary" />
        </div>

        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">
            Перетягніть файл або{' '}
            <span className="text-primary underline underline-offset-2">натисніть щоб обрати</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Підтримується: {ACCEPTED_EXTENSIONS.join(', ')}
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-primary">
            <DynamicIcon name="loader-circle" size={16} className="animate-spin" />
            Парсинг файлу…
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-danger flex items-center gap-1.5">
          <DynamicIcon name="circle-alert" size={15} />
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  );
}
