import type { ReactNode } from 'react';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { HrSpecChip } from '../hrUi';
import { getSpecColorByHue } from '@shared/utils/specColorPalette';

interface PayrollHelpDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

function HelpSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      <div className="space-y-2 text-sm text-default-600">{children}</div>
    </section>
  );
}

export function PayrollHelpDrawer({ isOpen, onClose }: PayrollHelpDrawerProps) {
  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="md" scrollBehavior="inside">
      <DrawerContent>
        <DrawerHeader className="flex items-center gap-2 border-b border-slate-200 pb-3">
          <DynamicIcon name="circle-question-mark" size={18} className="text-primary" />
          <span className="text-lg font-semibold">Довідка: Розрахунок виплат</span>
        </DrawerHeader>
        <DrawerBody className="gap-6 py-4">
          <p className="text-sm text-default-600">
            Цей розділ повторює логіку Excel-файлу «Табель 2026» для внутрішнього обліку. Це не
            податковий розрахунок — лише допомога бухгалтерії та керівникам.
          </p>

          <HelpSection title="Кнопка «Розрахувати»">
            <p>
              Бере актуальний табель за обраний місяць, ставки співробітників і формулу Tabell 2026,
              обчислює суми по тижнях та зберігає <strong>знімок</strong> у базі.
            </p>
            <p>
              Після розрахунку з&apos;являється бейдж «Знімок» — це означає, що суми зафіксовані і
              можна відмічати виплати. Якщо табель зміниться, натисніть «Розрахувати» знову для
              перерахунку (поки період не заблоковано).
            </p>
          </HelpSection>

          <HelpSection title="Кнопка «Заблокувати»">
            <p>
              Доступна лише після збереженого знімку (статус «calculated»). Блокує період: повторний
              перерахунок з живих ставок стає неможливим. Виплати, які вже відмічені, залишаються.
            </p>
            <p>Після блокування з&apos;являється бейдж «Заблоковано».</p>
          </HelpSection>

          <HelpSection title="Бейджі стану">
            <div className="flex flex-wrap gap-2">
              <HrSpecChip tokens={getSpecColorByHue('emerald', 'light', 'soft')}>Знімок</HrSpecChip>
              <HrSpecChip tokens={getSpecColorByHue('slate', 'light', 'soft')}>Попередній перегляд</HrSpecChip>
              <HrSpecChip tokens={getSpecColorByHue('amber', 'light', 'soft')}>Заблоковано</HrSpecChip>
            </div>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Знімок</strong> — розрахунок збережено, можна фіксувати виплати.
              </li>
              <li>
                <strong>Попередній перегляд</strong> — суми пораховані «на льоту» з табеля, але знімок
                ще не збережено.
              </li>
              <li>
                <strong>Заблоковано</strong> — період закрито для змін.
              </li>
            </ul>
          </HelpSection>

          <HelpSection title="Таблиця розрахунку">
            <ul className="list-disc space-y-1 pl-5">
              <li>Таби над таблицею фільтрують групи оплати (офіційна ставка, погодинні тощо).</li>
              <li>Клік по ПІБ відкриває деталі співробітника з розбивкою формули.</li>
              <li>
                Клік по сумі в комірці відкриває вікно виплати — можна змінити суму і відмітити як
                виплачену.
              </li>
              <li>
                Комірки з уже відміченими виплатами підсвічуються{' '}
                <span className="rounded bg-lime-100 px-1">лаймовим</span> кольором.
              </li>
              <li>Рядки «Разом · група» та «Загалом» підсумовують суми по тижнях.</li>
              <li>Години змінюються лише в розділі «Табель» — тут вони лише для перегляду.</li>
            </ul>
          </HelpSection>

          <HelpSection title="Формула Tabell 2026">
            <p>
              Для групи «Офіційна ставка» застосовується: нараховано = ставка × години / норма,
              далі коефіцієнт ×0,23 і дільник /0,77 (як у Excel). Для погодинних і неофіційних груп
              сума = ставка × години (або місячна ставка × години / норма).
            </p>
            <p className="text-xs text-default-400">
              Коефіцієнти зберігаються окремо для кожного місяця. Редагуйте їх кнопкою «Формула» на
              панелі — після збереження натисніть «Розрахувати». Після «Заблокувати» зміни неможливі.
            </p>
          </HelpSection>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
