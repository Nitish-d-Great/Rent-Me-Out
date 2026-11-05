"use client";

import { useMemo, useState } from "react";
import { RoomCard, type RoomCardData } from "./room-card";

export function MarketplaceClient({ rooms }: { rooms: RoomCardData[] }) {
  const [query, setQuery] = useState("");
  const [price, setPrice] = useState("any");
  const [availability, setAvailability] = useState("all");

  const filtered = useMemo(() => {
    return rooms.filter((room) => {
      const haystack =
        `${room.name} ${room.propertyName} ${room.locality} ${room.city} ${room.note}`.toLowerCase();
      const matchesQuery = haystack.includes(query.toLowerCase());
      const matchesPrice =
        price === "any" ||
        (price === "under900" && room.price < 900) ||
        (price === "900plus" && room.price >= 900);
      const matchesAvailability =
        availability === "all" ||
        (availability === "available" && room.state === "available") ||
        (availability === "held" && room.state === "held");
      return matchesQuery && matchesPrice && matchesAvailability;
    });
  }, [availability, price, query, rooms]);

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
        <div className="field">
          <label htmlFor="room-price">Price</label>
          <select
            id="room-price"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          >
            <option value="any">Any price</option>
            <option value="under900">Under 900 USDC</option>
            <option value="900plus">900 USDC and above</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="room-state">Availability</label>
          <select
            id="room-state"
            value={availability}
            onChange={(event) => setAvailability(event.target.value)}
          >
            <option value="all">All rooms</option>
            <option value="available">Available</option>
            <option value="held">Held</option>
          </select>
        </div>
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
