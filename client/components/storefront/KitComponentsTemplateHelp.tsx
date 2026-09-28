import React from 'react';
import { Accordion, AccordionItem } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="text-[11px] leading-relaxed bg-gray-50 border border-gray-200 rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap font-mono text-gray-800">
      {children}
    </pre>
  );
}

function InlineCode({ children }: { children: string }) {
  return <code className="text-[11px] bg-gray-100 px-1 py-0.5 rounded font-mono">{children}</code>;
}

function ExampleSection({
  title,
  description,
  template,
  result,
}: {
  title: string;
  description?: string;
  template?: string;
  result: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-800">{title}</p>
      {description && <p className="text-xs text-gray-500">{description}</p>}
      <p className="text-[11px] font-medium text-gray-600">Шаблон</p>
      <CodeBlock>{template}</CodeBlock>
      <p className="text-[11px] font-medium text-gray-600">Результат</p>
      <CodeBlock>{result}</CodeBlock>
    </div>
  );
}

const DEFAULT_GROUPED_TEMPLATE = `{{#kitGroups}}
{{#if groupTotalQty > 1 || groupItemCount > 1}}
<h4>{{groupTotalQty}} {{groupTotalQtyLabel}} {{groupLabelGenitive}}{{groupWeightSuffix}}:</h4>
{{/if}}
<ul>
{{#kitItems}}
<li>{{name}} – {{qty}} {{qtyLabel}}{{#if qty > 1 }} по {{/if}}{{itemWeight}}</li>
{{/kitItems}}
</ul>
{{/kitGroups}}`;

export function KitComponentsTemplateHelp() {
  return (
    <Accordion
      variant="light"
      
      isCompact={true}
      className="px-0"
      itemClasses={{
        base: 'border border-gray-200 rounded-md bg-gray-50/60',
        trigger: 'py-2 px-3',
        content: 'px-3 pb-3 pt-0',
        title: 'text-xs font-medium text-gray-700',
        subtitle: 'text-[11px] text-gray-500',
      }}
    >
      <AccordionItem
        key="kit-template-help"
        aria-label="Підказки та приклади шаблону складу комплекту"
        title="Підказки та приклади шаблону"
        subtitle="Цикли, плейсхолдери, умови та готові комбінації"
        startContent={<DynamicIcon name="book-open" size={14} className="text-gray-400 shrink-0" />}
      >
        <div className="space-y-4 text-xs text-gray-600">
          <div className="space-y-2">
            <p className="font-semibold text-gray-800">Цикли</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <InlineCode>{'{{#kitGroups}}...{{/kitGroups}}'}</InlineCode> — групи за категоріями
                BOM (порядок — з налаштувань «Категорії комплекту»)
              </li>
              <li>
                <InlineCode>{'{{#kitItems}}...{{/kitItems}}'}</InlineCode> — позиції всередині
                поточної групи
              </li>
              <li>
                <InlineCode>{'{{#kitItemsAll}}...{{/kitItemsAll}}'}</InlineCode> — усі позиції
                без групування
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="font-semibold text-gray-800">Плейсхолдери групи</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <InlineCode>{'{{groupLabel}}'}</InlineCode>,{' '}
                <InlineCode>{'{{groupLabelGenitive}}'}</InlineCode> — назва категорії /
                у родовому відмінку («перших страв», «з інших категорій»)
              </li>
              <li>
                <InlineCode>{'{{groupTotalQty}}'}</InlineCode>,{' '}
                <InlineCode>{'{{groupTotalQtyLabel}}'}</InlineCode> — кількість порцій у групі та
                відмінювання («порція / порції / порцій»);{' '}
                <InlineCode>{'{{groupItemCount}}'}</InlineCode> — кількість різних позицій
              </li>
              <li>
                <InlineCode>{'{{groupWeight}}'}</InlineCode> — вага для заголовка;{' '}
                <InlineCode>{'{{groupWeightSuffix}}'}</InlineCode> — готовий суфікс{' '}
                <InlineCode>{' (по 400 г)'}</InlineCode> або порожній рядок для fallback-груп
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="font-semibold text-gray-800">Плейсхолдери позиції</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><InlineCode>{'{{name}}'}</InlineCode> — назва компонента</li>
              <li>
                <InlineCode>{'{{qty}}'}</InlineCode>, <InlineCode>{'{{qtyLabel}}'}</InlineCode> —
                кількість і форма («1 порція», «3 порції», «4 порцій»)
              </li>
              <li>
                <InlineCode>{'{{itemWeight}}'}</InlineCode> — вага однієї порції (з BOM або
                дефолту категорії)
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="font-semibold text-gray-800">Умови</p>
            <p>
              <InlineCode>{'{{#if groupTotalQty > 1 || groupItemCount > 1}}'}</InlineCode>…
              <InlineCode>{'{{/if}}'}</InlineCode> — приховує заголовок групи, якщо в ній лише
              одна порція одного товару (зручно для дегустаційних наборів).
            </p>
            <p>
              <InlineCode>{'{{#if qty > 1 }} по {{/if}}'}</InlineCode> — працює всередині{' '}
              <InlineCode>{'{{#kitItems}}'}</InlineCode>: додає «по» лише коли порцій більше однієї.
            </p>
            <p>
              Підтримуються <InlineCode>{'>'}</InlineCode>, <InlineCode>{'>='}</InlineCode>,{' '}
              <InlineCode>{'<'}</InlineCode>, <InlineCode>{'<='}</InlineCode>,{' '}
              <InlineCode>{'=='}</InlineCode>, <InlineCode>{'!='}</InlineCode> та логіка{' '}
              <InlineCode>{'||'}</InlineCode> / <InlineCode>{'&&'}</InlineCode>.
            </p>
          </div>

          <div className="border-t border-gray-200 pt-3 space-y-4">
            <p className="font-semibold text-gray-800">Приклади</p>

            <ExampleSection
              title="1. Стандартне групування за категоріями"
              description="Дефолтний шаблон пресету. Заголовок з'являється, коли в групі більше однієї порції або кількох позицій."
              template={DEFAULT_GROUPED_TEMPLATE}
              result={`6 порцій перших страв (по 400 г):
• Борщ зі свининою – 3 порції по 400 г
• Гороховий суп зі свининою – 3 порції по 400 г

4 порції других страв (по 300 г):
• Плов зі свининою – 4 порції по 300 г`}
            />

            <ExampleSection
              title="2. Дегустаційний набір (без заголовка групи)"
              description="Той самий шаблон, але в BOM лише 1 порція 1 товару — блок {{#if}} не виводиться."
              template={`Той самий шаблон стандартного групування за категоріями`}
              result={`• Борщ – 1 порція 400 г`}
            />

            <ExampleSection
              title="3. Плоский список без групування"
              description="Корисно для простих наборів або коли категорії не важливі."
              template={`{{#kitItemsAll}}
<li>{{name}} – {{qty}} {{qtyLabel}} по {{itemWeight}}</li>
{{/kitItemsAll}}`}
              result={`• Борщ зі свининою – 3 порції по 400 г
• Гороховий суп зі свининою – 3 порції по 400 г
• Плов зі свининою – 4 порції по 300 г`}
            />

            <ExampleSection
              title="4. Категорії без мапінгу (fallback)"
              description="Позиції з невідомих категорій об'єднуються в одну групу. У заголовку немає ваги — використовуйте {{groupWeightSuffix}}."
              template={`{{#kitGroups}}
<p><strong>{{groupTotalQty}} {{groupTotalQtyLabel}} {{groupLabelGenitive}}{{groupWeightSuffix}}:</strong></p>
<ul>
{{#kitItems}}
<li>{{name}} – {{qty}} {{qtyLabel}} по {{itemWeight}}</li>
{{/kitItems}}
</ul>
{{/kitGroups}}`}
              result={`2 порції з інших категорій:
• Узвар з сухофруктів – 1 порція по 400 г
• Салат Шахтар – 1 порція по 450 г`}
            />

            <ExampleSection
              title="5. Legacy-плейсхолдер"
              description="Простий маркований список без групування та без налаштувань категорій."
              template="{{kitComponents}}"
              result={`• Борщ – 2 порції
• Плов – 1 порція`}
            />
          </div>
        </div>
      </AccordionItem>
    </Accordion>
  );
}
