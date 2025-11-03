import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import protomap from "./assets/protomap.json";
import Plot from "react-plotly.js";

// Haversine distance in km
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Convert delta (in km) back to lat/lon
const applyDeltaHaversine = (lat, lon, deltaLatKm, deltaLonKm) => {
  const R = 6371;
  const newLat = lat + (deltaLatKm / R) * (180 / Math.PI);
  const newLon =
    lon + (deltaLonKm / R) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);
  return [newLat, newLon];
};

// Haversine delta in km
const haversineDelta = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const toRad = (v) => (v * Math.PI) / 180;
  const lat1r = toRad(lat1);
  const lat2r = toRad(lat2);
  let dlon = toRad(lon2 - lon1);
  dlon = ((dlon + Math.PI) % (2 * Math.PI)) - Math.PI;
  const dlat = toRad(lat2 - lat1);
  const x = dlon * Math.cos((lat1r + lat2r) / 2) * R;
  const y = dlat * R;
  return [y, x]; // [delta_lat_km, delta_lon_km]
};

export default function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);

  const [balloonData, setBalloonData] = useState([]);
  const [timeIndex, setTimeIndex] = useState(0);
  const [stats, setStats] = useState([]);
  const [selectedBalloon, setSelectedBalloon] = useState(0);
  const [showAll, setShowAll] = useState(true);
  const [modelData, setModelData] = useState(null);

  // Load model coefficients
  useEffect(() => {
    fetch("/model/balloon_model.json")
      .then((res) => res.json())
      .then((data) => setModelData(data))
      .catch((err) => console.error("Failed to load model:", err));
  }, []);

  // Predict next position
  const predictNextPosition = (positions) => {
    if (!positions?.length || !modelData) return null;
    const last21 = positions.slice(0, 21).reverse();
    if (last21.length < 21) return null;

    const features = [];
    for (let j = 0; j < 20; j++) {
      const a = last21[j];
      const b = last21[j + 1];
      if (!a || !b) return null;
      const [dLat, dLon] = haversineDelta(a.lat, a.lon, b.lat, b.lon);
      const deltaAlt = b.alt - a.alt;
      features.push(
        dLat,
        dLon,
        deltaAlt,
        a.balloon_speed ?? 0,
        a.balloon_dir ?? 0,
        a.windspeed ?? 0,
        a.winddir ?? 0
      );
    }

    const coef = modelData.coef;
    const intercept = modelData.intercept;
    const delta = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      let v = intercept[i] ?? 0;
      for (let j = 0; j < features.length; j++) {
        v += (coef[i][j] ?? 0) * features[j];
      }
      delta[i] = v;
    }

    const last = last21[last21.length - 1];
    const [newLat, newLon] = applyDeltaHaversine(last.lat, last.lon, delta[0], delta[1]);
    return { lat: newLat, lon: newLon, alt: last.alt + delta[2] };
  };

  // Fetch balloon data
  const fetchBalloonData = async () => {
    const isDev = import.meta.env.DEV;
    const baseUrl = isDev
      ? "/treasure"
      : "https://windborneproject.vercel.app/api/proxy";

    const urls = Array.from({ length: 24 }, (_, i) => {
      const pad = i.toString().padStart(2, "0");
      return isDev ? `${baseUrl}/${pad}.json` : `${baseUrl}?file=${pad}.json`;
    });

    const results = await Promise.allSettled(
      urls.map((u) =>
        fetch(u)
          .then((res) => res.text())
          .then((t) => {
            try {
              return JSON.parse(t);
            } catch {
              return null;
            }
          })
          .catch(() => null)
      )
    );

    const parsed = results.map((r) =>
      r.status === "fulfilled" && r.value
        ? r.value
            .filter((p) => Array.isArray(p) && typeof p[0] === "number")
            .map(([lat, lon, alt]) => ({ lat, lon, alt }))
        : []
    );

    setBalloonData(parsed);
  };

  // Fetch per-balloon stats
  const fetchStatsForSelected = async (idx) => {
    const positions = balloonData.map((t) => t[idx]).filter(Boolean);
    if (!positions.length) return;

    const altitudes = [],
      speeds = [],
      directions = [],
      windSpeeds = [],
      windDirs = [];

    const b0 = positions[0];
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${b0.lat}&longitude=${b0.lon}&hourly=windspeed_10m,winddirection_10m&past_days=1&timezone=America/Los_Angeles`;

    let windData = [];
    try {
      const res = await fetch(url);
      const data = await res.json();
      windData = data.hourly.windspeed_10m.map((spd, i) => ({
        wind_speed: spd,
        wind_deg: data.hourly.winddirection_10m[i] ?? 0,
      }));
    } catch {
      windData = Array(24).fill({ wind_speed: 0, wind_deg: 0 });
    }

    for (let t = 0; t < positions.length; t++) {
      const b = positions[t];
      altitudes.push(b.alt);

      if (t > 0) {
        const prev = positions[t - 1];
        const dist = haversineDistance(prev.lat, prev.lon, b.lat, b.lon);
        const angle = Math.atan2(b.lat - prev.lat, b.lon - prev.lon) * (180 / Math.PI);
        speeds.push(dist);
        directions.push(angle);
      } else {
        speeds.push(0);
        directions.push(0);
      }

      const w = windData[t % windData.length] || { wind_speed: 0, wind_deg: 0 };
      windSpeeds.push(w.wind_speed);
      windDirs.push(w.wind_deg);
    }

    setStats([{ altitudes, speeds, directions, windSpeeds, windDirs }]);
  };

  // Map initialization
  useEffect(() => {
    if (!mapContainer.current) return;
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: protomap,
      center: [0, 0],
      zoom: 1,
    });
    fetchBalloonData();
  }, []);

  useEffect(() => {
    if (balloonData.length && selectedBalloon !== null) {
      fetchStatsForSelected(selectedBalloon);
    }
  }, [selectedBalloon, balloonData]);

  // Map update
  useEffect(() => {
    if (!map.current || !balloonData.length) return;

    const currentData = balloonData[timeIndex] || [];

    const features = showAll
      ? currentData.map((d, i) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [d.lon, d.lat] },
          properties: { alt: d.alt, idx: i, selected: i === selectedBalloon },
        }))
      : currentData
          .filter((_, i) => i === selectedBalloon)
          .map((d) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [d.lon, d.lat] },
            properties: { alt: d.alt, idx: selectedBalloon, selected: true },
          }));

    const geojson = { type: "FeatureCollection", features };

    if (map.current.getSource("balloons")) {
      map.current.getSource("balloons").setData(geojson);
    } else {
      map.current.addSource("balloons", { type: "geojson", data: geojson });
      map.current.addLayer({
        id: "balloons-layer",
        type: "circle",
        source: "balloons",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "alt"], 0, 5, 10000, 10],
          "circle-color": [
            "case",
            ["==", ["get", "selected"], true],
            "#0033ff",
            ["interpolate", ["linear"], ["get", "alt"], 0, "#ff4c24", 10000, "#ff0000"],
          ],
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 1,
        },
      });

      map.current.on("click", "balloons-layer", (e) => {
        if (!showAll) return;
        const idx = e.features[0].properties.idx;
        setSelectedBalloon(idx);
      });
    }

    // Selected path
    if (selectedBalloon !== null) {
      const coords = balloonData
        .map((t) => t[selectedBalloon])
        .filter(Boolean)
        .map((p, i, arr) => {
          if (i === 0) return [p.lon, p.lat];
          let lon = p.lon;
          if (Math.abs(lon - arr[i - 1].lon) > 180)
            lon += lon > arr[i - 1].lon ? -360 : 360;
          return [lon, p.lat];
        });

      const path = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: coords } }] };

      if (!map.current.getSource("selected-path")) {
        map.current.addSource("selected-path", { type: "geojson", data: path });
        map.current.addLayer({
          id: "selected-path-layer",
          type: "line",
          source: "selected-path",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#0033ff", "line-width": 4, "line-opacity": 0.6 },
        });
      } else {
        map.current.getSource("selected-path").setData(path);
      }
    }

    // Predicted path
    if (selectedBalloon !== null && modelData) {
      const positions = balloonData.map((t) => t[selectedBalloon]).filter(Boolean);
      const predicted = predictNextPosition(positions);
      if (predicted) {
        const current = positions[0];
        const predLine = {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: [
                  [current.lon, current.lat],
                  [predicted.lon, predicted.lat],
                ],
              },
            },
          ],
        };

        if (!map.current.getSource("predicted-path")) {
          map.current.addSource("predicted-path", { type: "geojson", data: predLine });
          map.current.addLayer({
            id: "predicted-path-layer",
            type: "line",
            source: "predicted-path",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#c300ff", "line-width": 4, "line-dasharray": [4, 4] },
          });
        } else {
          map.current.getSource("predicted-path").setData(predLine);
        }
      }
    }
  }, [balloonData, timeIndex, selectedBalloon, showAll, modelData]);

  const firstValidTime = balloonData.find((t) => t && t.length > 0) || [];
  const currentBalloon = balloonData[timeIndex]?.[selectedBalloon];

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", position: "relative" }}>
      <div ref={mapContainer} style={{ flex: 1 }} />

      {/* Controls Overlay */}
      <div
        style={{
          position: "absolute",
          bottom: "1rem",
          left: "1rem",
          background: "rgba(255, 255, 255, 0.95)",
          borderRadius: 12,
          boxShadow: "0 3px 8px rgba(0,0,0,0.2)",
          padding: 14,
          fontSize: 14,
          zIndex: 1000,
        }}
      >

        <Legend />
      </div>

      {/* Sidebar */}
      <div
        style={{
          width: 400,
          height: "100%",
          position: "fixed",
          top: 0,
          right: 0,
          background: "#f8f9fa",
          overflowY: "auto",
          padding: 20,
          boxSizing: "border-box",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <h3>Balloon and Wind Tracker</h3>

        {firstValidTime.length > 0 && (
          <div>
            <label>
              Select Balloon:{" "}
              <select
                value={selectedBalloon}
                onChange={(e) => setSelectedBalloon(Number(e.target.value))}
              >
                {firstValidTime.map((_, i) => (
                  <option key={i} value={i}>
                    Balloon {i}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <strong>Time Slider</strong>
          <input
            type="range"
            min={0}
            max={balloonData.length - 1}
            value={timeIndex}
            onChange={(e) => setTimeIndex(Number(e.target.value))}
            style={{ width: "100%", marginTop: 6 }}
          />
        </div>

        <label>
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />{" "}
          Show All
        </label>

        {currentBalloon && stats.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <strong>Balloon Data:</strong>
            <div>Time: {timeIndex}h ago</div>
            <div>Latitude: {currentBalloon.lat.toFixed(3)}°</div>
            <div>Longitude: {currentBalloon.lon.toFixed(3)}°</div>
            <div>Altitude: {currentBalloon.alt.toFixed(2)} km</div>
            <div>Wind Speed: {stats[0].windSpeeds[timeIndex].toFixed(2)} m/s</div>
            <div>Wind Direction: {stats[0].windDirs[timeIndex].toFixed(2)}°</div>
          </div>
        )}

        {stats.length > 0 && (
          <>
            <PlotChart title="Altitude (km)" y={stats[0].altitudes} color="red" />
            <PlotChart title="Speed (km/h)" y={stats[0].speeds} color="green" />
            <PlotChart title="Direction (°)" y={stats[0].directions} color="orange" />
            <PlotChart title="Wind Speed (m/s)" y={stats[0].windSpeeds} color="cyan" />
            <PlotChart title="Wind Direction (°)" y={stats[0].windDirs} color="magenta" />
          </>
        )}
      </div>
    </div>
  );
}

// Legend Component
function Legend() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <LegendItem color="blue" text="Selected Balloon" />
      <LegendItem color="red" text="Balloon" />
      <LegendLine color="blue" text="Path (past)" />
      <LegendLine color="purple" dash text="Predicted (next hour)" />
    </div>
  );
}

function LegendItem({ color, text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: color,
        }}
      ></div>
      <span>{text}</span>
    </div>
  );
}

function LegendLine({ color, text, dash }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: 24,
          height: 4,
          background: dash ? "transparent" : color,
          borderTop: dash ? `4px dashed ${color}` : undefined,
        }}
      ></div>
      <span>{text}</span>
    </div>
  );
}

// Plot component
function PlotChart({ title, y, color }) {
  return (
    <div>
      <strong>{title}</strong>
      <Plot
        data={[{ x: y.map((_, i) => i), y, type: "scatter", mode: "lines+markers", marker: { color } }]}
        layout={{ width: 360, height: 150, margin: { t: 20, b: 30, l: 50, r: 10 } }}
        style={{marginTop: '10px'}}
      />
    </div>
  );
}
