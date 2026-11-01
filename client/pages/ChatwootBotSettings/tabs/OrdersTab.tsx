import React from 'react';
import {
  ContactProfileCard,
  OrderCancelCard,
  OrderCancelNotifyCard,
  VerifyCard,
  VerifyTestCard,
} from '../cards/OrderCards';
import { SettingsColumns, type SettingsCardProps } from '../cards/SettingsCard';

export function OrdersTab({ page }: SettingsCardProps) {
  return (
    <SettingsColumns
      left={
        <>
          <VerifyCard page={page} />
          <VerifyTestCard page={page} />
        </>
      }
      right={
        <>
          <OrderCancelCard page={page} />
          <OrderCancelNotifyCard page={page} />
          <ContactProfileCard page={page} />
        </>
      }
    />
  );
}
