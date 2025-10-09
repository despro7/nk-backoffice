import { Button, Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatDate, getStatusColor, getStatusLabel } from '../lib/formatUtils';

interface OrderViewHeaderProps {
  order: any;
  externalId: string;
  onBackClick: () => void;
}

export function OrderViewHeader({ order, externalId, onBackClick }: OrderViewHeaderProps) {
  return (
    <h1 className="text-primary font-inter text-3xl font-semibold leading-[100%] tracking-[-0.64px] h-10 flex items-center gap-4">
      <Button
        color="secondary"
        variant="flat"
        className="text-neutral-500 min-w-fit"
        onPress={onBackClick}
      >
        <DynamicIcon name="arrow-left" size={20} />
      </Button>
      <div className="flex items-end gap-2">
        <span>Замовлення №{order.orderNumber || externalId}</span>
        {order.orderDate && (<span className="font-normal text-xl ml-2 text-gray-500">від {formatDate(order.orderDate)}</span>)}
      </div>
      {order.status && (
        <Chip
          size="md"
          variant="flat"
          classNames={{
            base: getStatusColor(order.status) + " shadow-container",
            content: "font-semibold",
          }}
        >
          {getStatusLabel(order.status)}
        </Chip>
      )}
    </h1>
  );
}

