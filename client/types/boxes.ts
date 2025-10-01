// Типы для настроек коробок
export interface SettingsBoxes {
  id: number;
  name: string;
  marking: string;
  qntFrom: number;
  qntTo: number;
  width: number;
  height: number;
  length: number;
  overflow: number;
  weight: number; // Грузоподъемность в кг
  self_weight: number; // Собственный вес коробки в кг
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Тип для режима рекомендаций коробок
export type BoxRecommendationMode = 'spacious' | 'economical';

// Тип для рекомендации по коробкам
export interface BoxRecommendation {
  box: SettingsBoxes;
  count: number;
  portions: number;
  totalWeight: number;
  overflow: number;
}

// Тип для ответа API с рекомендациями
export interface BoxRecommendationsResponse {
  mode: BoxRecommendationMode;
  boxes: SettingsBoxes[];
  totalPortions: number;
  totalBoxes: number;
  totalWeight: number;
  remainingQuantity?: number;
  hasOverflow?: boolean;
  overflowWarning?: boolean;
  details?: string[];
}

// Тип для запиту рекомендацій коробок
export interface BoxRecommendationsRequest {
  items: Array<{
    name: string;
    quantity: number;
    weight: number;
  }>;
  boxSettings?: SettingsBoxes;
}

// Тип для елемента чек-листа з коробкою
export interface OrderChecklistItemWithBox {
  id: string;
  name: string;
  quantity: number;
  expectedWeight: number;
  status: 'default' | 'pending' | 'success' | 'error' | 'done';
  type: 'box' | 'product';
  boxSettings?: SettingsBoxes;
  boxCount?: number;
}
