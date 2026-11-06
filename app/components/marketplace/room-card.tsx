import Link from "next/link";
import { RoomGlyph } from "@/components/ui/room-glyph";
import { StatusStamp } from "@/components/ui/status-stamp";
import { formatDate, formatUsdc, type Room } from "@/lib/data";

export interface RoomCardData extends Room {
  propertyId: string;
  propertyName: string;
  locality: string;
  city: string;
  periodLabel: string;
  propertyApproved?: boolean;
  arkivRecord?: boolean;
}

export function RoomCard({ room, index }: { room: RoomCardData; index: number }) {
  return (
    <article className="room-card">
      <div className="room-card__visual">
        <RoomGlyph
          index={index}
          state={room.state}
          label={`R${index + 1}`}
        />
        <span className="room-card__stamp">
          <StatusStamp state={room.state} />
        </span>
      </div>

      <div className="room-card__body">
        <div className="room-card__top">
          <div>
            <h3>{room.name}</h3>
            <p className="room-card__loc">
              {room.propertyName} · {room.locality}, {room.city}
            </p>
          </div>
          <span className="room-card__price">
            {formatUsdc(room.price)}
            <small>USDC / period</small>
          </span>
        </div>

        <div className="room-card__meta">
          <span>
            <strong>{room.periodLabel}</strong>
          </span>
          <span>
            {room.state === "held"
              ? `Holder ${room.holder?.slice(0, 6)}…${room.holder?.slice(-4)}`
              : room.arkivRecord
                ? "Hedera rights check required"
                : "One verified broker"}
          </span>
        </div>

        <div className="room-card__foot">
          <span className={`badge ${room.propertyApproved ? "badge--verified" : "badge--quiet"}`}>
            {room.propertyApproved && (
              <span className="badge__check" aria-hidden="true">✓</span>
            )}
            {room.arkivRecord ? "Arkiv record · verify on Hedera" : "Registrar-approved"}
          </span>
          <Link href={`/marketplace/${room.id}`} className="text-link">
            View room
          </Link>
        </div>
      </div>
    </article>
  );
}

export function RoomPriceLine({ room }: { room: Room }) {
  return (
    <span className="mono">
      {formatUsdc(room.price)} USDC · until {formatDate(room.validUntil)}
    </span>
  );
}
