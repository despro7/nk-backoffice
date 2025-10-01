# Примеры использования formatTrackingNumberWithIcon

## Базовое использование

```tsx
import { formatTrackingNumberWithIcon } from '../lib/formatUtilsJSX';

// С указанием провайдера
<formatTrackingNumberWithIcon('20451232665506', {
  provider: 'novaposhta',
  showIcon: true,
  showGrouping: true,
  boldLastGroup: true
}) />

// С автоопределением провайдера
<formatTrackingNumberWithIcon('20451232665506', {
  autoDetectProvider: true,
  showIcon: true,
  showGrouping: true,
  boldLastGroup: true
}) />
```

## Различные настройки

### Без иконки
```tsx
<formatTrackingNumberWithIcon('20451232665506', {
  provider: 'novaposhta',
  showIcon: false,
  showGrouping: true,
  boldLastGroup: true
}) />
```

### Без группировки
```tsx
<formatTrackingNumberWithIcon('20451232665506', {
  provider: 'novaposhta',
  showIcon: true,
  showGrouping: false,
  boldLastGroup: false
}) />
```

### Без выделения последней группы
```tsx
<formatTrackingNumberWithIcon('20451232665506', {
  provider: 'novaposhta',
  showIcon: true,
  showGrouping: true,
  boldLastGroup: false
}) />
```

### Абсолютный размер иконки
```tsx
<formatTrackingNumberWithIcon('20451232665506', {
  provider: 'novaposhta',
  showIcon: true,
  iconSize: 'absolute',
  iconSizeValue: '24px',
  showGrouping: true,
  boldLastGroup: true
}) />
```

### Относительный размер иконки (по умолчанию)
```tsx
<formatTrackingNumberWithIcon('20451232665506', {
  provider: 'novaposhta',
  showIcon: true,
  iconSize: 'relative',
  showGrouping: true,
  boldLastGroup: true
}) />
```

### С колбеком для определения провайдера
```tsx
<formatTrackingNumberWithIcon('20451232665506', {
  autoDetectProvider: true,
  onProviderDetected: (provider) => {
    console.log('Определен провайдер:', provider);
  },
  showIcon: true,
  showGrouping: true,
  boldLastGroup: true
}) />
```

## Применение стилей

Функция возвращает только содержимое, стили применяются оборачивающими элементами:

```tsx
// Большой размер с разрядкой
<div className="text-2xl tracking-wider text-primary">
  <formatTrackingNumberWithIcon('20451232665506', {
    provider: 'novaposhta',
    showIcon: true,
    iconSize: 'absolute',
    iconSizeValue: '1.5rem'
  }) />
</div>

// Маленький размер
<span className="text-sm text-gray-600">
  <formatTrackingNumberWithIcon('20451232665506', {
    provider: 'novaposhta',
    showIcon: true,
    iconSize: 'absolute',
    iconSizeValue: '12px'
  }) />
</span>
```
