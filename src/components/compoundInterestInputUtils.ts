export function normalizeDecimalInput(rawValue: string): string {
  const normalized = rawValue.replace(/\./g, ",").replace(/[^0-9,]/g, "");
  const firstCommaIndex = normalized.indexOf(",");
  if (firstCommaIndex < 0) {
    return normalized;
  }

  return `${normalized.slice(0, firstCommaIndex + 1)}${normalized.slice(firstCommaIndex + 1).replace(/,/g, "")}`;
}

export function parseRateInput(rawValue: string): number {
  const normalizedValue = rawValue.trim().replace(",", ".");
  if (!normalizedValue || normalizedValue === ".") {
    return 0;
  }

  const parsed = Number(normalizedValue.endsWith(".") ? normalizedValue.slice(0, -1) : normalizedValue);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return 0;
  }

  return Math.max(parsed, 0);
}

export function normalizePastedNumeric(rawValue: string): string {
  const normalized = rawValue.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const chunks = normalized.split(".");
  return chunks.length > 2 ? `${chunks[0]}.${chunks.slice(1).join("")}` : normalized;
}
