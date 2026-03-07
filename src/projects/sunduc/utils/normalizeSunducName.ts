export function normalizeSunducName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}
