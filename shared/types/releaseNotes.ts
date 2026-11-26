/** Структура shared/releaseNotes.json: розділ «Що нового». */
export type ReleaseNoteType = 'new' | 'improved' | 'fixed';

export interface ReleaseNoteItem {
  type: ReleaseNoteType;
  /** Проста українська, без технічних термінів. */
  text: string;
  /** Ключ права (shared/constants/permissions.ts). Без права пункт приховано. */
  permission?: string;
}

export interface Release {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  items: ReleaseNoteItem[];
}

export interface ReleaseNotes {
  unreleased: ReleaseNoteItem[];
  releases: Release[];
}
