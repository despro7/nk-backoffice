import { Textarea } from '@heroui/react';

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
        labelPlacement="outside"
        placeholder="Місто, вулиця, будинок"
        value={address}
        onValueChange={onAddressChange}
        isReadOnly={!canManage}
        minRows={3}
      />
      <Textarea
        label="Примітки"
        labelPlacement="outside"
        placeholder="Додаткова інформація"
        value={notes}
        onValueChange={onNotesChange}
        isReadOnly={!canManage}
        minRows={3}
      />
    </>
  );
}
