export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailsMatch(a: string, b: string): boolean {
  const left = normalizeEmail(a);
  const right = normalizeEmail(b);
  return Boolean(left) && Boolean(right) && left === right;
}
