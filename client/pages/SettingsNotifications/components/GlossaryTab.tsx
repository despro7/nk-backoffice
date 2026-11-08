import { useState } from 'react';
import { Button, Card, CardBody, Checkbox, Input, Switch } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { applyGlossary } from '@shared/notifications/ruleEngine';
import type { NotificationGlossaryEntry } from '@shared/types/notificationRules';

interface GlossaryTabProps {
  glossary: NotificationGlossaryEntry[];
  onSave: (entry: NotificationGlossaryEntry) => Promise<boolean>;
  onDelete: (entry: NotificationGlossaryEntry) => Promise<void>;
}

function GlossaryRow({ entry, onSave, onDelete }: { entry: NotificationGlossaryEntry } & Omit<GlossaryTabProps, 'glossary'>) {
  const [draft, setDraft] = useState(entry);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(entry);
  const key = entry.id ?? 'new';

  const save = async () => {
    setBusy(true);
    const ok = await onSave(draft);
    setBusy(false);
    if (ok && entry.id == null) setDraft({ ...entry });
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto_auto] items-center gap-2 px-3 py-2">
      <Input id={`gl-phrase-${key}`} size="sm" placeholder="Фраза або regex" classNames={{ input: draft.isRegex ? 'font-mono text-xs' : '' }} value={draft.phrase} onValueChange={(phrase) => setDraft({ ...draft, phrase })} />
      <Input id={`gl-repl-${key}`} size="sm" placeholder="Заміна (порожньо – прибрати)" value={draft.replacement} onValueChange={(replacement) => setDraft({ ...draft, replacement })} />
      <Checkbox size="sm" isSelected={draft.isRegex} onValueChange={(isRegex) => setDraft({ ...draft, isRegex })}>regex</Checkbox>
      <Switch size="sm" aria-label="Увімкнено" isSelected={draft.enabled} onValueChange={(enabled) => setDraft({ ...draft, enabled })} />
      <div className="flex gap-1">
        <Button
          isIconOnly
          size="sm"
          variant={dirty ? 'solid' : 'light'}
          color={dirty ? 'primary' : 'default'}
          aria-label="Зберегти"
          isDisabled={!dirty || busy || !draft.phrase.trim()}
          onPress={save}
        >
          <DynamicIcon name={busy ? 'loader-2' : entry.id == null ? 'plus' : 'save'} size={15} className={busy ? 'animate-spin' : ''} />
        </Button>
        {entry.id != null && (
          <Button isIconOnly size="sm" variant="light" className="text-rose-600" aria-label="Видалити" onPress={() => onDelete(entry)}>
            <DynamicIcon name="trash-2" size={15} />
          </Button>
        )}
      </div>
    </div>
  );
}

const NEW_ENTRY: NotificationGlossaryEntry = { phrase: '', replacement: '', isRegex: false, enabled: true, position: 0 };

export function GlossaryTab({ glossary, onSave, onDelete }: GlossaryTabProps) {
  const [sample, setSample] = useState('Document not saved. Access denied for <b>saleOrder</b>');

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="shadow-container">
        <CardBody className="gap-2 p-3">
          <p className="px-1 text-xs text-default-500">
            Словник застосовується до заголовка й тексту всіх сповіщень після правил, по черзі зверху вниз. Регістр не враховується.
          </p>
          <div className="divide-y divide-default-100 rounded-lg border border-default-200">
            {glossary.map((g) => (
              <GlossaryRow key={`${g.id}-${g.phrase}-${g.replacement}-${g.enabled}-${g.isRegex}`} entry={g} onSave={onSave} onDelete={onDelete} />
            ))}
            <GlossaryRow key={`new-${glossary.length}`} entry={NEW_ENTRY} onSave={onSave} onDelete={onDelete} />
          </div>
        </CardBody>
      </Card>
      <Card className="shadow-container">
        <CardBody className="gap-3">
          <span className="text-sm font-semibold">Перевірити на тексті</span>
          <Input id="glossary-sample" size="sm" label="Текст" value={sample} onValueChange={setSample} />
          <div className="rounded-lg bg-default-50 p-3 text-sm text-default-800">{applyGlossary(sample, glossary) || '–'}</div>
        </CardBody>
      </Card>
    </div>
  );
}
