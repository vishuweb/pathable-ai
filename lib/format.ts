import type { ReportLocation } from "./report";

const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

export function formatCoordinates(location: ReportLocation): string | undefined {
  if (location.latitude === undefined || location.longitude === undefined) return undefined;
  const accuracy = location.accuracyM !== undefined ? ` (±${Math.round(location.accuracyM)} m)` : "";
  return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}${accuracy}`;
}

export function mapUrl(location: ReportLocation): string | undefined {
  if (location.latitude === undefined || location.longitude === undefined) return undefined;
  const { latitude: lat, longitude: lon } = location;
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=19/${lat}/${lon}`;
}
