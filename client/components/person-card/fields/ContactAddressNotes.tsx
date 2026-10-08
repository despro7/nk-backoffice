import { Textarea } from '@heroui/react';
import { PERSON_READ_ONLY_INPUT_CLASSNAMES } from './personCardFieldStyles';

interface ContactAddressNotesProps {
  address: string;
  notes: string;
  canManage?: boolean;
  onAddressChange: (value: string) => void;
  onNotesChange: (value: string) => void;
}

export function ContactAddressNotes({
  address,
  notes,
  canManage = true,
  onAddressChange,
  onNotesChange,
}: ContactAddressNotesProps) {
  return (
    <>
      <Textarea
        label="Адреса"
        placeholder="Місто, вулиця, будинок"
        value={address}
        onValueChange={onAddressChange}
        isReadOnly={!canManage}
        classNames={!canManage ? PERSON_READ_ONLY_INPUT_CLASSNAMES : undefined}
        minRows={3}
      />
      <Textarea
        label="Примітки"
        placeholder="Додаткова інформація"
        value={notes}
        onValueChange={onNotesChange}
        isReadOnly={!canManage}
        classNames={!canManage ? PERSON_READ_ONLY_INPUT_CLASSNAMES : undefined}
        minRows={3}
      />
    </>
  );
}
