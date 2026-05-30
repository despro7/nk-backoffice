export function getTotalStock(stockBalances: { [warehouse: string]: number }): number {
  return Object.values(stockBalances).reduce((sum, balance) => sum + balance, 0);
}

export function getMainStock(stockBalances: { [warehouse: string]: number }): number {
  return stockBalances["1"] || 0;
}

export function getSmallStock(stockBalances: { [warehouse: string]: number }): number {
  return Object.entries(stockBalances)
    .filter(([warehouseId]) => warehouseId !== "1")
    .reduce((sum, [, balance]) => sum + balance, 0);
}