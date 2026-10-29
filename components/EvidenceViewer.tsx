"use client";

import { findingColor, findingTextColor } from "@/lib/colors";
import { unionBox } from "@/lib/geometry";
import type { PreparedImage } from "@/lib/prepare-image";
import type { Evidence, Finding } from "@/lib/types";

interface Props {
  image: PreparedImage;
  findings: Finding[];
  evidence: Record<string, Evidence>;
  selectedId?: string;
  showOverlay: boolean;
  onSelect: (findingId: string) => void;
  alt?: string;
}

export function EvidenceViewer({
  image,
  findings,
  evidence,
  selectedId,
  showOverlay,
  onSelect,
  alt = "The uploaded photo being analyzed",
}: Props) {
  const { width, height } = image;
  const badgeRadius = Math.max(width, height) * 0.018;
  const stroke = Math.max(2, Math.max(width, height) * 0.003);

  const drawn = findings.flatMap((finding, index) => {
    const ev = evidence[finding.id];
    if (!ev || ev.status === "unlocated") return [];
    const anchor = unionBox(ev.regions.map((r) => r.box)) ?? ev.modelBox;
    return [
      {
        finding,
        ev,
        index,
        color: findingColor(index),
        opacity: selectedId !== undefined && selectedId !== finding.id ? 0.25 : 1,
        // Keep the number badge fully inside the image.
        cx: Math.min(width - badgeRadius, Math.max(badgeRadius, anchor.left)),
        cy: Math.min(height - badgeRadius, Math.max(badgeRadius, anchor.top)),
      },
    ];
  });

  return (
    <div className="viewer-stage" style={{ aspectRatio: `${width} / ${height}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
      <img src={image.dataUrl} alt={alt} />
      {showOverlay && (
        <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="viewer-overlay">
          {/* Shapes first, then badges, so no outline is painted over another finding's number. */}
          {drawn.map(({ finding, ev, color, opacity }) => (
            <g
              key={`shape-${finding.id}`}
              opacity={opacity}
              onClick={() => onSelect(finding.id)}
              style={{ cursor: "pointer" }}
            >
              {ev.regions.length > 0 ? (
                ev.regions.map((region) => {
                  const sx = (region.box.right - region.box.left) / region.maskWidth;
                  const sy = (region.box.bottom - region.box.top) / region.maskHeight;
                  return (
                    <path
                      key={region.objectId}
                      d={region.path}
                      transform={`translate(${region.box.left} ${region.box.top}) scale(${sx} ${sy})`}
                      fill={color}
                      fillOpacity={0.4}
                      fillRule="evenodd"
                      stroke={color}
                      strokeWidth={stroke}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })
              ) : (
                <rect
                  x={ev.modelBox.left}
                  y={ev.modelBox.top}
                  width={ev.modelBox.right - ev.modelBox.left}
                  height={ev.modelBox.bottom - ev.modelBox.top}
                  fill={color}
                  fillOpacity={0.12}
                  stroke={color}
                  strokeWidth={stroke}
                  strokeDasharray={`${stroke * 4} ${stroke * 3}`}
                />
              )}
            </g>
          ))}
          {drawn.map(({ finding, index, color, opacity, cx, cy }) => (
            <g
              key={`badge-${finding.id}`}
              opacity={opacity}
              onClick={() => onSelect(finding.id)}
              style={{ cursor: "pointer" }}
            >
              <circle cx={cx} cy={cy} r={badgeRadius} fill={color} stroke="#fff" strokeWidth={stroke} />
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={badgeRadius * 1.2}
                fontWeight={700}
                fill={findingTextColor(index)}
              >
                {index + 1}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
