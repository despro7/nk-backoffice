// ---------------------------------------------------------------------------
// Утиліти для вікна редагування переміщень (відправник / отримувач)
// ---------------------------------------------------------------------------

export function isWithinEditWindow(
  anchorAt: string | Date | null | undefined,
  windowMinutes: number,
): boolean {
  if (!windowMinutes || windowMinutes <= 0) return false;
  if (!anchorAt) return false;
  const anchor = anchorAt instanceof Date ? anchorAt : new Date(anchorAt);
  if (Number.isNaN(anchor.getTime())) return false;
  return Date.now() - anchor.getTime() <= windowMinutes * 60 * 1000;
}

export function isReceiverOfMovement(
  userId: number | null | undefined,
  movement: { receivedBy?: number | null; receiptScannedBy?: number | null },
): boolean {
  if (userId == null) return false;
  const uid = Number(userId);
  if (movement.receivedBy != null && Number(movement.receivedBy) === uid) return true;
  if (movement.receiptScannedBy != null && Number(movement.receiptScannedBy) === uid) return true;
  return false;
}
