import { Button, Card, CardBody, Spinner } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { Link, useParams } from 'react-router-dom';
import { useTechCard } from '../useTechCards';
import { TechCardDocument, TechCardMeta } from '../components/TechCardDocument';

/** Сторінка техкарти `/production/techcards/:goodId`. */
export default function TechCardPage() {
  const { goodId = '' } = useParams<{ goodId: string }>();
  const { data, loading, error } = useTechCard(goodId || null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <Button
          as={Link}
          to="/production/techcards"
          variant="light"
          isIconOnly
          aria-label="До списку техкарт"
          title="До списку техкарт"
        >
          <DynamicIcon name="arrow-left" size={18} />
        </Button>
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-2xl font-semibold text-default-900">
            Техкарта{data ? ` «${data.good.name}»` : ''}
          </h1>
          {data && <TechCardMeta data={data} />}
        </div>
      </div>

      <Card className="shadow-none rounded-lg">
        <CardBody className="p-4 md:p-6">
          {loading && (
            <div className="flex items-center justify-center h-40">
              <Spinner size="sm" />
            </div>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          {data && <TechCardDocument data={data} />}
        </CardBody>
      </Card>
    </div>
  );
}
