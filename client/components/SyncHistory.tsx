import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Select,
  SelectItem,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Progress,
  SortDescriptor,
  Tooltip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Pagination,
  Checkbox,
  Switch,
} from "@heroui/react";
import { DynamicIcon } from "lucide-react/dynamic";
import { addToast } from "@heroui/react";
import { SyncHistoryRecord } from "../types/sync";
import {
  formatDateTime,
  formatRelativeDate,
  formatSyncHistoryDuration,
  formatFileSize,
} from "../lib/formatUtils";

interface SyncHistoryFullLogSettings {
  manual: boolean;
  automatic: boolean;
  background: boolean;
}

const DEFAULT_FULL_LOG_SETTINGS: SyncHistoryFullLogSettings = {
  manual: false,
  automatic: false,
  background: false,
};

export function SyncHistory() {
  const [syncHistory, setSyncHistory] = useState<SyncHistoryRecord[]>([]);
  const [syncHistoryLoading, setSyncHistoryLoading] = useState(false);
  const [syncHistoryFilter, setSyncHistoryFilter] = useState("all");
  const [syncHistoryStats, setSyncHistoryStats] = useState<any>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedHistory, setSelectedHistory] =
    useState<SyncHistoryRecord | null>(null);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "createdAt",
    direction: "descending",
  });

  // Состояния для пагинации
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Состояния для массового удаления
  const [selectedRecords, setSelectedRecords] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Налаштування розширеного логування
  const [fullLogSettings, setFullLogSettings] = useState<SyncHistoryFullLogSettings>(
    DEFAULT_FULL_LOG_SETTINGS,
  );
  const [savedFullLogSettings, setSavedFullLogSettings] = useState<SyncHistoryFullLogSettings>(
    DEFAULT_FULL_LOG_SETTINGS,
  );
  const [historySettingsLoading, setHistorySettingsLoading] = useState(false);
  const [historySettingsSaving, setHistorySettingsSaving] = useState(false);

  const isFullLogSettingsDirty = useMemo(
    () =>
      fullLogSettings.manual !== savedFullLogSettings.manual ||
      fullLogSettings.automatic !== savedFullLogSettings.automatic ||
      fullLogSettings.background !== savedFullLogSettings.background,
    [fullLogSettings, savedFullLogSettings],
  );

  // Функция для безопасного отображения значений
  const renderValue = (value: any): string => {
    if (value === null || value === undefined) {
      return "null";
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return String(value);
    }
    if (typeof value === "object") {
      if (Array.isArray(value)) {
        // Для массивов показываем содержимое
        if (value.length === 0) {
          return "[]";
        }
        if (value.length <= 3) {
          const preview = value.map(item => JSON.stringify(item)).join(", ");
          return `[${preview}]`;
        }
        const preview = value.slice(0, 2).map(item => JSON.stringify(item)).join(", ");
        return `[${preview}... +${value.length - 2} more]`;
      }
      if (value.oldLength && value.newLength) {
        return `[Data: ${value.oldLength} → ${value.newLength} chars]`;
      }
      if (value.error) {
        return `[Error: ${value.error}]`;
      }
      // Для объектов показываем более детальную информацию
      const keys = Object.keys(value);
      if (keys.length === 0) {
        return "{}";
      }
      if (keys.length <= 3) {
        // Для небольших объектов показываем содержимое
        const preview = keys.map(key => `${key}: ${JSON.stringify(value[key])}`).join(", ");
        return `{${preview}}`;
      }
      return `{${keys.slice(0, 2).map(key => `${key}: ${JSON.stringify(value[key])}`).join(", ")}... +${keys.length - 2} more}`;
    }
    return String(value);
  };

  // Функция для красивого отображения массивов и объектов с возможностью раскрытия
  const renderFormattedValue = (value: any, isExpanded: boolean = false, onToggle: () => void = () => {}) => {
    if (value === null || value === undefined) {
      return <span>null</span>;
    }
    
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return <span>{JSON.stringify(value)}</span>;
    }
    
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className="text-gray-500">[]</span>;
      }
      
      // Специальная обработка для массивов с одним объектом (ord_delivery_data, contacts)
      if (value.length === 1 && typeof value[0] === "object" && value[0] !== null) {
        const obj = value[0];
        const keys = Object.keys(obj);
        
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs">
								Object [{keys.length} keys]
              </span>
              <button
                onClick={onToggle}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                {isExpanded ? "Згорнути" : "Розгорнути"}
              </button>
            </div>
            {isExpanded && (
              <div className="ml-2 space-y-1">
                {keys.map((key) => (
                  <div key={key} className="text-xs">
                    <span className="font-medium">{key}:</span>
                    <span className="ml-1 text-gray-700">
                      {typeof obj[key] === "object" && obj[key] !== null
                        ? Array.isArray(obj[key])
                          ? `[${obj[key].length} items]`
                          : `{${Object.keys(obj[key]).length} keys}`
                        : JSON.stringify(obj[key])
                      }
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }
      
      return (
        <div className="space-y-1">
          <span className="text-gray-500 text-xs">Array [{value.length} items]</span>
          <div className="ml-2 space-y-1">
            {value.slice(0, 2).map((item, index) => (
              <div key={index} className="text-xs">
                <span className="text-gray-400">{index}:</span>
                <span className="ml-1 text-gray-700">
                  {typeof item === "object" 
                    ? `{${Object.keys(item).slice(0, 2).join(", ")}${Object.keys(item).length > 2 ? "..." : ""}}`
                    : JSON.stringify(item)
                  }
                </span>
              </div>
            ))}
            {value.length > 2 && (
              <div className="text-gray-500 italic text-xs">
                ... +{value.length - 2} more
              </div>
            )}
          </div>
        </div>
      );
    }
    
    if (typeof value === "object") {
      const keys = Object.keys(value);
      if (keys.length === 0) {
        return <span className="text-gray-500">{}</span>;
      }
      
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs">Object [{keys.length} keys]</span>
            <button
              onClick={onToggle}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              {isExpanded ? "Згорнути" : "Розгорнути"}
            </button>
          </div>
          {isExpanded && (
            <div className="ml-2 space-y-1">
              {keys.map((key) => (
                <div key={key} className="text-xs">
                  <span className="font-medium">{key}:</span>
                  <span className="ml-1">
                    {typeof value[key] === "object" && value[key] !== null
                      ? Array.isArray(value[key])
                        ? `[${value[key].length} items]`
                        : `{${Object.keys(value[key]).length} keys}`
                      : JSON.stringify(value[key])
                    }
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    
    return <span>{String(value)}</span>;
  };

  // Универсальный компонент для отображения значений с diff-сравнением
  const ValueWithDiff = ({ oldValue, newValue, level = 0 }: { oldValue: any; newValue: any; level?: number }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const indent = 0; // Отступ для вложенности

    // Парсим значения если они строки
    let parsedOld = oldValue;
    let parsedNew = newValue;
    
    if (typeof oldValue === "string") {
      try {
        parsedOld = JSON.parse(oldValue);
      } catch (e) {
        parsedOld = oldValue;
      }
    }
    
    if (typeof newValue === "string") {
      try {
        parsedNew = JSON.parse(newValue);
      } catch (e) {
        parsedNew = newValue;
      }
    }
    
    // Для массивов
    if (Array.isArray(parsedOld) || Array.isArray(parsedNew)) {
      const oldArray = Array.isArray(parsedOld) ? parsedOld : [];
      const newArray = Array.isArray(parsedNew) ? parsedNew : [];

      // Если в массивах не более одного элемента, показываем их напрямую для сравнения
      if (oldArray.length <= 1 && newArray.length <= 1) {
        const oldItem = oldArray.length === 1 ? oldArray[0] : undefined;
        const newItem = newArray.length === 1 ? newArray[0] : undefined;
        return (
          <ValueWithDiff oldValue={oldItem} newValue={newItem} level={level} />
        );
      }

      return (
        <div className="space-y-1" style={{ marginLeft: `${indent}px` }}>
          <div
            className="inline-flex items-center gap-1.5 px-1.5 py-1 rounded text-purple-500 bg-purple-50 cursor-pointer"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <span className="text-xs font-mono text-purple-500">
              {isExpanded ? "[-]" : "[+]"}
            </span>
            <span className="text-xs">
              Array [{oldArray.length} items]
            </span>
          </div>
          {isExpanded && (
            <div className="space-y-2">
              {oldArray.map((oldItem, index) => {
                const newItem = newArray[index];
                
                return (
                  <div key={index} className="border border-gray-200 rounded p-2 bg-gray-50">
                    <span className="text-xs font-medium mb-1">Item {index + 1}:</span>
                    <ValueWithDiff oldValue={oldItem} newValue={newItem} level={level + 1} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }
    
    // Для объектов
    if (typeof parsedOld === "object" && parsedOld !== null || typeof parsedNew === "object" && parsedNew !== null) {
      const oldObj = parsedOld || {};
      const newObj = parsedNew || {};
      const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
      
      return (
        <div className="space-y-2" style={{ marginLeft: `${indent}px` }}>
          <div className="inline-flex items-center gap-1.5 px-1.5 py-1 rounded text-blue-600 bg-blue-50 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
            <span className="text-xs font-mono">
              {isExpanded ? "[-]" : "[+]"}
            </span>
            <span className="text-xs">Object [{allKeys.size} keys]</span>
          </div>
          {isExpanded && (
            <div className="space-y-1">
              {Array.from(allKeys).map(key => {
                const oldVal = oldObj[key];
                const newVal = newObj[key];
                const hasChanged = JSON.stringify(oldVal) !== JSON.stringify(newVal);
                const wasRemoved = oldVal !== undefined && newVal === undefined;
                const wasAdded = oldVal === undefined && newVal !== undefined;
                
                const isObjectOrJsonString = (val: any): boolean => {
                  if (typeof val === 'object' && val !== null) return true;
                  if (typeof val !== 'string') return false;
                  try {
                      const parsed = JSON.parse(val);
                      return typeof parsed === 'object' && parsed !== null;
                  } catch (e) {
                      return false;
                  }
                };

                return (
                  <div key={key} className="flex items-start gap-2 text-xs">
                    <span className={`font-mono text-[14px] px-1.5 py-1 rounded min-w-0 flex-shrink-0 ${
                      wasAdded 
                        ? "text-green-600 font-medium" 
                        : wasRemoved 
                          ? "text-red-800 line-through" 
                          : "text-gray-800 font-medium"
                    }`}>
                      {key}:
                    </span>
                    <div className="flex items-start gap-2 flex-1">
                      {isObjectOrJsonString(oldVal) || isObjectOrJsonString(newVal) ? (
                        // Для объектов показываем один блок с внутренним сравнением
                        <div className="flex-1">
                          <ValueWithDiff
                            oldValue={oldVal}
                            newValue={newVal}
                            level={level + 1}
                          />
                        </div>
                      ) : (
                        // Для примитивных значений показываем oldValue → newValue
                        <>
                          {!wasAdded && (
                            <div className={`px-2 py-1 rounded text-xs ${
                              hasChanged || wasRemoved 
                                ? "bg-red-100 text-red-800" 
                                : "bg-gray-100 text-gray-600"
                            }`}>
                              <span>{JSON.stringify(oldVal)}</span>
                            </div>
                          )}
                          {!wasRemoved && !wasAdded && (
                            <span className="text-gray-400 mt-1">→</span>
                          )}
                          {!wasRemoved && (
                            <div className={`px-2 py-1 rounded text-xs ${
                              hasChanged || wasAdded 
                                ? "bg-green-100 text-green-800" 
                                : "bg-gray-100 text-gray-600"
                            }`}>
                              <span>{JSON.stringify(newVal)}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }
    
    // Для примитивных значений - показываем oldValue → newValue
    const hasChanged = JSON.stringify(parsedOld) !== JSON.stringify(parsedNew);
    const wasRemoved = parsedOld !== undefined && parsedNew === undefined;
    const wasAdded = parsedOld === undefined && parsedNew !== undefined;
    
    return (
      <div className="flex items-center gap-2" style={{ marginLeft: `${indent}px` }}>
        {!wasAdded && (
          <div className={`px-2 py-1 rounded text-xs ${
            hasChanged || wasRemoved 
              ? "bg-red-100 text-red-800" 
              : "bg-gray-100 text-gray-600"
          }`}>
            <span>{JSON.stringify(parsedOld)}</span>
          </div>
        )}
        {!wasRemoved && !wasAdded && (
          <span className="text-gray-400">→</span>
        )}
        {!wasRemoved && (
          <div className={`px-2 py-1 rounded text-xs ${
            hasChanged || wasAdded 
              ? "bg-green-100 text-green-800" 
              : "bg-gray-100 text-gray-600"
          }`}>
            <span>{JSON.stringify(parsedNew)}</span>
          </div>
        )}
      </div>
    );
  };

  // Функция для подсветки изменений в объектах (обертка)
  const renderObjectDiff = (oldValue: any, newValue: any) => {
    return <ValueWithDiff oldValue={oldValue} newValue={newValue} level={0} />;
  };

  // Компонент для отображения сложных значений с возможностью развернуть
  const renderComplexValue = (value: any, label: string, color: string, showDiff: boolean = false, compareValue?: any) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Проверяем, является ли значение объектом или строкой JSON
    let parsedValue = value;
    if (typeof value === "string") {
      try {
        parsedValue = JSON.parse(value);
      } catch (e) {
        // Если не удалось распарсить, оставляем как строку
        parsedValue = value;
      }
    }

    if (typeof parsedValue === "object" && parsedValue !== null && !Array.isArray(parsedValue)) {
      return (
        <div className="flex flex-col items-start gap-1">
          {label && <span className="text-gray-500 text-xs">{label}:</span>}
          <div className="flex items-center gap-2">
            <span className={`${color} px-1.5 py-1 rounded text-xs`}>
              {renderValue(parsedValue)}
            </span>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              {isExpanded ? "Згорнути" : "Розгорнути"}
            </button>
          </div>
              {isExpanded && (
                <div className="mt-1 p-2 bg-gray-100 rounded text-xs">
                  {showDiff && compareValue ? (
                    renderObjectDiff(value, compareValue)
                  ) : (
                    <div className="space-y-1">
                      {Object.entries(parsedValue).map(([key, val]) => (
                        <div key={key} className="flex items-start gap-2">
                          <span className="font-mono text-blue-600 min-w-0 flex-shrink-0">{key}:</span>
                          <span className="font-mono text-gray-700 break-all">
                            {typeof val === "object" && val !== null 
                              ? JSON.stringify(val, null, 2)
                              : String(val)
                            }
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
        </div>
      );
    }

    return (
      <div className="flex flex-col items-start gap-1 overflow-x-auto">
        <span className={`${color} px-1.5 py-1 rounded text-xs`}>
          {renderValue(value)}
        </span>
      </div>
    );
  };

  const loadHistorySettings = async () => {
    setHistorySettingsLoading(true);
    try {
      const response = await fetch("/api/orders-sync/sync/settings", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        const loaded =
          data.settings?.syncHistoryFullLog ?? DEFAULT_FULL_LOG_SETTINGS;
        setFullLogSettings(loaded);
        setSavedFullLogSettings(loaded);
      }
    } catch (error) {
      console.error("Error loading sync history settings:", error);
    } finally {
      setHistorySettingsLoading(false);
    }
  };

  const saveHistorySettings = async () => {
    setHistorySettingsSaving(true);
    try {
      const currentResponse = await fetch("/api/orders-sync/sync/settings", {
        credentials: "include",
      });
      if (!currentResponse.ok) {
        throw new Error("Failed to load current settings");
      }

      const currentData = await currentResponse.json();
      const mergedSettings = {
        ...currentData.settings,
        syncHistoryFullLog: fullLogSettings,
      };

      const saveResponse = await fetch("/api/orders-sync/sync/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(mergedSettings),
      });

      if (!saveResponse.ok) {
        throw new Error("Failed to save settings");
      }

      setSavedFullLogSettings(fullLogSettings);

      addToast({
        title: "Збережено",
        description: "Налаштування логування історії оновлено",
        color: "success",
      });
    } catch (error) {
      console.error("Error saving sync history settings:", error);
      addToast({
        title: "Помилка",
        description: "Не вдалося зберегти налаштування логування",
        color: "danger",
      });
    } finally {
      setHistorySettingsSaving(false);
    }
  };

  const loadSyncHistory = async (page: number = 1) => {
    setSyncHistoryLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
        sortColumn: sortDescriptor.column as string,
        sortDirection: sortDescriptor.direction,
      });

      if (syncHistoryFilter !== "all") {
        queryParams.append("type", syncHistoryFilter);
      }

      const response = await fetch(
        `/api/orders-sync/sync/history?${queryParams}`,
        {
          credentials: "include",
        },
      );

      if (response.ok) {
        const data = await response.json();
        setSyncHistory(data.data.history || []);
        setSyncHistoryStats(data.data.statistics || null);
        setTotalPages(data.data.totalPages || 0);
        setTotalRecords(data.data.totalRecords || 0);
        setCurrentPage(page);
      } else {
        throw new Error("Failed to fetch sync history");
      }
    } catch (error) {
      console.error("Error loading sync history:", error);
      addToast({
        title: "Помилка",
        description: "Не вдалося завантажити історію синхронізацій",
        color: "danger",
      });
    } finally {
      setSyncHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadHistorySettings();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedRecords(new Set());
    loadSyncHistory(1);
  }, [syncHistoryFilter, pageSize, sortDescriptor]);

  // Отладочный useEffect для отслеживания изменений selectedRecords
  useEffect(() => {
    // console.log('selectedRecords changed:', Array.from(selectedRecords));
  }, [selectedRecords]);

  const handlePageChange = (page: number) => {
    if (page !== currentPage && !syncHistoryLoading) {
      setSelectedRecords(new Set());
      loadSyncHistory(page);
    }
  };

  const handleSelectAll = () => {
    setSelectedRecords(prevSelected => {
      const newSelected = new Set(prevSelected);
      // Определяем, выбраны ли все элементы на текущей странице
      const allOnPageSelected = syncHistory.length > 0 && syncHistory.every(item => newSelected.has(item.id));

      if (allOnPageSelected) {
        // Если все выбраны, снимаем выбор только с элементов текущей страницы
        syncHistory.forEach(item => newSelected.delete(item.id));
      } else {
        // Если выбраны не все, выбираем все элементы текущей страницы
        syncHistory.forEach(item => newSelected.add(item.id));
      }
      return newSelected;
    });
  };

  const handleSelectRecord = (recordId: number) => {
    setSelectedRecords(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(recordId)) {
        newSelected.delete(recordId);
      } else {
        newSelected.add(recordId);
      }
      return newSelected;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedRecords.size === 0) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch('/api/orders-sync/sync/history/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ ids: Array.from(selectedRecords) })
      });

      if (response.ok) {
        setSelectedRecords(new Set());
        await loadSyncHistory(currentPage);
        addToast({
          title: 'Успіх',
          description: `Видалено ${selectedRecords.size} записів`,
          color: 'success'
        });
      } else {
        throw new Error('Failed to delete records');
      }
    } catch (error) {
      console.error('Error deleting records:', error);
      addToast({
        title: 'Помилка',
        description: 'Не вдалося видалити записи',
        color: 'danger'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePageSizeChange = (newPageSize: string) => {
    const size = parseInt(newPageSize);
    if (isNaN(size) || size <= 0) {
      console.warn('Invalid page size:', newPageSize);
      return;
    }
    setPageSize(size);
    // Не очищаем selectedRecords при изменении размера страницы
    // setSelectedRecords(new Set());
    setCurrentPage(1);
    // loadSyncHistory будет вызван через useEffect из-за изменения pageSize
  };

  const syncHistoryColumns = [
    { key: "select", label: "", allowsSorting: false },
    { key: "id", label: "ID", allowsSorting: true },
    { key: "createdAt", label: "Дата", allowsSorting: true },
    { key: "syncType", label: "Тип", allowsSorting: true },
    { key: "status", label: "Статус", allowsSorting: true },
    { key: "progress", label: "Прогрес", allowsSorting: false },
    { key: "stats", label: "Статистика", allowsSorting: false },
    { key: "recordSize", label: "Розмір", allowsSorting: false },
    { key: "duration", label: "Час", allowsSorting: true },
    { key: "actions", label: "Дії", allowsSorting: false },
  ];

  const handleViewDetails = (item: SyncHistoryRecord) => {
    setSelectedHistory(item);
    setIsDetailsModalOpen(true);
  };

  // Убираем клиентскую сортировку - теперь сортировка происходит на сервере
  const itemsForTable = useMemo(() => {
    return syncHistory.map(item => ({
      ...item,
      isSelected: selectedRecords.has(item.id),
    }));
  }, [syncHistory, selectedRecords]);

  const renderSyncHistoryCell = (
    item: SyncHistoryRecord & { isSelected: boolean },
    columnKey: React.Key,
  ) => {
    switch (columnKey) {
      case "select":
        return (
          <Checkbox
            key={`checkbox-${item.id}`}
            isSelected={item.isSelected}
            onValueChange={() => handleSelectRecord(item.id)}
            color="primary"
          />
        );
      case "id":
        return (
          <span className="font-mono text-sm text-gray-700">#{item.id}</span>
        );
      case "createdAt":
        return (
          <div className="text-sm text-gray-900 flex flex-col">
            <span>{formatDateTime(item.createdAt)}</span>
            <span className="text-xs text-gray-500">
              {formatRelativeDate(item.createdAt)}
            </span>
          </div>
        );
      case "syncType":
        const typeLabels: { [key: string]: string } = {
          manual: "Manual",
          automatic: "Auto",
          background: "Background",
        };
        const typeColorsBase: { [key: string]: string } = {
          manual: "bg-orange-700/10",
          automatic: "bg-indigo-700/10",
          background: "bg-gray-700/10",
        };
				const typeColors: { [key: string]: string } = {
          manual: "text-orange-700",
          automatic: "text-indigo-700",
          background: "text-gray-700",
        };
        return (
          <Chip
            color="default"
            variant="flat"
            size="sm"
						classNames={{
							base: `${typeColorsBase[item.syncType]}`,
							content: `${typeColors[item.syncType]}`,
						}}
          >
            {typeLabels[item.syncType] || item.syncType}
          </Chip>
        );
      case "status":
        const statusConfig = {
          success: { label: "Успішно", color: "success", icon: "check-circle" },
          partial: {
            label: "Частково",
            color: "warning",
            icon: "alert-triangle",
          },
          failed: { label: "Помилка", color: "danger", icon: "x-circle" },
        };
        const config = statusConfig[
          item.status as keyof typeof statusConfig
        ] || { label: item.status, color: "default", icon: "help-circle" };
        return (
          <Chip color={config.color as any} variant="dot" size="sm">
            {config.label}
          </Chip>
        );
      case "progress":
        let progressValue = 0;
        let progressColor: "success" | "warning" | "danger" = "success";
        if (item.status === "success") {
          progressValue = 100;
          progressColor = "success";
        } else if (item.status === "failed") {
          progressValue = 100;
          progressColor = "danger";
        } else if (item.status === "partial") {
          progressValue =
            item.totalOrders > 0
              ? Math.round(
                  ((item.newOrders + item.updatedOrders) / item.totalOrders) *
                    100,
                )
              : 0;
          progressColor = "warning";
        }
        return (
          <div className="w-32">
            <Progress
              aria-label="progress"
              value={progressValue}
              color={progressColor}
              size="sm"
              showValueLabel={item.status !== "failed"}
            />
          </div>
        );
      case "stats":
        return (
          <div className="flex gap-2 items-center">
            <Tooltip content="Всього замовлень">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-gray-900 font-medium text-sm">
                <DynamicIcon name="list" size={14} className="text-gray-400" />
                {item.totalOrders}
              </span>
            </Tooltip>
            <Tooltip content="Нові">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 text-green-800 font-medium text-sm">
                <DynamicIcon
                  name="plus-circle"
                  size={14}
                  className="text-green-400"
                />
                {item.newOrders}
              </span>
            </Tooltip>
            <Tooltip content="Оновлені">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-medium text-sm">
                <DynamicIcon
                  name="refresh-cw"
                  size={14}
                  className="text-blue-400"
                />
                {item.updatedOrders}
              </span>
            </Tooltip>
            <Tooltip content="Пропущені">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 font-medium text-sm">
                <DynamicIcon
                  name="skip-forward"
                  size={14}
                  className="text-yellow-400"
                />
                {item.skippedOrders}
              </span>
            </Tooltip>
            <Tooltip content="Помилки">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-800 font-medium text-sm">
                <DynamicIcon
                  name="alert-triangle"
                  size={14}
                  className="text-red-400"
                />
                {item.errors}
              </span>
            </Tooltip>
          </div>
        );
      case "recordSize":
        const sizeInBytes = item.details
          ? JSON.stringify(item.details).length
          : 0;
        return (
          <span className="text-sm text-gray-900">
            {formatFileSize(sizeInBytes)}
          </span>
        );
      case "duration":
        return (
          <span className="text-sm text-gray-900">
            {formatSyncHistoryDuration(item.duration)}
          </span>
        );
      case "actions":
        return (
          <div className="relative flex items-center gap-2">
            <Tooltip content="Переглянути деталі">
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onPress={() => handleViewDetails(item)}
              >
                <DynamicIcon name="eye" size={16} />
              </Button>
            </Tooltip>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader className="flex justify-between items-center border-b border-gray-200">
        <div className="flex items-center">
          <DynamicIcon
            name="history"
            size={20}
            className="text-gray-600 mr-2"
          />
          <h2 className="text-lg font-semibold text-gray-900">
            Історія синхронізацій
          </h2>
        </div>
        <p className="text-sm text-default-500 mt-1">
          Записи за останні 7 днів. Детальна статистика — лише за увімкненим full-log.
        </p>
      </CardHeader>
      <CardBody className="p-6">
        {/* Statistics Overview */}
        {syncHistoryStats && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">
                  {syncHistoryStats.totalSyncs}
                </div>
                <div className="text-sm text-gray-600">
                  Загалом синхронізацій
                </div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">
                  {syncHistoryStats.manualSyncs}
                </div>
                <div className="text-sm text-gray-600">
                  Ручних синхронізацій
                </div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">
                  {formatFileSize(syncHistoryStats.totalSize)}
                </div>
                <div className="text-sm text-gray-600">Загальний розмір</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">
                  {formatSyncHistoryDuration(syncHistoryStats.averageDuration)}
                </div>
                <div className="text-sm text-gray-600">Середній час</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">
                  {syncHistoryStats.successRate}%
                </div>
                <div className="text-sm text-gray-600">Успішність</div>
              </div>
            </div>
          </div>
        )}

        {/* Full-log settings */}
        <div className="mb-6 rounded-[12px] border border-default-200 bg-default-50 p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-default-900">
                Розширене логування (full-log)
              </h3>
              <p className="text-xs text-default-500">
                За замовчуванням зберігається лише коротка статистика, щоб не засмічувати БД
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-8">
            <div className="flex items-center gap-3">
              <Switch
                size="sm"
                isSelected={fullLogSettings.manual}
                onValueChange={(value) =>
                  setFullLogSettings((prev) => ({ ...prev, manual: value }))
                }
                isDisabled={historySettingsLoading}
              />
              <div>
                <div className="text-sm font-medium text-default-900">Ручна</div>
                <div className="text-xs text-default-500">manual sync</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                size="sm"
                isSelected={fullLogSettings.automatic}
                onValueChange={(value) =>
                  setFullLogSettings((prev) => ({ ...prev, automatic: value }))
                }
                isDisabled={historySettingsLoading}
              />
              <div>
                <div className="text-sm font-medium text-default-900">Автоматична</div>
                <div className="text-xs text-default-500">automatic sync</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                size="sm"
                isSelected={fullLogSettings.background}
                onValueChange={(value) =>
                  setFullLogSettings((prev) => ({ ...prev, background: value }))
                }
                isDisabled={historySettingsLoading}
              />
              <div>
                <div className="text-sm font-medium text-default-900">Фонова</div>
                <div className="text-xs text-default-500">background sync</div>
              </div>
            </div>

            <Button
              size="sm"
              variant="solid"
              color="primary"
              className="ml-auto"
              // startContent={<DynamicIcon name="save" size={16} />}
              onPress={saveHistorySettings}
              isLoading={historySettingsSaving}
              isDisabled={historySettingsLoading || !isFullLogSettingsDirty}
            >
              Зберегти налаштування
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-2 justify-between items-end">
          <div className="flex-1 flex gap-4">
            <Select
							label="Тип синхронізації"
							labelPlacement="outside"
              selectedKeys={syncHistoryFilter ? [syncHistoryFilter] : []}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string;
                setSyncHistoryFilter(selected || "all");
              }}
              className="max-w-60"
            >
              <SelectItem key="all">Всі типи</SelectItem>
              <SelectItem key="manual">Ручна синхронізація</SelectItem>
              <SelectItem key="automatic">Автоматична</SelectItem>
              <SelectItem key="background">Фонова</SelectItem>
            </Select>

            <Select
              label="Записів на сторінці"
              labelPlacement="outside"
              selectedKeys={[pageSize.toString()]}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string;
                handlePageSizeChange(selected);
              }}
              className="max-w-40"
            >
              <SelectItem key="5">5</SelectItem>
              <SelectItem key="10">10</SelectItem>
              <SelectItem key="20">20</SelectItem>
              <SelectItem key="50">50</SelectItem>
              <SelectItem key="100">100</SelectItem>
            </Select>
          </div>

          <div className="flex gap-2">
            {selectedRecords.size > 0 && (
              <Button
                onPress={handleDeleteSelected}
                variant="solid"
                color="danger"
                size="sm"
                disabled={isDeleting || syncHistoryLoading}
                isLoading={isDeleting}
              >
                <DynamicIcon name="trash-2" size={16} />
                Видалити ({selectedRecords.size})
              </Button>
            )}

            <Button
              onPress={() => loadSyncHistory(1)}
              variant="bordered"
              size="sm"
              disabled={syncHistoryLoading}
            >
              <DynamicIcon name="refresh-cw" size={16} />
              Оновити
            </Button>
          </div>
        </div>

        {/* Table */}
        <Table
          aria-label="Таблиця історії синхронізацій"
          sortDescriptor={sortDescriptor}
          onSortChange={setSortDescriptor}
          classNames={{
            wrapper: "min-h-[400px] px-0 shadow-none",
            th: ["first:rounded-s-md", "last:rounded-e-md"],
          }}
        >
          <TableHeader columns={syncHistoryColumns}>
            {(column) => (
              <TableColumn
                key={column.key}
                allowsSorting={column.allowsSorting}
                align="start"
              >
                {column.key === "select" ? (
                  <Checkbox
                    key="select-all-checkbox"
                    isSelected={
                      itemsForTable.length > 0 && 
                      itemsForTable.every(item => item.isSelected)
                    }
                    isIndeterminate={
                      itemsForTable.some(item => item.isSelected) &&
                      !itemsForTable.every(item => item.isSelected)
                    }
                    onValueChange={handleSelectAll}
                    color="primary"
                  />
                ) : (
                  column.label
                )}
              </TableColumn>
            )}
          </TableHeader>
          <TableBody
            items={itemsForTable}
            emptyContent="Історія синхронізацій не знайдена"
            isLoading={syncHistoryLoading}
            loadingContent={
              <div className="flex items-center justify-center h-full w-full p-8 bg-white/65 z-10">
                <DynamicIcon
                  name="loader-2"
                  className="animate-spin mr-2"
                  size={16}
                />
                <span>Завантаження історії...</span>
              </div>
            }
          >
            {(item: SyncHistoryRecord & { isSelected: boolean }) => (
              <TableRow key={item.id}>
                {(columnKey) => (
                  <TableCell>
                    {renderSyncHistoryCell(item, columnKey)}
                  </TableCell>
                )}
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-sm text-gray-600">
              Показано {syncHistory.length} з {totalRecords} записів
              <span className="ml-2">
                (сторінка {currentPage} з {totalPages})
              </span>
            </div>

            <div className="flex gap-2 items-center">
              <Pagination
                total={totalPages}
                page={currentPage}
                onChange={handlePageChange}
                size="md"
                showControls
                showShadow
                color="primary"
                isDisabled={syncHistoryLoading}
				classNames={{
					cursor: "bg-neutral-500 text-white",
					item: "cursor-pointer",
					next: "cursor-pointer",
					prev: "cursor-pointer",
				  }}
              />
            </div>
          </div>
        )}
      </CardBody>

      {/* Sync History Details Modal */}
      <Modal
        scrollBehavior="inside"
        isOpen={isDetailsModalOpen}
        onOpenChange={setIsDetailsModalOpen}
        className="max-w-[94vw] h-[94vh]"
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader>
                <h2 className="text-lg font-semibold">
                  Деталі синхронізації #{selectedHistory?.id}
                </h2>
              </ModalHeader>
              <ModalBody className="pb-6">
                {selectedHistory && (
                  <div className="flex flex-col gap-4">
                    {/* Render basic info about sync */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-gray-50 rounded-lg">
                      <div>
                        <label className="text-xs text-gray-500">Дата</label>
                        <p className="text-sm font-medium">
                          {formatDateTime(selectedHistory.createdAt)}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Тип</label>
                        <p className="text-sm font-medium">
                          {selectedHistory.syncType}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Статус</label>
                        <p className="text-sm font-medium">
                          {selectedHistory.status}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">
                          Тривалість
                        </label>
                        <p className="text-sm font-medium">
                          {formatSyncHistoryDuration(selectedHistory.duration)}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Період</label>
                        <p className="text-sm font-medium">
                          {selectedHistory.startDate} -{" "}
                          {selectedHistory.endDate}
                        </p>
                      </div>
                    </div>

                    {/* Render stats */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-gray-50 rounded-lg">
                      <div>
                        <label className="text-xs text-gray-500">Всього</label>
                        <p className="text-xl font-medium">
                          {selectedHistory.totalOrders}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Нових</label>
                        <p className="text-xl font-medium text-green-600">
                          {selectedHistory.newOrders}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">
                          Оновлено
                        </label>
                        <p className="text-xl font-medium text-blue-600">
                          {selectedHistory.updatedOrders}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">
                          Пропущено
                        </label>
                        <p className="text-xl font-medium text-gray-600">
                          {selectedHistory.skippedOrders}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Помилок</label>
                        <p className="text-xl font-medium text-red-600">
                          {selectedHistory.errors}
                        </p>
                      </div>
                    </div>

                    {selectedHistory.errorMessage && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Повідомлення про помилку
                        </label>
                        <div className="bg-red-50 border border-red-200 p-3 rounded-md">
                          <p className="text-sm text-red-800">
                            {selectedHistory.errorMessage}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Detailed changes statistics */}
                    {selectedHistory.details && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Детальна статистика змін
                        </label>
                        <div className="bg-gray-50 p-4 rounded-md h-full overflow-y-auto">
                          {selectedHistory.details.changes &&
                          Object.keys(selectedHistory.details.changes).length >
                            0 ? (
                            <div className="space-y-3">
                              <div className="text-sm text-gray-600 mb-3">
                                Показано зміни для{" "}
                                {
                                  Object.keys(selectedHistory.details.changes)
                                    .length
                                }{" "}
                                замовлень
                              </div>
                              {Object.entries(
                                selectedHistory.details.changes,
                              ).map(
                                ([orderId, changes]: [string, any]) =>
                                  changes && (
                                    <div
                                      key={orderId}
                                      className="border border-gray-200 rounded-lg p-3 bg-white"
                                    >
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="font-medium text-sm text-gray-900">
                                          Замовлення #{orderId}
                                          {changes?.rawData?.newValue
                                            ?.orderTime && (
                                            <span className="font-normal text-xs text-gray-500">
                                              {" "}
                                              від{" "}
                                              {
                                                changes.rawData.newValue
                                                  .orderTime
                                              }
                                            </span>
                                          )}
                                        </span>
                                        {/* {process.env.NODE_ENV === 'development' && (() => { console.log(changes.rawData.newValue); return null; })()} */}
                                        <span className="text-xs font-medium text-gray-500">
                                          {Array.isArray(changes)
                                            ? changes.length
                                            : Object.keys(changes).length}{" "}
                                          {(() => {
                                            const count = Array.isArray(changes)
                                              ? changes.length
                                              : Object.keys(changes).length;
                                            if (count === 1) return "зміна";
                                            if (
                                              [2, 3, 4].includes(
                                                count % 100 > 20
                                                  ? count % 10
                                                  : count % 100
                                              ) &&
                                              ![12, 13, 14].includes(
                                                count % 100
                                              )
                                            )
                                              return "зміни";
                                            return "змін";
                                          })()}
                                        </span>
                                      </div>
                                      <div className="space-y-3">
                                        {Array.isArray(changes)
                                          ? changes.map(
                                              (change: any, index: number) => (
                                                <div
                                                  key={index}
                                                  className="text-xs text-gray-700 flex items-center gap-2"
                                                >
                                                  <span className="text-blue-600">
                                                    🔄
                                                  </span>
                                                  <span className="font-mono">
                                                    {change.field}
                                                  </span>
                                                  <span className="text-gray-400">
                                                    →
                                                  </span>
                                                  <span className="text-green-600">
                                                    {change.newValue || "null"}
                                                  </span>
                                                </div>
                                              ),
                                            )
                                          : Object.entries(changes).map(
                                              ([field, value]: [
                                                string,
                                                any,
                                              ]) => (
                                                <div key={field} className="text-sm text-gray-700">
                                                  <div className="flex items-center mb-2">
																										<span>
																											{(() => {
																												switch (field) {
																													case "ttn":
																														return "📦";
																													case "rawData":
																														return "📝";
																													case "cityName":
																														return "📍";
																													case "items":
																														return "🛒";
																													case "quantity":
																														return "🔢";
																													case "paymentMethod":
																														return "💳";
																													case "shippingMethod":
																														return "🚚";
																													default:
																														return "🔄";
																												}
																											})()}
																										</span>
                                                    <span className="font-mono font-medium ml-0.5">
																											{field}
                                                    </span>
                                                  </div>
                                                  {typeof value === "object" && value !== null ? (
                                                    field === "rawData" ? (
                                                      <div className="ml-5">
                                                        <ValueWithDiff
                                                          oldValue={value.oldValue}
                                                          newValue={value.newValue}
                                                          level={0}
                                                        />
                                                      </div>
                                                    ) : (
                                                      <div className="ml-5 flex flex-col xl:grid xl:grid-cols-2 gap-2">
                                                        <div>
                                                          <span className="text-gray-500 text-xs">Старі дані:</span>
                                                          <div className="mt-1">
                                                            {renderComplexValue(
                                                              value.oldValue,
                                                              "",
                                                              "text-red-600 bg-red-50",
                                                            )}
                                                          </div>
                                                        </div>
                                                        <div>
                                                          <span className="text-gray-500 text-xs">Нові дані:</span>
                                                          <div className="mt-1">
                                                            {renderComplexValue(
                                                              value.newValue,
                                                              "",
                                                              "text-green-600 bg-green-50",
                                                            )}
                                                          </div>
                                                        </div>
                                                      </div>
                                                    )
                                                  ) : (
                                                    <div className="ml-5">
                                                      <span className="text-green-600">
                                                        {renderValue(value)}
                                                      </span>
                                                    </div>
                                                  )}
                                                </div>
                                              ),
                                            )}
                                      </div>
                                    </div>
                                  ),
                              )}
                            </div>
                          ) : selectedHistory.details.changes ? (
                            <div className="text-sm text-gray-500 text-center py-4">
                              Немає детальних змін для цієї синхронізації
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500">
                              <pre className="whitespace-pre-wrap">
                                {JSON.stringify(
                                  selectedHistory.details,
                                  null,
                                  2,
                                )}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </Card>
  );
}
