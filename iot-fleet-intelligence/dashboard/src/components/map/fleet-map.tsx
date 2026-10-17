"use client";

import type { FeatureCollection, Point } from "geojson";
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { siteLocation } from "@/lib/geo";
import type { CellFrame } from "@/lib/stream/types";

/** Free, key-less vector basemaps (OpenFreeMap / OpenStreetMap data). */
const STYLES = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  light: "https://tiles.openfreemap.org/styles/positron",
};

/** Offline fallback: plain background so the cell layers still render without tiles. */
const BLANK = (dark: boolean): StyleSpecification => ({
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": dark ? "#0e0f12" : "#eceae4" } }],
});

const positions = new Map<string, [number, number]>();
function lngLat(id: string): [number, number] {
  let p = positions.get(id);
  if (!p) {
    const [lat, lon] = siteLocation(id);
    p = [lon, lat];
    positions.set(id, p);
  }
  return p;
}

export function toGeoJSON(frame: CellFrame | null): FeatureCollection<Point> {
  if (!frame) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: frame.ids.map((id, i) => ({
      type: "Feature",
      id: i,
      geometry: { type: "Point", coordinates: lngLat(id) },
      properties: { id, health: frame.health[i], anomaly: frame.anomaly[i], online: frame.online[i], events: frame.events[i] },
    })),
  };
}

function addLayers(map: MlMap, data: FeatureCollection, dark: boolean) {
  if (map.getSource("cells")) return;
  map.addSource("cells", { type: "geojson", data });
  map.addLayer({
    id: "cells-heat",
    type: "heatmap",
    source: "cells",
    maxzoom: 9,
    paint: {
      // impacted devices drive the heat; healthy sites contribute nothing
      "heatmap-weight": ["interpolate", ["linear"], ["-", 100, ["get", "health"]], 10, 0, 100, 1],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 2, 1.2, 8, 3],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 2, 14, 8, 40],
      "heatmap-opacity": 0.85,
      "heatmap-color": [
        "interpolate",
        ["linear"],
        ["heatmap-density"],
        0,
        "rgba(0,0,0,0)",
        0.2,
        "rgba(250,178,25,0.45)",
        0.5,
        "rgba(236,131,90,0.75)",
        1,
        "rgba(208,59,59,0.95)",
      ],
    },
  });
  map.addLayer({
    id: "cells-dot",
    type: "circle",
    source: "cells",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        2,
        ["case", ["<", ["get", "health"], 60], 3.5, 1.6],
        8,
        ["case", ["<", ["get", "health"], 60], 9, 5],
      ],
      "circle-color": ["step", ["get", "health"], "#d03b3b", 60, "#fab219", 90, dark ? "#3ccf3c" : "#0ca30c"],
      "circle-opacity": ["case", ["<", ["get", "health"], 90], 1, 0.7],
      "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.5, ["<", ["get", "health"], 60], 1, 0],
      "circle-stroke-color": dark ? "#f2f1ee" : "#0d0d0c",
    },
  });
}

export function FleetMap({
  frame,
  selected,
  onSelect,
  focus,
  onError,
  label,
}: {
  frame: CellFrame | null;
  selected: string | null;
  onSelect: (id: string) => void;
  focus: { kind: "fit" | "degraded" | "cell"; id?: string; n: number };
  onError: () => void;
  label: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const loaded = useRef(false);
  const frameRef = useRef(frame);
  const selectRef = useRef(onSelect);
  const selectedIdx = useRef<number | null>(null);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const [styleKey, setStyleKey] = useState(0);

  useEffect(() => {
    frameRef.current = frame;
    selectRef.current = onSelect;
  });

  // create once
  useEffect(() => {
    let cancelled = false;
    let fellBack = false;
    void import("maplibre-gl").then((ml) => {
      if (cancelled || !el.current) return;
      // The worker is served from /vendor (copied from the package before dev/build): bundlers cannot
      // resolve maplibre's import.meta.url-relative worker path.
      ml.setWorkerUrl(`/vendor/maplibre-gl-worker-${ml.getVersion()}.mjs`);
      let m: MlMap;
      try {
        m = new ml.Map({
          container: el.current,
          style: STYLES[dark ? "dark" : "light"],
          center: [-96, 39],
          zoom: 3.1,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
          cooperativeGestures: false,
        });
      } catch {
        onError();
        return;
      }
      map.current = m;
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      m.on("error", (e) => {
        // basemap unreachable (offline CI, blocked CDN): keep the data layers on a blank style
        if (!fellBack && !loaded.current && String(e.error?.message ?? "").match(/style|fetch|Failed/i)) {
          fellBack = true;
          m.setStyle(BLANK(dark));
        }
      });
      m.on("style.load", () => {
        addLayers(m, toGeoJSON(frameRef.current), resolvedTheme !== "light");
        loaded.current = true;
        setStyleKey((k) => k + 1);
      });
      m.on("click", "cells-dot", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === "string") selectRef.current(id);
      });
      m.on("mouseenter", "cells-dot", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "cells-dot", () => (m.getCanvas().style.cursor = ""));
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      loaded.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create the map exactly once
  }, []);

  // theme switch
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded.current) return;
    loaded.current = false;
    m.setStyle(STYLES[dark ? "dark" : "light"]);
  }, [dark]);

  // streaming data
  useEffect(() => {
    const src = map.current?.getSource("cells") as GeoJSONSource | undefined;
    if (src && loaded.current) src.setData(toGeoJSON(frame));
  }, [frame, styleKey]);

  // selection highlight
  useEffect(() => {
    const m = map.current;
    if (!m || !loaded.current || !m.getSource("cells")) return;
    if (selectedIdx.current !== null) m.setFeatureState({ source: "cells", id: selectedIdx.current }, { selected: false });
    const idx = selected && frame ? frame.ids.indexOf(selected) : -1;
    selectedIdx.current = idx >= 0 ? idx : null;
    if (idx >= 0) m.setFeatureState({ source: "cells", id: idx }, { selected: true });
  }, [selected, frame, styleKey]);

  // camera: applied once per request, as soon as the map and the first cell frame exist
  const applied = useRef("");
  useEffect(() => {
    const m = map.current;
    const f = frameRef.current;
    const key = `${focus.kind}:${focus.id ?? ""}:${focus.n}`;
    if (!m || !loaded.current || !f || focus.n === 0 || applied.current === key) return;
    applied.current = key;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (focus.kind === "cell" && focus.id) {
      m.flyTo({ center: lngLat(focus.id), zoom: 7.5, animate: !reduce });
      return;
    }
    const ids = focus.kind === "degraded" ? f.ids.filter((_, i) => (f.health[i] ?? 100) < 60) : f.ids.filter((id) => id.startsWith("310-"));
    if (!ids.length) return;
    const pts = ids.map(lngLat);
    const lons = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    m.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: 80, maxZoom: 7.5, animate: !reduce },
    );
  }, [focus, styleKey, frame]);

  // inline style: maplibre's stylesheet sets position:relative on the container, which would win over
  // a (layered) Tailwind utility and collapse the map to zero height
  return <div ref={el} style={{ position: "absolute", inset: 0 }} role="region" aria-label={label} />;
}
