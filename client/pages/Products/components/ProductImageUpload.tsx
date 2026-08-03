/**
 * Dropzone + preview queue для локальних зображень каталогу.
 * Патерн натхненний beUI file-upload; стилізація HeroUI.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Chip, Progress, Spinner } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import type { CatalogGoodImageDto } from '../ProductsTypes';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
const ACCEPT_SET = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 10;

type QueueStatus = 'queued' | 'uploading' | 'success' | 'error';

interface QueueItem {
  localId: string;
  file: File;
  previewUrl: string;
  status: QueueStatus;
  progress: number;
  error?: string;
  /** Після успішного staging — імʼя файлу на сервері */
  stagingFileName?: string;
  /** Після успішного upload до good — id у БД */
  savedId?: number;
}

export interface ProductImageUploadProps {
  goodId?: string | null;
  stagingSessionId?: string | null;
  /** Збережені зображення з detail (edit) */
  images?: CatalogGoodImageDto[];
  isDisabled?: boolean;
  onImagesChange?: (images: CatalogGoodImageDto[]) => void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exp).toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}

async function uploadFiles(
  url: string,
  files: File[]
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  const res = await fetch(url, { method: 'POST', credentials: 'include', body: form });
  const json = (await res.json()) as { success?: boolean; data?: unknown; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Помилка завантаження (${res.status})`);
  }
  return { success: true, data: json.data, error: json.error };
}

export function ProductImageUpload({
  goodId,
  stagingSessionId,
  images = [],
  isDisabled,
  onImagesChange,
}: ProductImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [saved, setSaved] = useState<CatalogGoodImageDto[]>(images);
  const [stagingItems, setStagingItems] = useState<
    Array<{
      id: string;
      fileName: string;
      originalName: string;
      mimeType: string;
      size: number;
      url: string;
    }>
  >([]);
  const [loadingList, setLoadingList] = useState(false);

  useEffect(() => {
    setSaved(images);
  }, [images]);

  // Завантажити staging list при create
  useEffect(() => {
    if (!stagingSessionId || goodId) return;
    let cancelled = false;
    setLoadingList(true);
    void fetch(`/api/catalog/images/staging/${encodeURIComponent(stagingSessionId)}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        const json = (await res.json()) as {
          success?: boolean;
          data?: typeof stagingItems;
        };
        if (!cancelled && json.success && Array.isArray(json.data)) {
          setStagingItems(json.data);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stagingSessionId, goodId]);

  useEffect(() => {
    return () => {
      for (const q of queue) {
        URL.revokeObjectURL(q.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup on unmount only
  }, []);

  const totalCount =
    (goodId ? saved.length : stagingItems.length) +
    queue.filter((q) => q.status === 'queued' || q.status === 'uploading').length;

  const validateAndEnqueue = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      const accepted: File[] = [];
      for (const file of files) {
        if (!ACCEPT_SET.has(file.type)) {
          ToastService.show({
            title: 'Непідтримуваний формат',
            description: file.name,
            color: 'warning',
          });
          continue;
        }
        if (file.size > MAX_BYTES) {
          ToastService.show({
            title: 'Файл завеликий',
            description: `${file.name} — макс. 8 МБ`,
            color: 'warning',
          });
          continue;
        }
        accepted.push(file);
      }
      if (accepted.length === 0) return;
      if (totalCount + accepted.length > MAX_FILES) {
        ToastService.show({
          title: `Максимум ${MAX_FILES} зображень`,
          color: 'warning',
        });
        return;
      }

      const items: QueueItem[] = accepted.map((file) => ({
        localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'queued',
        progress: 0,
      }));
      setQueue((prev) => [...prev, ...items]);
      void runUpload(items);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [totalCount, goodId, stagingSessionId]
  );

  const runUpload = async (items: QueueItem[]) => {
    const url = goodId
      ? `/api/catalog/goods/${encodeURIComponent(goodId)}/images`
      : stagingSessionId
        ? `/api/catalog/images/staging/${encodeURIComponent(stagingSessionId)}`
        : null;
    if (!url) {
      ToastService.show({
        title: 'Немає сесії завантаження',
        color: 'danger',
      });
      return;
    }

    for (const item of items) {
      setQueue((prev) =>
        prev.map((q) =>
          q.localId === item.localId ? { ...q, status: 'uploading', progress: 30 } : q
        )
      );
      try {
        const json = await uploadFiles(url, [item.file]);
        setQueue((prev) =>
          prev.map((q) =>
            q.localId === item.localId
              ? { ...q, status: 'success', progress: 100 }
              : q
          )
        );

        if (goodId) {
          const created = (json.data as CatalogGoodImageDto[]) || [];
          setSaved((prev) => {
            const next = [...prev, ...created];
            onImagesChange?.(next);
            return next;
          });
        } else if (stagingSessionId) {
          const created = (json.data as typeof stagingItems) || [];
          setStagingItems((prev) => [...prev, ...created]);
        }

        // Прибрати з черги через короткий час
        setTimeout(() => {
          setQueue((prev) => {
            const found = prev.find((q) => q.localId === item.localId);
            if (found) URL.revokeObjectURL(found.previewUrl);
            return prev.filter((q) => q.localId !== item.localId);
          });
        }, 800);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Помилка';
        setQueue((prev) =>
          prev.map((q) =>
            q.localId === item.localId
              ? { ...q, status: 'error', progress: 0, error: message }
              : q
          )
        );
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isDisabled) return;
    if (e.dataTransfer.files?.length) validateAndEnqueue(e.dataTransfer.files);
  };

  const handleDeleteSaved = async (image: CatalogGoodImageDto) => {
    try {
      const res = await fetch(`/api/catalog/images/${image.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error || 'Не вдалося видалити');
      setSaved((prev) => {
        const next = prev.filter((i) => i.id !== image.id);
        onImagesChange?.(next);
        return next;
      });
    } catch (err) {
      ToastService.show({
        title: 'Помилка видалення',
        description: err instanceof Error ? err.message : 'Unknown',
        color: 'danger',
      });
    }
  };

  const handleSetPrimary = async (image: CatalogGoodImageDto) => {
    try {
      const res = await fetch(`/api/catalog/images/${image.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrimary: true }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: CatalogGoodImageDto;
        error?: string;
      };
      if (!res.ok || !json.success || !json.data) throw new Error(json.error || 'Помилка');
      setSaved((prev) => {
        const next = prev.map((i) => ({
          ...i,
          isPrimary: i.id === image.id,
        }));
        onImagesChange?.(next);
        return next;
      });
    } catch (err) {
      ToastService.show({
        title: 'Помилка',
        description: err instanceof Error ? err.message : 'Unknown',
        color: 'danger',
      });
    }
  };

  const handleDeleteStaging = async (fileName: string) => {
    if (!stagingSessionId) return;
    try {
      const res = await fetch(
        `/api/catalog/images/staging/${encodeURIComponent(stagingSessionId)}/${encodeURIComponent(fileName)}`,
        { method: 'DELETE', credentials: 'include' }
      );
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error || 'Не вдалося видалити');
      setStagingItems((prev) => prev.filter((i) => i.fileName !== fileName));
    } catch (err) {
      ToastService.show({
        title: 'Помилка видалення',
        description: err instanceof Error ? err.message : 'Unknown',
        color: 'danger',
      });
    }
  };

  const retryItem = (item: QueueItem) => {
    setQueue((prev) => prev.filter((q) => q.localId !== item.localId));
    URL.revokeObjectURL(item.previewUrl);
    validateAndEnqueue([item.file]);
  };

  const removeQueueItem = (item: QueueItem) => {
    URL.revokeObjectURL(item.previewUrl);
    setQueue((prev) => prev.filter((q) => q.localId !== item.localId));
  };

  const displaySaved = goodId ? saved : [];
  const displayStaging = !goodId ? stagingItems : [];

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        disabled={isDisabled || totalCount >= MAX_FILES}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isDisabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isDisabled && inputRef.current?.click()}
        className={[
          'group relative flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6',
          'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary',
          isDragging
            ? 'border-primary bg-primary/10'
            : 'border-default-300 bg-default-50 hover:border-primary/60 hover:bg-default-100',
          isDisabled || totalCount >= MAX_FILES ? 'pointer-events-none opacity-50' : 'cursor-pointer',
        ].join(' ')}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-default-200 text-default-600 group-hover:bg-primary/15 group-hover:text-primary">
          <DynamicIcon name="upload" size={18} />
        </div>
        <span className="text-sm font-medium text-default-700">
          Перетягніть або оберіть зображення
        </span>
        <span className="text-xs text-default-400">{displaySaved.length + displayStaging.length}/{MAX_FILES} · JPEG/PNG/WebP/GIF · до 8 МБ</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        disabled={isDisabled}
        onChange={(e) => {
          if (e.target.files?.length) validateAndEnqueue(e.target.files);
          e.target.value = '';
        }}
      />

      {loadingList && (
        <div className="flex justify-center py-2">
          <Spinner size="sm" />
        </div>
      )}

      {/* Черга upload */}
      {queue.length > 0 && (
        <ul className="space-y-2">
          {queue.map((item) => (
            <li
              key={item.localId}
              className="flex items-center gap-2 rounded-xl bg-default-100 p-1.5"
            >
              <img
                src={item.previewUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{item.file.name}</div>
                <div className="text-[11px] text-default-400">
                  {formatBytes(item.file.size)}
                  {item.error ? ` · ${item.error}` : ''}
                </div>
                {item.status === 'uploading' && (
                  <Progress
                    size="sm"
                    aria-label="Прогрес"
                    value={item.progress}
                    className="mt-1 max-w-full"
                  />
                )}
              </div>
              {item.status === 'error' && (
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  color="danger"
                  aria-label="Повторити"
                  onPress={() => retryItem(item)}
                >
                  <DynamicIcon name="rotate-ccw" size={14} />
                </Button>
              )}
              {(item.status === 'error' || item.status === 'queued') && (
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  aria-label="Прибрати"
                  onPress={() => removeQueueItem(item)}
                >
                  <DynamicIcon name="x" size={14} />
                </Button>
              )}
              {item.status === 'success' && (
                <DynamicIcon name="check" size={16} className="mr-2 text-success" />
              )}
              {item.status === 'uploading' && <Spinner size="sm" className="mr-2" />}
            </li>
          ))}
        </ul>
      )}

      {/* Збережені (edit) */}
      {displaySaved.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {displaySaved.map((img) => (
            <div
              key={img.id}
              className="group relative overflow-hidden rounded-xl border border-default-200 bg-default-50"
            >
              <img src={img.url} alt={img.originalName} className="aspect-square w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/55 px-1.5 py-1">
                <span className="truncate text-[10px] text-white">{img.originalName}</span>
                <div className="flex shrink-0 gap-0.5">
                  {!img.isPrimary && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="flat"
                      className="h-6 w-6 min-w-6 bg-white/20 text-white"
                      aria-label="Зробити головним"
                      isDisabled={isDisabled}
                      onPress={() => void handleSetPrimary(img)}
                    >
                      <DynamicIcon name="star" size={12} />
                    </Button>
                  )}
                  <Button
                    isIconOnly
                    size="sm"
                    variant="flat"
                    className="h-6 w-6 min-w-6 bg-white/20 text-white"
                    aria-label="Видалити"
                    isDisabled={isDisabled}
                    onPress={() => void handleDeleteSaved(img)}
                  >
                    <DynamicIcon name="trash-2" size={12} />
                  </Button>
                </div>
              </div>
              {img.isPrimary && (
                <Chip
                  size="sm"
                  color="primary"
                  variant="solid"
                  className="absolute left-1 top-1 h-5 text-[10px]"
                >
                  Головне
                </Chip>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Staging (create) */}
      {displayStaging.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {displayStaging.map((img) => (
            <div
              key={img.fileName}
              className="group relative overflow-hidden rounded-xl border border-default-200 bg-default-50"
            >
              <img src={img.url} alt={img.originalName} className="aspect-square w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/55 px-1.5 py-1">
                <span className="truncate text-[10px] text-white">{img.originalName}</span>
                <Button
                  isIconOnly
                  size="sm"
                  variant="flat"
                  className="h-6 w-6 min-w-6 bg-white/20 text-white"
                  aria-label="Видалити"
                  isDisabled={isDisabled}
                  onPress={() => void handleDeleteStaging(img.fileName)}
                >
                  <DynamicIcon name="trash-2" size={12} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
