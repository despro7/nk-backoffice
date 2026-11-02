import React from 'react';
import { AiModelCard } from '../cards/AiCards';
import { AiInstructionsCard } from '../cards/AiInstructionsCard';
import { SettingsColumns, type SettingsCardProps } from '../cards/SettingsCard';
import { ChatwootBotLlmToolsPanel } from '../components/ChatwootBotLlmToolsPanel';

export function AiTab({ page }: SettingsCardProps) {
  return (
    <div className="flex flex-col gap-6">
      <SettingsColumns left={<AiModelCard page={page} />} right={<ChatwootBotLlmToolsPanel />} />
      <AiInstructionsCard page={page} />
    </div>
  );
}
