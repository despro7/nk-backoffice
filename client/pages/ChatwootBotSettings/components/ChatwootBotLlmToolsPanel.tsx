import React, { useState } from 'react';
import {
  Accordion,
  AccordionItem,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { chatwootBotApi } from '@/services/ChatwootBotService';
import { CHATWOOT_BOT_LLM_TOOLS } from '@shared/constants/chatwootBotLlmTools';

export function ChatwootBotLlmToolsPanel() {
  const [testingTool, setTestingTool] = useState<string | null>(null);
  const [testOutput, setTestOutput] = useState<string>('');

  const runAdminTest = async (toolName: string, adminTestPath: string) => {
    setTestingTool(toolName);
    setTestOutput('');
    try {
      let data: unknown;
      if (adminTestPath === '/tools/catalog') {
        data = await chatwootBotApi.testCatalog('суп', 5);
      } else if (adminTestPath === '/tools/site-pages') {
        data = await chatwootBotApi.testSitePages({ query: 'достав', limit: 5 });
      } else {
        data = { note: 'Немає admin test для цього tool' };
      }
      setTestOutput(JSON.stringify(data, null, 2));
    } catch (e) {
      setTestOutput(e instanceof Error ? e.message : 'Помилка');
      ToastService.show({
        title: 'Тест tool не вдався',
        description: e instanceof Error ? e.message : undefined,
        color: 'danger',
      });
    } finally {
      setTestingTool(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex gap-2 px-4 items-center border-b border-default-200">
        <DynamicIcon name="wrench" size={20} className="text-default-600" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <h2 className="text-lg font-semibold">Інструменти AI (function calling)</h2>
        </div>
      </CardHeader>
      <CardBody className="gap-4 p-4">
        <p className="text-xs text-default-500 font-normal">
          Модель викликає ці функції в циклі. Каталог SKU — окремо від текстових сторінок сайту.
        </p>
        <Accordion selectionMode="multiple" variant="light">
          {CHATWOOT_BOT_LLM_TOOLS.map((tool) => (
            <AccordionItem
              key={tool.name}
              aria-label={tool.name}
              title={tool.name}
              subtitle={tool.description}
              classNames={{
                title: 'text-sm font-semibold',
                subtitle: 'text-xs text-default-500 font-normal mt-1',
              }}
            >
              <div className="flex flex-col gap-3 pb-2">
                <Card shadow="none" className="border border-default-200">
                  <CardBody className="gap-2 p-3">
                    <p className="text-xs font-semibold text-default-600">Параметри</p>
                    <pre className="text-xs bg-default-100 p-2 rounded-sm overflow-x-auto">
                      {JSON.stringify(tool.parameters.properties, null, 2)}
                    </pre>
                  </CardBody>
                </Card>
                {tool.adminTestNote ? (
                  <p className="text-xs text-default-500">{tool.adminTestNote}</p>
                ) : null}
                {tool.examples.map((ex) => (
                  <Card key={ex.label} shadow="none" className="border border-default-200">
                    <CardBody className="gap-2 p-3">
                      <Chip size="sm" variant="flat">
                        {ex.label}
                      </Chip>
                      <p className="text-xs text-default-500">arguments</p>
                      <pre className="text-xs bg-default-50 p-2 rounded overflow-x-auto">
                        {JSON.stringify(ex.arguments, null, 2)}
                      </pre>
                      <p className="text-xs text-default-500">приклад result</p>
                      <pre className="text-xs bg-default-50 p-2 rounded overflow-x-auto max-h-40">
                        {JSON.stringify(ex.resultSample, null, 2)}
                      </pre>
                    </CardBody>
                  </Card>
                ))}
                {tool.adminTestPath ? (
                  <Button
                    size="sm"
                    variant="flat"
                    color="primary"
                    data-btn-tone="primary-blue-flat"
                    className="self-start"
                    isLoading={testingTool === tool.name}
                    startContent={
                      testingTool !== tool.name ? (
                        <DynamicIcon name="play" size={14} />
                      ) : undefined
                    }
                    onPress={() => void runAdminTest(tool.name, tool.adminTestPath!)}
                  >
                    Тест API{tool.adminTestPath}
                  </Button>
                ) : null}
              </div>
            </AccordionItem>
          ))}
        </Accordion>
        {testOutput ? (
          <Card shadow="none" className="border border-default-200 bg-default-50">
            <CardHeader className="px-3 py-2 border-b border-default-200">
              <p className="text-xs font-semibold text-default-600">Відповідь тесту API</p>
            </CardHeader>
            <CardBody className="p-3">
              <pre className="text-xs overflow-auto max-h-48">{testOutput}</pre>
            </CardBody>
          </Card>
        ) : null}
      </CardBody>
    </Card>
  );
}
