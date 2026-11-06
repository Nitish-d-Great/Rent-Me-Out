import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyPanel } from "@/components/marketplace/buy-panel";
import { RoomGlyph } from "@/components/ui/room-glyph";
import { StatusStamp } from "@/components/ui/status-stamp";
import {
  demo,
  formatDate,
  formatUsdc,
  property,
  rooms,
  type Room,
} from "@/lib/data";
import { readRoom } from "@/lib/chain/registry";
import { recordToRoom } from "@/lib/chain/to-room";

/**
 * A numeric id is a real listing, read from the registry. Anything else is one of the
 * sample rooms, kept so older demo links still resolve -- but those cannot be bought,
 * because they have no on-chain listing behind them.
 */
async function loadRoom(roomId: string): Promise<{ room: Room | null; live: boolean }> {
  if (/^\d+$/.test(roomId)) {
    try {
      const record = await readRoom(BigInt(roomId));
      if (record) return { room: recordToRoom(record), live: true };
    } catch {
      // Fall through to the sample set rather than showing an error page.
    }
  }
  return { room: rooms.find((entry) => entry.id === roomId) ?? null, live: false };
}

type PageProps = {
  params: Promise<{ roomId: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return rooms.map((room) => ({ roomId: room.id }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { roomId } = await params;
  const { room } = await loadRoom(roomId);
  return {
    title: room ? room.name : "Room",
    description: room?.note,
  };
}

export default async function RoomDetailPage({ params }: PageProps) {
  const { roomId } = await params;
  const { room, live } = await loadRoom(roomId);
  if (!room) notFound();

  const index = Math.max(0, rooms.findIndex((entry) => entry.id === roomId));

  return (
    <div className="shell section section--tight">
      <div className="between" style={{ marginBottom: 24 }}>
        <Link href="/marketplace" className="text-link">
          All rooms
        </Link>
        <StatusStamp state={room.state} />
      </div>

      <div className="detail-grid">
        <div>
          <div className="detail-visual">
            <RoomGlyph index={index} state={room.state} />
          </div>

          <div className="detail-copy" style={{ marginTop: 30 }}>
            <p className="eyebrow">
              {property.nickname} · {property.locality}, {property.city}
            </p>
            <h1>{room.name}</h1>
            <p className="lede">{room.note}</p>

            <div className="detail-meta">
              <div>
                <span className="micro">Rights period</span>
                <strong>{demo.periodLabel}</strong>
              </div>
              <div>
                <span className="micro">One-time price</span>
                <strong>{formatUsdc(room.price)} USDC</strong>
              </div>
              <div>
                <span className="micro">Token · supply 1</span>
                <strong className="mono">{room.tokenId}</strong>
              </div>
              <div>
                <span className="micro">Valid until</span>
                <strong>{formatDate(room.validUntil)}</strong>
              </div>
            </div>

            <div className="panel" style={{ marginTop: 26 }}>
              <div className="panel__head">
                <h2>What this right means</h2>
                <span className="badge badge--verified">
                  <span className="badge__check" aria-hidden="true">
                    ✓
                  </span>
                  Approved property
                </span>
              </div>
              <div className="panel__body">
                <p style={{ fontSize: 13, color: "rgba(22,35,59,.72)" }}>
                  This payment buys the exclusive right to rent{" "}
                  {room.name.split("·")[0].trim()} for the listed period. The
                  owner receives the payment directly. The room token proves who
                  holds that right; it does not transfer property title.
                </p>
                <div className="timeline" style={{ marginTop: 20 }}>
                  <div className="timeline__item" data-done="true">
                    <span className="timeline__dot" />
                    <div>
                      <strong>Property reviewed by the registrar</strong>
                      <span>
                        Deed encrypted on Swarm · commitment registered on Hedera
                      </span>
                    </div>
                  </div>
                  <div className="timeline__item" data-done="true">
                    <span className="timeline__dot" />
                    <div>
                      <strong>One token per room, this period</strong>
                      <span>Supply 1 · zero decimals · ERC-3643</span>
                    </div>
                  </div>
                  <div className="timeline__item" data-done={room.state === "held"}>
                    <span className="timeline__dot" />
                    <div>
                      <strong>
                        {room.state === "held"
                          ? "Transferred to one verified broker"
                          : "Waiting for one verified broker"}
                      </strong>
                      <span>
                        {room.state === "held"
                          ? `Holder ${demo.brokerShort} · settled ${formatDate("2027-01-02")}`
                          : "Buying is restricted to wallets on the ATS verified list"}
                      </span>
                    </div>
                  </div>
                  <div className="timeline__item">
                    <span className="timeline__dot" />
                    <div>
                      <strong>Rights expire at the end date</strong>
                      <span>
                        Token burned · listing and verification records expire
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="notice notice--brass" style={{ marginTop: 20 }}>
              <span className="notice__icon" aria-hidden="true">
                i
              </span>
              <div>
                <strong>Rent is separate.</strong>
                <p>
                  The broker arranges the tenant&apos;s rent, deposit, lease and
                  maintenance off-platform. This product checks the room right
                  and the identity match — not the lease itself.
                </p>
              </div>
            </div>

            <div className="between wrap" style={{ marginTop: 26 }}>
              <Link
                href={`/verify/${demo.propertyId}?room=${room.id}`}
                className="text-link"
              >
                Open public verification page
              </Link>
              <span className="mono dim" style={{ fontSize: 10.5 }}>
                {demo.nullifierShort}
              </span>
            </div>
          </div>
        </div>

        <BuyPanel room={room as Room} live={live} />
      </div>
    </div>
  );
}
