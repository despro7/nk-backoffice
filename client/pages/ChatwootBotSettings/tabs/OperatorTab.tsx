import React from 'react';
import {
  InHoursMessagesCard,
  OperatorCallCard,
  OutOfHoursMessagesCard,
  ReclaimCard,
  WorkingHoursCard,
} from '../cards/OperatorCards';
import { SettingsColumns, type SettingsCardProps } from '../cards/SettingsCard';

export function OperatorTab({ page }: SettingsCardProps) {
  return (
    <SettingsColumns
      left={
        <>
          <OperatorCallCard page={page} />
          <WorkingHoursCard page={page} />
          <InHoursMessagesCard page={page} />
        </>
      }
      right={
        <>
          <OutOfHoursMessagesCard page={page} />
          <ReclaimCard page={page} />
        </>
      }
    />
  );
}
