"use client";

import { useEffect, useMemo, useState } from "react";

export interface PropertyCoordinates {
  latitude: number;
  longitude: number;
}

/** Coordinates are stored on-chain as microdegrees, so more digits than this have no effect. */
const MAX_DECIMALS = 6;

/** Cuts typed text to six decimals. It cuts rather than rounds, so digits never change as you type. */
function trimDecimals(raw: string): string {
  const dot = raw.indexOf(".");
  return dot === -1 ? raw : raw.slice(0, dot + 1 + MAX_DECIMALS);
}

/** For values that arrive whole, from map search or the device's location. */
function roundCoordinate(value: number): number {
  return Number(value.toFixed(MAX_DECIMALS));
}

export function LocationPicker({
  value,
  onChange,
}: {
  value: PropertyCoordinates | null;
  onChange: (value: PropertyCoordinates | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ label: string; lat: number; lon: number }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latitudeText, setLatitudeText] = useState("");
  const [longitudeText, setLongitudeText] = useState("");

  useEffect(() => {
    if (!value) return;
    // Left alone when it already means the same number, or typing "19.10" would become "19.1".
    setLatitudeText((text) => (text.trim() && Number(text) === value.latitude ? text : String(value.latitude)));
    setLongitudeText((text) => (text.trim() && Number(text) === value.longitude ? text : String(value.longitude)));
  }, [value]);

  const mapUrl = useMemo(() => {
    if (!value) return null;
    const delta = 0.008;
    const bbox = [value.longitude - delta, value.latitude - delta, value.longitude + delta, value.latitude + delta]
      .join("%2C");
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${value.latitude}%2C${value.longitude}`;
  }, [value]);

  async function search() {
    const term = query.trim();
    if (!term) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(term)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw new Error("Location search is unavailable right now.");
      const data = (await response.json()) as Array<{ display_name: string; lat: string; lon: string }>;
      setResults(data.map((item) => ({ label: item.display_name, lat: Number(item.lat), lon: Number(item.lon) })));
      if (data.length === 0) setError("No matches. Try a nearby address or set the coordinates manually.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Location search failed.");
    } finally {
      setBusy(false);
    }
  }

  function useBrowserLocation() {
    setError(null);
    if (!navigator.geolocation) {
      setError("This browser does not provide location access.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        onChange({ latitude: roundCoordinate(coords.latitude), longitude: roundCoordinate(coords.longitude) });
        setResults([]);
        setBusy(false);
      },
      (cause) => {
        setError(cause.code === cause.PERMISSION_DENIED
          ? "Location permission was denied. Search for the address or enter coordinates."
          : "Could not read your location. Search for the address or enter coordinates.");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  function updateCoordinate(which: "latitude" | "longitude", typed: string) {
    const raw = trimDecimals(typed);
    const nextLatitude = which === "latitude" ? raw : latitudeText;
    const nextLongitude = which === "longitude" ? raw : longitudeText;
    if (which === "latitude") setLatitudeText(raw);
    else setLongitudeText(raw);
    if (!nextLatitude.trim() || !nextLongitude.trim()) {
      onChange(null);
      return;
    }
    const latitude = Number(nextLatitude);
    const longitude = Number(nextLongitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return;
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return;
    onChange({
      latitude,
      longitude,
    });
  }

  return (
    <div className="stack-16">
      <div className="between wrap" style={{ gap: 12 }}>
        <div className="field" style={{ flex: "1 1 260px" }}>
          <label htmlFor="location-search">Find property on map</label>
          <input
            id="location-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }}
            placeholder="Search an address or place"
          />
        </div>
        <button type="button" className="btn btn--small" style={{ alignSelf: "end" }} onClick={() => void search()} disabled={busy}>
          {busy ? "Finding…" : "Search map"}
        </button>
        <button type="button" className="btn btn--ghost btn--small" style={{ alignSelf: "end" }} onClick={useBrowserLocation} disabled={busy}>
          Use this device’s location
        </button>
      </div>

      {error && <p className="micro" role="status" style={{ color: "crimson" }}>{error}</p>}
      {results.length > 0 && (
        <div className="stack-8" role="group" aria-label="Map search results">
          {results.map((result) => (
            <button
              type="button"
              className="btn btn--ghost"
              key={`${result.lat},${result.lon}`}
              onClick={() => { onChange({ latitude: roundCoordinate(result.lat), longitude: roundCoordinate(result.lon) }); setResults([]); }}
              style={{ textAlign: "left", justifyContent: "flex-start" }}
            >
              {result.label}
            </button>
          ))}
        </div>
      )}

      {mapUrl ? (
        <iframe
          title="Selected property location map"
          src={mapUrl}
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{ width: "100%", height: 300, border: "1px solid var(--line)", borderRadius: 8 }}
        />
      ) : (
        <div className="notice notice--brass">
          <span className="notice__icon" aria-hidden="true">⌖</span>
          <div><strong>Select a map result or share this device’s location.</strong><p>The location pin will appear here.</p></div>
        </div>
      )}

      <div className="form-grid">
        <div className="field">
          <label htmlFor="latitude">Latitude</label>
          <input id="latitude" type="number" min="-90" max="90" step="0.000001" value={latitudeText} onChange={(event) => updateCoordinate("latitude", event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="longitude">Longitude</label>
          <input id="longitude" type="number" min="-180" max="180" step="0.000001" value={longitudeText} onChange={(event) => updateCoordinate("longitude", event.target.value)} />
        </div>
      </div>
      <p className="field__hint">
        Address searches are sent to OpenStreetMap. The selected pin is encrypted with the application, then becomes public and permanent on Hedera if listed. Browser GPS and map search are owner-supplied signals; the registrar must check the pin against the deed.
      </p>
    </div>
  );
}
