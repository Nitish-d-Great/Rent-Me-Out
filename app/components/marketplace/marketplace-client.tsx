"use client";

import { useMemo, useState } from "react";
import { RoomCard, type RoomCardData } from "./room-card";

export function MarketplaceClient({
  rooms,
  city,
  availability,
  price,
}: {
  rooms: RoomCardData[];
  city?: string;
  availability: string;
  price: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return rooms.filter((room) => {
      const haystack =
        `${room.name} ${room.propertyName} ${room.locality} ${room.city} ${room.note}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    });
  }, [query, rooms]);

  return (
    <>
      <div className="filter-bar">
        <div className="field field--search">
          <label htmlFor="room-search">Search rooms</label>
          <input
            id="room-search"
            type="search"
            placeholder="Locality, property or room"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <form action="/marketplace" method="get" className="filter-bar__query">
          {city && <input type="hidden" name="city" value={city} />}
          <div className="field">
            <label htmlFor="room-price">Price</label>
            <select id="room-price" name="price" defaultValue={price}>
              <option value="any">Any price</option>
              <option value="under900">Under 900 USDC</option>
              <option value="900plus">900 USDC and above</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="room-state">Availability</label>
            <select id="room-state" name="availability" defaultValue={availability}>
              <option value="all">All rooms</option>
              <option value="available">Available</option>
              <option value="held">Held</option>
            </select>
          </div>
          <button className="btn btn--small" type="submit">Apply Arkiv filters</button>
        </form>
        <span className="small dim" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? "room" : "rooms"}
        </span>
      </div>

      {filtered.length > 0 ? (
        <div className="room-grid">
          {filtered.map((room) => {
            const index = rooms.findIndex((entry) => entry.id === room.id);
            return <RoomCard key={room.id} room={room} index={index} />;
          })}
        </div>
      ) : (
        <div className="empty-state" style={{ marginTop: 26 }}>
          <h3>No rooms match these filters.</h3>
          <p>
            Try a different locality, raise the price, or clear the availability
            filter. Only rooms with a future, non-overlapping period appear here.
          </p>
        </div>
      )}
    </>
  );
}
