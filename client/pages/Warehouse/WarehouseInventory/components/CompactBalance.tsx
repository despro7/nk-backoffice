interface Props {
  total?: number | null;
  portionsPerBox?: number | null;
  sessionItem?: any;
}

const CompactBalance = ({ total, portionsPerBox, sessionItem }: Props) => {
  if (total === null || total === undefined) return <>–</>;
  if (!portionsPerBox || portionsPerBox <= 0) return <>{String(total)}</>;

  if (sessionItem && sessionItem.boxCount !== undefined && sessionItem.boxCount !== null) {
    const bc = sessionItem.boxCount ?? 0;
    const ac = sessionItem.actualCount ?? 0;
    return <>{total} <span className="text-gray-500 text-xs">({bc}/{ac})</span></>;
  }

  const boxes = Math.floor(Number(total) / portionsPerBox);
  const rest = Number(total) % portionsPerBox;
  return <>{total} <span className="text-gray-500 text-xs">({boxes}/{rest})</span></>;
};

export default CompactBalance;
