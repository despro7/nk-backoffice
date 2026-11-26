import { Chip, Modal, ModalBody, ModalContent, ModalHeader } from '@heroui/react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { formatReleaseDate } from '@shared/utils/releaseNotes';
import type { Release, ReleaseNoteType } from '@shared/types/releaseNotes';
import { cn } from '@/lib/utils';

const SECTIONS: Array<{ type: ReleaseNoteType; label: string; icon: IconName; className: string }> = [
  { type: 'new', label: 'Нове', icon: 'plus', className: 'bg-success-100 text-success-700' },
  { type: 'improved', label: 'Покращено', icon: 'arrow-up-right', className: 'bg-blue-100 text-blue-600' },
  { type: 'fixed', label: 'Виправлено', icon: 'check', className: 'bg-warning-100 text-warning-700' },
];

interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Уже відфільтровані за правами, від нових до старих. */
  releases: Release[];
  /** z-index wrapper/backdrop: модалка має бути над сайдбаром і банером оновлення. */
  overlayZClassName?: string;
}

export function WhatsNewModal({ isOpen, onClose, releases, overlayZClassName = 'z-[80]' }: WhatsNewModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      scrollBehavior="inside"
      placement="center"
      classNames={{ wrapper: overlayZClassName, backdrop: overlayZClassName, closeButton: 'top-3.5 right-4' }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-lg font-semibold border-b border-divider">
          <DynamicIcon name="sparkles" size={20} className="shrink-0" />
          Що нового
        </ModalHeader>
        <ModalBody className="gap-0 py-0">
          {releases.length === 0 && (
            <p className="py-6 text-sm text-default-500">Поки що тут порожньо.</p>
          )}
          {releases.map((release) => (
            <section key={release.version} className="py-4 border-b border-divider last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-default-900">{formatReleaseDate(release.date)}</h3>
                <Chip size="sm" variant="flat">v{release.version}</Chip>
              </div>
              {SECTIONS.map((section) => {
                const items = release.items.filter((item) => item.type === section.type);
                if (items.length === 0) return null;
                return (
                  <div key={section.type} className="mt-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-default-700">
                      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full', section.className)}>
                        <DynamicIcon name={section.icon} size={12} />
                      </span>
                      {section.label}
                    </div>
                    <ul className="mt-1.5 list-disc space-y-1 pl-11 text-sm text-default-700">
                      {items.map((item) => (
                        <li key={item.text}>{item.text}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          ))}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
