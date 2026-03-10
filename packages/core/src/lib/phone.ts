export function normalizePhoneE164(value: string) {
  const cleaned = value.replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) {
    return null;
  }

  const digits = cleaned.slice(1);
  if (!/^\d{8,15}$/.test(digits)) {
    return null;
  }

  return `+${digits}`;
}
