import React from 'react';
import { ClientMessagesCard, OperatorCallCard, ReclaimCard, WorkingHoursCard } from '../cards/OperatorCards';
import { SettingsColumns, type SettingsCardProps } from '../cards/SettingsCard';

export function OperatorTab({ page }: SettingsCardProps) {
  return (
    <SettingsColumns
      left={
        <>
          <OperatorCallCard page={page} />
          <WorkingHoursCard page={page} />
          <ClientMessagesCard page={page} />
        </>
      }
      right={<ReclaimCard page={page} />}
    />
  );
}
