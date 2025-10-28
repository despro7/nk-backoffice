import React from 'react';

/**
 * Автоматически определяет провайдера доставки по длине номера отслеживания
 * @param trackingId - номер отслеживания
 * @returns провайдер доставки или null если не удалось определить
 */
export const detectTrackingProvider = (trackingId: string): string | null => {
  if (!trackingId || trackingId === 'Не вказано') return null;
  
  const cleanId = trackingId.toString().replace(/\s/g, '');
  
  if (cleanId.length === 14) return 'novaposhta';
  if (cleanId.length === 13) return 'ukrposhta';
  
  return null;
};

/**
 * Форматирует номер отслеживания с иконкой и настройками отображения
 * @param trackingId - номер отслеживания
 * @param options - настройки форматирования
 * @returns JSX элемент с отформатированным номером
 */
export const formatTrackingNumberWithIcon = (
  trackingId: string,
  options: {
    provider?: string;
    autoDetectProvider?: boolean;
    showIcon?: boolean;
    iconSize?: 'relative' | 'absolute';
    iconSizeValue?: string;
    showGrouping?: boolean;
    boldLastGroup?: boolean;
    compactMode?: boolean;
    onProviderDetected?: (provider: string) => void;
  } = {}
) => {
  const {
    provider: providedProvider,
    autoDetectProvider = false,
    showIcon = true,
    iconSize = 'relative',
    iconSizeValue = '1.5em',
    showGrouping = true,
    boldLastGroup = true,
    compactMode = false,
    onProviderDetected
  } = options;

  if (!trackingId || trackingId === 'Не вказано') {
    return (
      <span className="text-gray-500">ТТН не вказано</span>
    );
  }

  // Определяем провайдера
  let provider = providedProvider;
  if (!provider && autoDetectProvider) {
    provider = detectTrackingProvider(trackingId);
    if (provider && onProviderDetected) {
      onProviderDetected(provider);
    }
  }
  
  // Если провайдер все еще не определен, попробуем автоматически определить его
  if (!provider) {
    provider = detectTrackingProvider(trackingId);
  }

  const isNovaPoshta = provider === 'novaposhta';
  const isUkrPoshta = provider === 'ukrposhta';
  
  // Пути к иконкам
  const NovaPoshtaIcon = '/icons/nova-poshta.svg';
  const UkrPoshtaIcon = '/icons/ukr-poshta.svg';
  
  // Стили иконки
  const iconStyle = iconSize === 'absolute' 
    ? { width: iconSizeValue, height: iconSizeValue }
    : { width: '1em', height: '1em' };

  // Форматируем номер
  let formattedNumber: React.ReactNode;
  
  if (showGrouping && provider) {
    const cleanId = trackingId.toString().replace(/\s/g, '');
    
    if (compactMode) {
      // Компактный режим - показываем только последние 8 цифр
      if (cleanId.length >= 8) {
        const last8Digits = cleanId.slice(-8);
        const first4 = last8Digits.slice(0, 4);
        const last4 = last8Digits.slice(4, 8);
        
        formattedNumber = (
          <>
            {/* <span style={{ opacity: 0.2 }}>{first4.slice(0, 1)}</span> */}
            {/* <span style={{ opacity: 0.4 }}>{first4.slice(1, 2)}</span> */}
            <span style={{ opacity: 0.3, filter: 'blur(1.2px)' }}>{first4.slice(2, 3)}</span>
            <span style={{ opacity: 0.5, filter: 'blur(0.6px)' }}>{first4.slice(3, 4)}</span>
            {' '}
            {boldLastGroup ? <strong>{last4}</strong> : last4}
          </>
        );
      } else {
        formattedNumber = trackingId;
      }
    } else {
      // Обычный режим
      if (isNovaPoshta && cleanId.length === 14) {
        // Формат Нової Пошти: 20 4512 3266 5506
        const part1 = cleanId.slice(0, 2);
        const part2 = cleanId.slice(2, 6);
        const part3 = cleanId.slice(6, 10);
        const part4 = cleanId.slice(10, 14);
        
        formattedNumber = (
          <>
            {part1} {part2} {part3} {boldLastGroup ? <strong>{part4}</strong> : part4}
          </>
        );
      } else if (isUkrPoshta && cleanId.length === 13) {
        // Формат Укрпошти: 05037 6949 5578
        const part1 = cleanId.slice(0, 5);
        const part2 = cleanId.slice(5, 9);
        const part3 = cleanId.slice(9, 13);
        
        formattedNumber = (
          <>
            {part1} {part2} {boldLastGroup ? <strong>{part3}</strong> : part3}
          </>
        );
      } else {
        formattedNumber = trackingId;
      }
    }
  } else {
    formattedNumber = trackingId;
  }

  // Определяем иконку
  let iconSrc = null;
  let iconAlt = '';
  
  if (showIcon && provider) {
    if (isNovaPoshta) {
      iconSrc = NovaPoshtaIcon;
      iconAlt = 'Нова Пошта';
    } else if (isUkrPoshta) {
      iconSrc = UkrPoshtaIcon;
      iconAlt = 'Укрпошта';
    }
  }

  return (
    <>
      {showIcon && iconSrc && (
        <img 
          src={iconSrc} 
          alt={iconAlt} 
          style={iconStyle}
          className="inline-block"
        />
      )}
      <span>{formattedNumber}</span>
    </>
  );
};
