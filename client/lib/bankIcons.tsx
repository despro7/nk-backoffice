import React from 'react';

/**
 * Утиліта для отримання SVG іконки банку на основі назви
 * @param name Назва банку або рахунку
 * @returns JSX елемент з іконкою банку
 */
export const getBankIcon = (name: string): JSX.Element => {
  const lowerName = name.toLowerCase();
  
  if (lowerName.includes('приват')) {
    return <img src="/icons/payments/privat.svg" alt="ПриватБанк" className="w-5 h-5" />;
  }
  if (lowerName.includes('моно')) {
    return <img src="/icons/payments/mono.svg" alt="Monobank" className="w-5 h-5" />;
  }
  if (lowerName.includes('універсал')) {
    return <img src="/icons/payments/universal.svg" alt="Універсал Банк" className="w-5 h-5" />;
  }
  if (lowerName.includes('ощад')) {
    return <img src="/icons/payments/oschad.svg" alt="Ощадбанк" className="w-5 h-5" />;
  }
  if (lowerName.includes('райффайзен') || lowerName.includes('raiffeisen')) {
    return <img src="/icons/payments/raiffeisen.svg" alt="Райффайзен Банк" className="w-5 h-5" />;
  }
  if (lowerName.includes('пумб') || lowerName.includes('pumb')) {
    return <img src="/icons/payments/pumb.svg" alt="ПУМБ" className="w-5 h-5" />;
  }
  if (lowerName.includes('укрсіб') || lowerName.includes('укрсиб') || lowerName.includes('ukrsib')) {
    return <img src="/icons/payments/ukrsib.svg" alt="УкрСіббанк" className="w-5 h-5" />;
  }
  if (lowerName.includes('otp')) {
    return <img src="/icons/payments/otp.svg" alt="OTP Банк" className="w-5 h-5" />;
  }
  if (lowerName.includes('таском') || lowerName.includes('tascom')) {
    return <img src="/icons/payments/tascom.svg" alt="Таскомбанк" className="w-5 h-5" />;
  }
  if (lowerName.includes('новапей') || lowerName.includes('novapay')) {
    return <img src="/icons/payments/novapay.svg" alt="Нова Пошта" className="w-5 h-5" />;
  }
  
  // Загальна іконка для невизначених банків
  return <img src="/icons/payments/blank.svg" alt="Банк" className="w-5 h-5" />;
};

/**
 * Утиліта для отримання іконки способу оплати
 * @param name Назва способу оплати
 * @returns JSX елемент з іконкою способу оплати
 */
export const getPaymentIcon = (name: string): JSX.Element => {
  const lowerName = name.toLowerCase();
  
  if (lowerName.includes('безготівк') || lowerName.includes('безналичн') || lowerName.includes('післяплата')) {
    return <img src="/icons/payments/bank.svg" alt="Безготівковий" className="w-5 h-5" />;
  }
  if (lowerName.includes('готівка') || lowerName.includes('готівкою')) {
    return <span className="w-5 h-5 shrink-0 rounded-full bg-amber-500 text-white text-md flex items-center justify-center font-medium">₴</span>;
  }
  if (lowerName.includes('картк') || lowerName.includes('card')) {
    return <img src="/icons/payments/card.svg" alt="Безготівковий" className="w-5 h-5" />;
  }
  if (lowerName.includes('лікпей') || lowerName.includes('liqpay')) {
    return <img src="/icons/payments/liqpay.svg" alt="LiqPay" className="w-5 h-5" />;
  }
	if (lowerName.includes('новапей') || lowerName.includes('novapay') || lowerName.includes('наложений') || lowerName.includes('накладений')) {
    return <img src="/icons/payments/novapay.svg" alt="NovaPay" className="w-5 h-5" />;
  }
	if (lowerName.includes('моно') || lowerName.includes('mono')) {
    return <img src="/icons/payments/mono.svg" alt="Monobank" className="w-5 h-5" />;
  }
	if (lowerName.includes('prom') || lowerName.includes('пром')) {
    return <img src="/icons/payments/prom.svg" alt="Prom" className="w-5 h-5" />;
  }
	if (lowerName.includes('розетка') || lowerName.includes('rozetka')) {
    return <img src="/icons/payments/rozetka.svg" alt="Rozetka" className="w-5 h-5" />;
  }
  if (lowerName.includes('credit') || lowerName.includes('кретид')) {
    return <img src="/icons/payments/credit.svg" alt="Credit" className="w-5 h-5" />;
  }
  if (lowerName.includes('apple pay')) {
    return <img src="/icons/payments/apple_pay.svg" alt="Apple Pay" className="w-5 h-5" />;
  }
  if (lowerName.includes('google pay')) {
    return <img src="/icons/payments/google_pay.svg" alt="Google Pay" className="w-5 h-5" />;
  }

  return <span className="w-4 h-4 bg-gray-400 rounded text-white text-xs flex items-center justify-center font-bold">₴</span>;
};