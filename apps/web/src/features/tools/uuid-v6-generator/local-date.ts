function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

export function formatDateTimeLocalInput(milliseconds: number) {
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return "";
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join("T");
}

export function parseDateTimeLocalInput(value: string) {
  if (value.trim() === "") return null;
  const milliseconds = new Date(value).getTime();
  return Number.isNaN(milliseconds) ? null : milliseconds;
}
