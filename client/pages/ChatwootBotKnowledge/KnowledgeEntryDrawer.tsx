import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Divider,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Input,
  Switch,
  Textarea,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { chatwootKnowledgeApi } from '@/services/ChatwootKnowledgeService';
import { UnsavedChangesModal } from '@/components/modals/UnsavedChangesModal';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import {
  CHATWOOT_BOT_KNOWLEDGE_LIMITS as LIMITS,
  type ChatwootBotKnowledgeEntry,
  type ChatwootBotKnowledgeEntryInput,
} from '@shared/types/chatwootBotKnowledge';

type FormState = {
  title: string;
  questionsText: string;
  answer: string;
  tagsText: string;
  enabled: boolean;
};

type Props = {
  isOpen: boolean;
  /** null — нова стаття. */
  entry: ChatwootBotKnowledgeEntry | null;
  /** Попередньо заповнене питання для нової статті (напр., зі статистики). */
  initialQuestion?: string;
  canManage: boolean;
  onClose: () => void;
  onSaved: (entry: ChatwootBotKnowledgeEntry) => void;
};

function toForm(entry: ChatwootBotKnowledgeEntry | null, initialQuestion?: string): FormState {
  return {
    title: entry?.title ?? '',
    questionsText: entry ? entry.questions.join('\n') : (initialQuestion ?? ''),
    answer: entry?.answer ?? '',
    tagsText: entry?.tags.join(', ') ?? '',
    enabled: entry?.enabled ?? true,
  };
}

function toInput(form: FormState): ChatwootBotKnowledgeEntryInput {
  return {
    title: form.title.trim(),
    questions: form.questionsText.split('\n').map((q) => q.trim()).filter(Boolean),
    answer: form.answer.trim(),
    tags: form.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
    enabled: form.enabled,
  };
}

export function KnowledgeEntryDrawer({ isOpen, entry, initialQuestion, canManage, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => toForm(entry, initialQuestion));
  const [initial, setInitial] = useState<FormState>(() => toForm(entry, initialQuestion));
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    const next = toForm(entry, initialQuestion);
    setForm(next);
    setInitial(next);
  }, [isOpen, entry, initialQuestion]);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);
  const update = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async (): Promise<void> => {
    if (!canManage) return;
    setSaving(true);
    try {
      const input = toInput(form);
      const saved = entry
        ? await chatwootKnowledgeApi.update(entry.id, input)
        : await chatwootKnowledgeApi.create(input);
      setInitial(form);
      ToastService.show({ title: entry ? 'Статтю оновлено' : 'Статтю додано', color: 'success' });
      onSaved(saved);
    } catch (e) {
      ToastService.show({
        title: 'Не вдалося зберегти',
        description: e instanceof Error ? e.message : String(e),
        color: 'danger',
      });
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const guard = useUnsavedGuard({ isDirty, onSaveDraft: handleSave });
  const requestClose = guard.guardAction(onClose, {
    title: 'Незбережені зміни',
    message: 'У статті є незбережені зміни. Що зробити перед закриттям?',
    saveText: 'Зберегти і закрити',
    leaveText: 'Закрити без збереження',
    cancelText: 'Залишитись',
  });

  const questionsCount = toInput(form).questions.length;

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onClose={requestClose}
        placement="right"
        size="2xl"
        classNames={{ base: 'flex flex-col', body: 'flex-1 min-h-0 overflow-y-auto', closeButton: 'top-3 right-3' }}
      >
        <DrawerContent>
          <DrawerHeader className="border-b border-default-200 shrink-0">
            {entry ? 'Стаття бази знань' : 'Нова стаття'}
          </DrawerHeader>
          <DrawerBody className="flex flex-col gap-5 py-5 overflow-y-auto min-h-0">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <DynamicIcon name="file-text" size={16} /> Про що стаття
              </h3>
              <Input
                label="Назва"
                value={form.title}
                maxLength={LIMITS.titleMax}
                isReadOnly={!canManage}
                onValueChange={(v) => update('title', v)}
              />
              <Input
                label="Теги (через кому)"
                placeholder="доставка, нова пошта"
                value={form.tagsText}
                isReadOnly={!canManage}
                onValueChange={(v) => update('tagsText', v)}
              />
              <Switch isSelected={form.enabled} isDisabled={!canManage} onValueChange={(v) => update('enabled', v)}>
                <span className="text-sm">Бот використовує статтю</span>
              </Switch>
            </section>

            <Divider className="bg-default-200/60" />

            <section className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <DynamicIcon name="message-circle-question" size={16} /> Як питають клієнти
              </h3>
              <Textarea
                label={`Варіанти питання (${questionsCount})`}
                description="Кожен варіант з нового рядка. Саме за цими словами бот знаходить статтю."
                minRows={4}
                value={form.questionsText}
                isReadOnly={!canManage}
                onValueChange={(v) => update('questionsText', v)}
              />
            </section>

            <Divider className="bg-default-200/60" />

            <section className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <DynamicIcon name="book-open" size={16} /> Факти для відповіді
              </h3>
              <Textarea
                label="Відповідь"
                description="Бот формулює відповідь своїми словами лише за цими фактами."
                minRows={6}
                maxLength={LIMITS.answerMax}
                value={form.answer}
                isReadOnly={!canManage}
                onValueChange={(v) => update('answer', v)}
              />
            </section>
          </DrawerBody>
          <DrawerFooter className="border-t border-default-200 shrink-0">
            <Button variant="light" onPress={requestClose}>
              {canManage ? 'Скасувати' : 'Закрити'}
            </Button>
            {canManage && (
              <Button
                color="primary"
                isDisabled={saving || !isDirty}
                onPress={() => void handleSave().catch(() => undefined)}
                startContent={
                  <DynamicIcon name={saving ? 'loader-2' : 'save'} size={16} className={saving ? 'animate-spin' : ''} />
                }
              >
                Зберегти
              </Button>
            )}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      <UnsavedChangesModal {...guard.modalProps} overlayZClassName="z-[2000]" />
    </>
  );
}
