import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import protomap from './assets/protomap.json';
import Plot from 'react-plotly.js';

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
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export default function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);

  const [balloonData, setBalloonData] = useState([]);
  const [timeIndex, setTimeIndex] = useState(0);
  const [stats, setStats] = useState([]);
  const [selectedBalloon, setSelectedBalloon] = useState(0);

  // Fetch balloon positions
  const fetchBalloonData = async () => {
    const urls = Array.from({ length: 24 }, (_, i) => `/treasure/${i.toString().padStart(2,'0')}.json`);
    const results = await Promise.allSettled(
      urls.map(u =>
        fetch(u)
          .then(res => res.text())
          .then(text => { try { return JSON.parse(text) } catch { return null } })
          .catch(() => null)
      )
    );

    const parsedByTime = results.map(r => r.status === 'fulfilled' && r.value ? 
      r.value.filter(p => Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number")
            .map(([lat, lon, alt]) => ({ lat, lon, alt })) : []);

    setBalloonData(parsedByTime);
  };

  // Fetch stats for selected balloon including wind plots
  const fetchStatsForSelected = async (balloonIdx) => {
    if (!balloonData.length || !balloonData[0][balloonIdx]) return;

    const altitudes = [];
    const speeds = [];
    const directions = [];
    const windSpeeds = [];
    const windDirs = [];

    const positions = balloonData.map(t => t[balloonIdx]).filter(Boolean);
    if (!positions.length) return;

    const b0 = positions[0];

    // Open-Meteo for past 1 day (24h) hourly wind data
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${b0.lat}&longitude=${b0.lon}&hourly=windspeed_10m,winddirection_10m&past_days=1&timezone=GMT`;
    let windData = [];
    try {
      const res = await fetch(url);
      const data = await res.json();
      windData = data.hourly.windspeed_10m.map((speed, idx) => ({
        wind_speed: speed,
        wind_deg: data.hourly.winddirection_10m[idx] ?? 0
      }));
    } catch {
      windData = Array(24).fill({ wind_speed: 0, wind_deg: 0 });
    }

    for (let t = 0; t < positions.length; t++) {
      const b = positions[t];
      altitudes.push(b.alt);

      if (t > 0) {
        const prev = positions[t - 1];
        const dist = prev ? haversineDistance(prev.lat, prev.lon, b.lat, b.lon) : 0;
        speeds.push(dist);
        const angle = prev ? Math.atan2(b.lat - prev.lat, b.lon - prev.lon) * 180 / Math.PI : 0;
        directions.push(angle);
      } else {
        speeds.push(0);
        directions.push(0);
      }

      const wind = windData[t % windData.length] || { wind_speed: 0, wind_deg: 0 };
      windSpeeds.push(wind.wind_speed);
      windDirs.push(wind.wind_deg);
    }

    setStats([{ altitudes, speeds, directions, windSpeeds, windDirs }]);
  };

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: protomap,
      center: [0, 0],
      zoom: 1.5,
    });
    fetchBalloonData();
  }, []);

  // Refetch stats when balloon selection changes
  useEffect(() => {
    if (balloonData.length && selectedBalloon !== null) {
      fetchStatsForSelected(selectedBalloon);
    }
  }, [selectedBalloon, balloonData]);

  // Update map layers
  useEffect(() => {
    if (!map.current || !balloonData.length) return;

    const currentData = balloonData[timeIndex] || [];
    const geojson = {
      type: 'FeatureCollection',
      features: currentData.map((d, idx) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [d.lon, d.lat] },
        properties: { alt: d.alt, idx, selected: idx === selectedBalloon }
      }))
    };

    if (map.current.getSource('balloons')) {
      map.current.getSource('balloons').setData(geojson);
    } else {
      map.current.addSource('balloons', { type: 'geojson', data: geojson });
      map.current.addLayer({
        id: 'balloons-layer',
        type: 'circle',
        source: 'balloons',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'alt'], 0, 5, 10000, 10],
          'circle-color': ['case',
            ['==', ['get', 'selected'], true], '#0033ffff',
            ['interpolate', ['linear'], ['get', 'alt'], 0, '#ff4c24ff', 10000, '#ff0000']
          ],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1
        }
      });

      map.current.on('click', 'balloons-layer', e => {
        const idx = e.features[0].properties.idx;
        setSelectedBalloon(idx);
      });
    }
  }, [balloonData, timeIndex, selectedBalloon]);

  const currentBalloon = balloonData[timeIndex]?.[selectedBalloon];

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', position: 'relative' }}>
      <div ref={mapContainer} style={{ flex: 1 }} />

      <div style={{
        width: 400, height: '100%', position: 'fixed', top: 0, right: 0,
        background: '#fff', overflowY: 'auto', padding: 20, boxSizing: 'border-box',
        zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 20
      }}>
        <h3>Balloon Viewer</h3>

        {balloonData[0]?.length > 0 && (
          <div>
            <label>Select Balloon:{" "}
              <select value={selectedBalloon} onChange={e => setSelectedBalloon(Number(e.target.value))}>
                {balloonData[0].map((_, idx) => <option key={idx} value={idx}>Balloon {idx}</option>)}
              </select>
            </label>
          </div>
        )}

        {balloonData.length > 0 && (
          <div>
            <strong>Time Slider</strong>
            <input
              type="range"
              min={0}
              max={balloonData.length - 1}
              value={timeIndex}
              onChange={e => setTimeIndex(Number(e.target.value))}
              style={{ width: '100%', marginTop: 10, color: 'blue' }}
            />
          </div>
        )}

        {currentBalloon && stats.length > 0 && (
          <div>
            <strong>Balloon Data:</strong>
            <div>Time: {timeIndex}h ago</div>
            <div>Latitude: {currentBalloon.lat.toFixed(3)}°</div>
            <div>Longitude: {currentBalloon.lon.toFixed(3)}°</div>
            <div>Altitude: {currentBalloon.alt.toFixed(0)} km</div>
            <div>Wind Speed: {stats[0].windSpeeds[timeIndex].toFixed(2)} m/s</div>
            <div>Wind Direction: {stats[0].windDirs[timeIndex].toFixed(0)}°</div>
          </div>
        )}

        {stats.length > 0 && (
          <>
            <div>
              <strong>Altitude (km)</strong>
              <Plot
                data={[{ x: stats[0].altitudes.map((_, i) => i), y: stats[0].altitudes, type: 'scatter', mode: 'lines+markers', marker: { color: 'red' } }]}
                layout={{ width: 360, height: 150, margin: { t: 20, b: 30, l: 50, r: 10 } }}
              />
            </div>

            <div>
              <strong>Speed (km/h)</strong>
              <Plot
                data={[{ x: stats[0].speeds.map((_, i) => i + 1), y: stats[0].speeds, type: 'scatter', mode: 'lines+markers', marker: { color: 'green' } }]}
                layout={{ width: 360, height: 150, margin: { t: 20, b: 30, l: 50, r: 10 } }}
              />
            </div>

            <div>
              <strong>Direction (°)</strong>
              <Plot
                data={[{ x: stats[0].directions.map((_, i) => i + 1), y: stats[0].directions, type: 'scatter', mode: 'lines+markers', marker: { color: 'orange' } }]}
                layout={{ width: 360, height: 150, margin: { t: 20, b: 30, l: 50, r: 10 } }}
              />
            </div>

            <div>
              <strong>Wind Speed (m/s)</strong>
              <Plot
                data={[{ x: stats[0].windSpeeds.map((_, i) => i + 1), y: stats[0].windSpeeds, type: 'scatter', mode: 'lines+markers', marker: { color: 'cyan' } }]}
                layout={{ width: 360, height: 150, margin: { t: 20, b: 30, l: 50, r: 10 } }}
              />
            </div>

            <div>
              <strong>Wind Direction (°)</strong>
              <Plot
                data={[{ x: stats[0].windDirs.map((_, i) => i + 1), y: stats[0].windDirs, type: 'scatter', mode: 'lines+markers', marker: { color: 'magenta' } }]}
                layout={{ width: 360, height: 150, margin: { t: 20, b: 30, l: 50, r: 10 } }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
