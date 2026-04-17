export function formatDateIST(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString("tr-TR", {
      timeZone: "Europe/Istanbul",
    });
  } catch {
    return dateStr;
  }
}

export function formatTimeIST(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString("tr-TR", {
      timeZone: "Europe/Istanbul",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}
