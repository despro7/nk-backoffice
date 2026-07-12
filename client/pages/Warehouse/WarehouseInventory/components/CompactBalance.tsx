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
    // Якщо обидва значення нуля, не показуємо Tooltip
    if (bc === 0 && ac === 0) {
      return <>{total}</>;
    }
    return <span className="inline-flex">
            <Tooltip
              showArrow
              placement="left"
              content={`${bc ? `${bc} ${pluralize(bc, 'коробка', 'коробки', 'коробок')}` : ''}${bc && ac ? ` + ${ac} ${pluralize(ac, 'порція', 'порції', 'порцій')}` : ac ? `${ac} ${pluralize(ac, 'порція', 'порції', 'порцій')}` : ''}`}
              classNames={{ 
                base: 'before:bg-gray-800 before:rounded-[3px]',
                content: 'bg-gray-800 border-1 border-gray-800 text-gray-100 text-xs'
              }}
            >
              {total}
            </Tooltip>
          </span>;
  }

  const boxes = Math.floor(Number(total) / portionsPerBox);
  const rest = Number(total) % portionsPerBox;
  // Якщо обидва значення нуля, не показуємо Tooltip
  if (boxes === 0 && rest === 0) {
    return <>{total}</>;
  }
  return <span className="inline-flex">
          <Tooltip
            showArrow
            placement="left"
            content={`${boxes ? `${boxes} ${pluralize(boxes, 'коробка', 'коробки', 'коробок')}` : ''}${boxes && rest ? ` + ${rest} ${pluralize(rest, 'порція', 'порції', 'порцій')}` : rest ? `${rest} ${pluralize(rest, 'порція', 'порції', 'порцій')}` : ''}`}
            classNames={{ 
              base: 'before:bg-gray-800 before:rounded-[3px]',
              content: 'bg-gray-800 border-1 border-gray-800 text-gray-100 text-xs'
            }}
          >
            {total}
          </Tooltip>
        </span>;
};

export default CompactBalance;
