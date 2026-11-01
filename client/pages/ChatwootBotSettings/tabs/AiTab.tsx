import React from 'react';
import { AiModelCard } from '../cards/AiCards';
import { SettingsColumns, type SettingsCardProps } from '../cards/SettingsCard';
import { ChatwootBotLlmToolsPanel } from '../components/ChatwootBotLlmToolsPanel';

export function AiTab({ page }: SettingsCardProps) {
  return <SettingsColumns left={<AiModelCard page={page} />} right={<ChatwootBotLlmToolsPanel />} />;
}
