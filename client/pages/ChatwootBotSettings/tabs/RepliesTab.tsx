import React from 'react';
import { AutoReplyRulesCard, FallbackCard } from '../cards/ReplyCards';
import { SettingsColumns, type SettingsCardProps } from '../cards/SettingsCard';

export function RepliesTab({ page }: SettingsCardProps) {
  return <SettingsColumns left={<AutoReplyRulesCard page={page} />} right={<FallbackCard page={page} />} />;
}
