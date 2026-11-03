import type { Region } from "@/lib/region";

interface Point {
  latitude: number;
  longitude: number;
}

/**
 * The real campus boundary and real directory places, drawn from the data with no map tiles. Every
 * dot is a directory record; nothing is decorative. Purely visual: the same places are in the lists.
 */
export function CampusOutline({ region, points = [], highlight, label, className }: { region: Region; points?: Point[]; highlight?: Point; label: string; className?: string }) {
  const { minLat, maxLat, minLon, maxLon } = region.bbox;
  // Longitude degrees shrink with latitude; without this the campus would look stretched.
  const aspect = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const width = 1000;
  const height = Math.round((width * (maxLat - minLat)) / ((maxLon - minLon) * aspect));
  const x = (lon: number) => ((lon - minLon) / (maxLon - minLon)) * width;
  const y = (lat: number) => ((maxLat - lat) / (maxLat - minLat)) * height;
  const outline = region.boundary.map(([lon, lat], i) => `${i ? "L" : "M"}${x(lon).toFixed(1)} ${y(lat).toFixed(1)}`).join(" ") + "Z";
  const pad = 30;

  return (
    <svg className={className ? `campus-outline ${className}` : "campus-outline"} viewBox={`${-pad} ${-pad} ${width + 2 * pad} ${height + 2 * pad}`} role="img" aria-label={label}>
      <path d={outline} className="campus-outline-area" />
      {points.map((p, i) => (
        <circle key={i} cx={x(p.longitude)} cy={y(p.latitude)} r={6} className="campus-outline-dot" />
      ))}
      {highlight && (
        <>
          <circle cx={x(highlight.longitude)} cy={y(highlight.latitude)} r={30} className="campus-outline-halo" />
          <circle cx={x(highlight.longitude)} cy={y(highlight.latitude)} r={13} className="campus-outline-here" />
        </>
      )}
    </svg>
  );
}
