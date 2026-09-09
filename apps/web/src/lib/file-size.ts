const units = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;

export function formatFileSize(bytes: number, locale: string) {
  let value = bytes;
  let index = 0;
  while (value >= 1000 && index < units.length - 1) {
    value /= 1000;
    index++;
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: units[index],
    maximumFractionDigits: index === 0 ? 0 : 1,
  }).format(value);
}
