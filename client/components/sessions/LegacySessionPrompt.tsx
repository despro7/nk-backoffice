import { useEffect, useState } from 'react';
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useAuth } from '@/contexts/auth-context';

/**
 * Пропонує перезайти користувачам зі старою сесією (токен без sid, виданий до user_sessions).
 * Без перезаходу сесія доживе до кінця access token, а потім клієнт вийде сам.
 * Відкладення й відмова зберігаються в localStorage цього браузера.
 */

const STORAGE_PREFIX = 'nk-legacy-session-prompt:';
const CHECK_INTERVAL_MS = 60_000;
const HOUR_MS = 60 * 60 * 1000;

type PromptState = { dismissed: true } | { snoozeUntil: number };

const readState = (userId: number): PromptState | null => {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userId);
    return raw ? (JSON.parse(raw) as PromptState) : null;
  } catch {
    return null;
  }
};

const writeState = (userId: number, state: PromptState) => {
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(state));
  } catch {
    // Без сховища вікно просто з'явиться знову після перезавантаження
  }
};

const isDue = (state: PromptState | null): boolean => {
  if (!state) return true;
  if ('dismissed' in state) return false;
  return Date.now() >= state.snoozeUntil;
};

/** Завтра о 9:00 за локальним часом */
const tomorrowMorning = (): number => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date.getTime();
};

const SNOOZE_OPTIONS = [
  { key: '1h', label: 'Через 1 годину', until: () => Date.now() + HOUR_MS },
  { key: '4h', label: 'Через 4 години', until: () => Date.now() + 4 * HOUR_MS },
  { key: 'tomorrow', label: 'Завтра зранку', until: tomorrowMorning },
] as const;

export function LegacySessionPrompt() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const userId = user?.id;
  const isLegacy = Boolean(user?.legacySession);

  useEffect(() => {
    if (!isLegacy || userId === undefined) {
      setIsOpen(false);
      return;
    }

    const check = () => {
      if (isDue(readState(userId))) setIsOpen(true);
    };
    check();
    // Відкладене нагадування спрацьовує й без перезавантаження сторінки
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isLegacy, userId]);

  if (!isLegacy || userId === undefined) return null;

  const snooze = (until: number) => {
    writeState(userId, { snoozeUntil: until });
    setIsOpen(false);
  };

  const dismiss = () => {
    writeState(userId, { dismissed: true });
    setIsOpen(false);
  };

  const logoutNow = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
      setIsOpen(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => snooze(Date.now() + HOUR_MS)}
      isDismissable={false}
      classNames={{ base: 'max-w-lg rounded-xl shadow-lg', footer: 'flex-wrap justify-end gap-2 sm:flex-nowrap' }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-lg font-semibold">
          <DynamicIcon name="shield-check" size={20} className="text-primary" />
          Перезайдіть, будь ласка
        </ModalHeader>
        <ModalBody className="space-y-2 text-sm text-default-600">
          <p>
            Ми оновили систему входу: тепер видно, з яких пристроїв ви увійшли, і будь-який з них можна завершити.
          </p>
          <p>
            Щоб ваш пристрій зʼявився в списку, вийдіть і увійдіть знову. Можна зробити це пізніше: поточна сесія
            працюватиме до кінця свого терміну, після чого система попросить увійти.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button
            color="primary"
            startContent={<DynamicIcon name="log-out" size={16} />}
            isLoading={isLoggingOut}
            onPress={() => void logoutNow()}
          >
            Так, вийти зараз
          </Button>
          <Dropdown>
            <DropdownTrigger>
              <Button variant="flat" startContent={<DynamicIcon name="alarm-clock" size={16} />}>
                Нагадати пізніше
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Коли нагадати"
              onAction={(key) => {
                const option = SNOOZE_OPTIONS.find((item) => item.key === key);
                if (option) snooze(option.until());
              }}
            >
              {SNOOZE_OPTIONS.map((option) => (
                <DropdownItem key={option.key}>{option.label}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
          <Button variant="light" onPress={dismiss}>
            Не зараз
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
