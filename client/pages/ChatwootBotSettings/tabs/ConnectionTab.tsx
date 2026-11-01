import React from 'react';
import { BotStatusCard, ChatwootConnectionCard, TelegramNotifyCard } from '../cards/ConnectionCards';
import { SettingsColumns, type SettingsCardProps } from '../cards/SettingsCard';

export function ConnectionTab({ page }: SettingsCardProps) {
  return (
    <SettingsColumns
      left={<ChatwootConnectionCard page={page} />}
      right={
        <>
          <BotStatusCard page={page} />
          <TelegramNotifyCard page={page} />
        </>
      }
    />
  );
}
