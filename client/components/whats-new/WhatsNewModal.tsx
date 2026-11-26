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

interface ReleaseDay {
  date: string;
  releases: Release[];
}

/** Сусідні релізи з однаковою датою в одну групу (порядок зберігається). */
function groupByDate(releases: Release[]): ReleaseDay[] {
  const days: ReleaseDay[] = [];
  for (const release of releases) {
    const last = days[days.length - 1];
    if (last && last.date === release.date) last.releases.push(release);
    else days.push({ date: release.date, releases: [release] });
  }
  return days;
}

function updatesLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'оновлення' : 'оновлень';
  return `${count} ${word}`;
}

function VersionChip({ version }: { version: string }) {
  return (
    <Chip size="sm" variant="flat" className="shrink-0">
      v{version}
    </Chip>
  );
}

function ReleaseSections({ release }: { release: Release }) {
  return (
    <>
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
    </>
  );
}

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
          {groupByDate(releases).map((day) => {
            const single = day.releases.length === 1;
            return (
              <section key={day.date} className="py-4 border-b border-divider last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-default-900">{formatReleaseDate(day.date)}</h3>
                  {single ? (
                    <VersionChip version={day.releases[0].version} />
                  ) : (
                    <span className="shrink-0 text-xs text-default-400">{updatesLabel(day.releases.length)}</span>
                  )}
                </div>
                {day.releases.map((release, index) => (
                  <div key={release.version} className={cn(!single && (index === 0 ? 'mt-3' : 'mt-5'))}>
                    {!single && (
                      <div className="flex items-center gap-3">
                        <span className="flex-1 border-t border-dashed border-default-300" />
                        <VersionChip version={release.version} />
                        <span className="flex-1 border-t border-dashed border-default-300" />
                      </div>
                    )}
                    <ReleaseSections release={release} />
                  </div>
                ))}
              </section>
            );
          })}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
