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
    <div className="flex items-center gap-4 max-w-[calc(theme(maxWidth.5xl)+theme(spacing.80)+theme(spacing.8))]">
      <Button
        color="secondary"
        variant="flat"
        className="text-neutral-500 min-w-fit"
        onPress={onBackClick}
      >
        <DynamicIcon name="arrow-left" size={20} />
      </Button>
      <div className="flex items-end gap-2 text-primary font-inter text-3xl font-semibold leading-[100%] tracking-[-0.64px]">
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
    </div>
  );
}

