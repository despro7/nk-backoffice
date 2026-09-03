import { Card, CardBody } from '@heroui/react';

interface HrComingSoonProps {
  title: string;
  description: string;
}

export function HrComingSoon({ title, description }: HrComingSoonProps) {
  return (
    <Card>
      <CardBody className="p-8 text-center space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-600">{description}</p>
      </CardBody>
    </Card>
  );
}
