export function formatMoney(amountMinor: number | null, currency = "INR") {
  if (amountMinor === null) return "Price unknown";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(amountMinor / 100);
}

export function formatGymTime(value: string | Date, timeZone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(value));
}

export function relativeTime(value: string | Date) {
  const diff = new Date(value).getTime() - Date.now();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 60) return `${Math.abs(minutes)}m ${minutes < 0 ? "ago" : "from now"}`;
  const hours = Math.round(minutes / 60);
  return `${Math.abs(hours)}h ${hours < 0 ? "ago" : "from now"}`;
}
