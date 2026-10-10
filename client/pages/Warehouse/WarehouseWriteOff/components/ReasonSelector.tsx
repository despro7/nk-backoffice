import { Select, SelectItem, Input } from '@heroui/react';

const DEFAULT_REASONS = ['Брак товару', 'Компенсація', 'Проба', 'Інше'];

interface Props {
  reason: string;
  setReason: (r: string) => void;
  customReason: string;
  setCustomReason: (s: string) => void;
  comment: string;
  setComment: (s: string) => void;
  title?: string;
  reasons?: string[];
  commentPlaceholder?: string;
}

export default function ReasonSelector({
  reason,
  setReason,
  customReason,
  setCustomReason,
  comment,
  setComment,
  title = 'Причина списання',
  reasons = DEFAULT_REASONS,
  commentPlaceholder = "Коментар до списання (необов'язково)",
}: Props) {
  return (
    <div>
      <h2 className="font-medium mb-2 mt-6">{title}</h2>
      <div className="bg-white rounded-xl mb-6 p-4 flex gap-4 flex-row">
        <Select
          aria-label="Причина списання"
          value={reason}
          onChange={(e:any)=>setReason(e.target.value)}
          placeholder="Оберіть причину (обов'язково)"
          selectedKeys={reason ? [reason] : ['']}
          disallowEmptySelection={true}
          classNames={{ base: "max-w-xs", trigger: 'w-full border border-gray-200 bg-white' }}
        >
          {reasons.map((item) => (
            <SelectItem key={item} textValue={item}>{item}</SelectItem>
          ))}
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
          placeholder={commentPlaceholder}
          value={comment}
          onChange={(e:any)=>setComment(e.target.value)}
          classNames={{ inputWrapper: 'border border-gray-200 bg-white', input: 'placeholder:opacity-50!' }}
        />
      </div>
    </div>
  );
}
