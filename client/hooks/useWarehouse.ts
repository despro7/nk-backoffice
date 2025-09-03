import { useState, useCallback } from 'react';
import { 
  WarehouseMovement, 
  WarehouseMovementItem, 
  StockMovementHistory,
  CreateWarehouseMovementRequest,
  UpdateWarehouseMovementRequest 
} from '../types/warehouse';
import { useApi } from './useApi';

const API_BASE = '/api/warehouse';

export const useWarehouse = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = useApi();

  const handleError = (err: any) => {
    console.error('Warehouse API error:', err);
    const message = err.response?.data?.error || err.message || 'Помилка API';
    setError(message);
    return message;
  };

  const clearError = () => setError(null);

  // Получить все документы перемещения
  const getMovements = useCallback(async (params?: {
    status?: string;
    warehouse?: string;
    page?: number;
    limit?: number;
  }) => {
    setLoading(true);
    setError(null);
    
    try {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.append('status', params.status);
      if (params?.warehouse) searchParams.append('warehouse', params.warehouse);
      if (params?.page) searchParams.append('page', params.page.toString());
      if (params?.limit) searchParams.append('limit', params.limit.toString());

      const response = await api.apiCall(`${API_BASE}?${searchParams.toString()}`, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      handleError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Получить документ по ID
  const getMovementById = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/${id}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      handleError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Получить черновики пользователя
  const getDrafts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('🏪 [useWarehouse] Загрузка черновиков...');
      const response = await api.apiCall(`${API_BASE}/drafts`, {
        method: 'GET'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (err) {
      handleError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Создать новый документ
  const createMovement = useCallback(async (data: CreateWarehouseMovementRequest) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await api.apiCall(API_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (err) {
      handleError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Обновить черновик
  const updateDraft = useCallback(async (id: number, data: { items: any[], deviations?: any[], notes?: string }) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('🏪 [useWarehouse] Обновление черновика:', id, data);
      const response = await api.apiCall(`${API_BASE}/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('🏪 [useWarehouse] Черновик обновлен:', result);
      return result;
    } catch (err) {
      handleError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Обновить документ
  const updateMovement = useCallback(async (id: number, data: UpdateWarehouseMovementRequest) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (err) {
      handleError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Отправить в Dilovod
  const sendToDilovod = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/${id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (err) {
      handleError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Получить историю движения остатков
  const getStockHistory = useCallback(async (params?: {
    sku?: string;
    warehouse?: string;
    movementType?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) => {
    setLoading(true);
    setError(null);
    
    try {
      const searchParams = new URLSearchParams();
      if (params?.sku) searchParams.append('sku', params.sku);
      if (params?.warehouse) searchParams.append('warehouse', params.warehouse);
      if (params?.movementType) searchParams.append('movementType', params.movementType);
      if (params?.startDate) searchParams.append('startDate', params.startDate.toISOString());
      if (params?.endDate) searchParams.append('endDate', params.endDate.toISOString());
      if (params?.page) searchParams.append('page', params.page.toString());
      if (params?.limit) searchParams.append('limit', params.limit.toString());

      const response = await fetch(`${API_BASE}/stock/history?${searchParams.toString()}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      handleError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Получить текущие остатки по складам
  const getCurrentStock = useCallback(async (warehouse?: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const searchParams = new URLSearchParams();
      if (warehouse) searchParams.append('warehouse', warehouse);

      const response = await fetch(`${API_BASE}/stock/current?${searchParams.toString()}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      handleError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Получить товары с остатками для перемещения между складами
  const getProductsForMovement = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('🏪 [useWarehouse] Запрос товаров для перемещения...');
      const response = await api.apiCall(`${API_BASE}/products-for-movement`, {
        method: 'GET'
      });

      console.log('🏪 [useWarehouse] Ответ сервера:', response.status, response.statusText);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error('🚨 [useWarehouse] Ошибка получения товаров:', err);
      handleError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Удалить черновик
  const deleteDraft = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);

    try {
      console.log('🏪 [useWarehouse] Удаление черновика:', id);
      const response = await api.apiCall(`${API_BASE}/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('🏪 [useWarehouse] Черновик удален:', result);
      return result;
    } catch (err) {
      handleError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [api]);

  return {
    loading,
    error,
    clearError,
    getMovements,
    getMovementById,
    getDrafts,
    createMovement,
    updateDraft,
    updateMovement,
    sendToDilovod,
    deleteDraft,
    getStockHistory,
    getCurrentStock,
    getProductsForMovement
  };
};
