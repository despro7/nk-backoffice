import { Select, SelectItem, Input } from '@heroui/react';

interface Props {
  reason: string;
  setReason: (r: string) => void;
  customReason: string;
  setCustomReason: (s: string) => void;
  comment: string;
  setComment: (s: string) => void;
}

export default function ReasonSelector({ reason, setReason, customReason, setCustomReason, comment, setComment }: Props) {
  return (
    <div>
      <h2 className="font-medium mb-2 mt-6">Причина списання</h2>
      <div className="bg-white rounded-xl mb-6 p-4 flex gap-4 flex-row">
        <Select
          aria-label="Причина списання"
          value={reason}
          onChange={(e:any)=>setReason(e.target.value)}
          selectedKeys={reason ? [reason] : []}
          classNames={{ base: "max-w-xs", trigger: 'w-full border border-gray-200 bg-white' }}
        >
          <SelectItem key="Брак товару" textValue="Брак товару">Брак товару</SelectItem>
          <SelectItem key="Проба" textValue="Проба">Проба</SelectItem>
          <SelectItem key="Інше" textValue="Інше">Інше</SelectItem>
        </Select>
        {reason === 'Інше' &&
          <Input
            aria-label="Додаткова причина"
            value={customReason}
            onChange={(e:any)=>setCustomReason(e.target.value)}
            placeholder="Додаткова причина"
            classNames={{ inputWrapper: 'border border-gray-200 bg-white', input: 'placeholder:opacity-50!' }}
          />
        }

        <Input
          aria-label="Коментар"
          placeholder="Коментар до списання (необов'язково)"
          value={comment}
          onChange={(e:any)=>setComment(e.target.value)}
          classNames={{ inputWrapper: 'border border-gray-200 bg-white', input: 'placeholder:opacity-50!' }}
        />
      </div>
    </div>
  );
}
