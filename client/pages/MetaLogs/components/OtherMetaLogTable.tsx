import MetaLogTable from './MetaLogTable';
import type { MetaLogRow } from '@shared/types/metaLog';

export default function OtherMetaLogTable({ rows, title, isAdmin, onResolve, loading }: { rows: MetaLogRow[]; title?: string; isAdmin?: boolean; onResolve?: (sourceIds: Array<number | string>) => Promise<void>; loading?: boolean }) {
  return (
    <MetaLogTable rows={rows} title={title ?? 'Інші помилки'} isAdmin={isAdmin} onResolve={onResolve} loading={loading} simple={true} />
  );
}
