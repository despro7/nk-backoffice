import React from 'react';
import { Card, CardBody, CardHeader, cn } from '@heroui/react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import type { ChatwootBotSettingsPageModel } from '../useChatwootBotSettingsPage';

export type SettingsCardProps = { page: ChatwootBotSettingsPageModel };

/** Картка налаштувань бота: іконка + заголовок + тіло. Зберігає спільна панель сторінки. */
export function SettingsCard({
  icon,
  title,
  headerEnd,
  className,
  bodyClassName,
  children,
}: {
  icon: IconName;
  title: string;
  headerEnd?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
        <DynamicIcon name={icon} size={20} className="text-default-600 shrink-0" />
        <h2 className="text-lg font-semibold">{title}</h2>
        {headerEnd ? <div className="ml-auto">{headerEnd}</div> : null}
      </CardHeader>
      <CardBody className={cn('gap-4 p-4', bodyClassName)}>{children}</CardBody>
    </Card>
  );
}

/** Дві колонки на lg+, у кожній картки одна під одною. */
export function SettingsColumns({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <div className="flex flex-col gap-6 min-w-0">{left}</div>
      <div className="flex flex-col gap-6 min-w-0">{right}</div>
    </div>
  );
}
