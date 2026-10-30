"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { LayerGroup } from "leaflet";

export interface MapPlace {
  key: string;
  name: string;
  href: string;
  latitude: number;
  longitude: number;
}

interface Props {
  label: string;
  boundary: [number, number][];
  places: MapPlace[];
}

type Leaflet = typeof import("leaflet");

/**
 * The campus boundary and the places currently listed, on OpenStreetMap tiles. Supplementary:
 * the list beside it holds the same information for keyboard and screen-reader users.
 */
export function CampusMap({ label, boundary, places }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState<{ L: Leaflet; markers: LayerGroup }>();

  useEffect(() => {
    let cancelled = false;
    let remove: (() => void) | undefined;
    void import("leaflet").then((L) => {
      if (cancelled || !element.current) return;
      const map = L.map(element.current, { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      const outline = L.polygon(
        boundary.map(([lon, lat]) => [lat, lon] as [number, number]),
        { color: "#0b5cad", weight: 3, fillOpacity: 0.05 },
      ).addTo(map);
      map.fitBounds(outline.getBounds());
      remove = () => map.remove();
      setReady({ L, markers: L.layerGroup().addTo(map) });
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [boundary]);

  useEffect(() => {
    if (!ready) return;
    const { L, markers } = ready;
    markers.clearLayers();
    for (const place of places) {
      const link = document.createElement("a");
      link.href = place.href;
      link.textContent = place.name;
      L.circleMarker([place.latitude, place.longitude], {
        radius: 7,
        color: "#14171c",
        weight: 2,
        fillColor: "#0b5cad",
        fillOpacity: 0.9,
      })
        .bindPopup(link)
        .addTo(markers);
    }
  }, [ready, places]);

  return <div ref={element} className="campus-map" role="region" aria-label={label} />;
}
