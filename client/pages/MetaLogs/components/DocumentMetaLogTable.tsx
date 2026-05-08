import MetaLogTable from './MetaLogTable';
import type { MetaLogRow } from '@shared/types/metaLog';

export default function DocumentMetaLogTable({ rows, title, isAdmin, onResolve, loading }: { rows: MetaLogRow[]; title?: string; isAdmin?: boolean; onResolve?: (sourceIds: Array<number | string>) => Promise<void>; loading?: boolean }) {
  return (
    <MetaLogTable rows={rows} title={title ?? 'Збереження документів'} hideOrderNumber={true} isAdmin={isAdmin} onResolve={onResolve} loading={loading} />
  );
}
