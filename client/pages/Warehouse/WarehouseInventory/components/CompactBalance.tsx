import { DynamicIcon } from "lucide-react/dynamic";
import { Tooltip } from "@heroui/react";
import { pluralize } from "@/lib/formatUtils";

interface Props {
  total?: number | null;
  portionsPerBox?: number | null;
  sessionItem?: any;
}

const CompactBalance = ({ total, portionsPerBox, sessionItem }: Props) => {
  if (total === null || total === undefined) return <>–</>;
  if (!portionsPerBox || portionsPerBox <= 0) return <>{String(total)}</>;

  if (sessionItem && sessionItem.boxCount !== undefined && sessionItem.boxCount !== null) {
    const bc = sessionItem.boxCount ?? 0;
    const ac = sessionItem.actualCount ?? 0;
    return <span className="inline-flex">
            <Tooltip
              showArrow
              placement="left"
              content={`${bc ? `${bc} ${pluralize(bc, 'коробка', 'коробки', 'коробок')}` : ''}${bc && ac ? ` + ${ac} ${pluralize(ac, 'порція', 'порції', 'порцій')}` : ac ? `${ac} ${pluralize(ac, 'порція', 'порції', 'порцій')}` : ''}`}
              classNames={{ 
                base: 'before:bg-gray-200 before:rounded-[3px]',
                content: 'bg-gray-200 border-1 text-gray-700 text-xs'
              }}
            >
              {total}
            </Tooltip>
          </span>;
  }

  const boxes = Math.floor(Number(total) / portionsPerBox);
  const rest = Number(total) % portionsPerBox;
  return <span className="inline-flex">
          <Tooltip
            showArrow
            placement="left"
            content={`${boxes ? `${boxes} ${pluralize(boxes, 'коробка', 'коробки', 'коробок')}` : ''}${boxes && rest ? ` + ${rest} ${pluralize(rest, 'порція', 'порції', 'порцій')}` : rest ? `${rest} ${pluralize(rest, 'порція', 'порції', 'порцій')}` : ''}`}
            classNames={{ 
              base: 'before:bg-gray-200 before:rounded-[3px]',
              content: 'bg-gray-200 border-1 text-gray-700 text-xs'
            }}
          >
            {total}
          </Tooltip>
        </span>;
};

export default CompactBalance;
