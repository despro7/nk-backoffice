import React, { useEffect, useState } from 'react';
import { Button, Chip, Drawer, DrawerBody, DrawerContent, DrawerHeader, Spinner } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { ChatwootBotDialogDto } from '@shared/types/chatwootBotDialogs';
import { chatwootBotApi } from '@/services/ChatwootBotService';
import {
  BotBubble,
  BotTurnMeta,
  CustomerBubble,
  type InstructionSource,
  type OpenArticle,
} from '../ChatwootBotSettings/components/BotTurnView';
import { formatDateTime, TURN_OUTCOME_META } from './dialogMeta';

const LIVE_VERIFY_TOOLTIP = 'Стан верифікації розмови після цього повідомлення (замовлення, відкриті клієнту, і невдалі спроби).';

type Props = {
  conversationId: number | null;
  instructionSource: InstructionSource;
  openArticle: OpenArticle;
  onClose: () => void;
};

/** Розмова з журналу: репліки клієнта, відповіді бота і логіка кожної відповіді (як у пісочниці). */
export function DialogDrawer({ conversationId, instructionSource, openArticle, onClose }: Props) {
  const [dialog, setDialog] = useState<ChatwootBotDialogDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (conversationId == null) return;
    let cancelled = false;
    setDialog(null);
    setError(null);
    chatwootBotApi
      .getDialog(conversationId)
      .then((data) => !cancelled && setDialog(data))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Не вдалося завантажити діалог'));
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  return (
    <Drawer isOpen={conversationId != null} onClose={onClose} size="3xl" placement="right">
      <DrawerContent>
        <DrawerHeader className="flex items-center gap-2 border-b border-default-200">
          <DynamicIcon name="messages-square" size={20} className="text-default-600" />
          <span>Розмова #{conversationId}</span>
          {dialog?.chatwootUrl ? (
            <Button
              as="a"
              href={`${dialog.chatwootUrl}/${conversationId}`}
              target="_blank"
              rel="noreferrer"
              size="sm"
              variant="flat"
              className="ml-2"
              startContent={<DynamicIcon name="external-link" size={14} />}
            >
              Відкрити в Chatwoot
            </Button>
          ) : null}
        </DrawerHeader>
        <DrawerBody className="py-4">
          {error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : !dialog ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : (
            <div className="space-y-4">
              {dialog.turns.map((turn) => {
                const meta = TURN_OUTCOME_META[turn.outcome];
                return (
                  <div key={turn.id} className="space-y-2">
                    <CustomerBubble
                      text={turn.customerText}
                      footer={
                        <span className="text-[11px] text-default-400">
                          {formatDateTime(turn.createdAt)}
                          {turn.inHours === false ? ' · поза годинами' : ''}
                        </span>
                      }
                    />
                    <BotBubble
                      texts={turn.replies}
                      emptyText={turn.outcome === 'human_active' ? 'Розмову веде оператор — бот не відповідав' : undefined}
                    >
                      <BotTurnMeta
                        badge={meta}
                        detail={[turn.dryRun ? 'dry_run' : null, turn.detail].filter(Boolean).join(' · ') || null}
                        verify={turn.verify}
                        verifyTooltip={LIVE_VERIFY_TOOLTIP}
                        meta={turn.llm}
                        instructionSource={instructionSource}
                        openArticle={openArticle}
                      />
                    </BotBubble>
                  </div>
                );
              })}
              {dialog.turns.length === 0 ? <p className="text-sm text-default-400">У розмові немає ходів бота.</p> : null}
              <Chip size="sm" variant="flat" className="text-default-500">
                Показано лише повідомлення, на які реагував бот; відповіді операторів — у Chatwoot.
              </Chip>
            </div>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
