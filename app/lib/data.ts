export type RoomState =
  | "available"
  | "held"
  | "frozen"
  | "expired"
  /** Owner withdrew before a sale; the token is burned, as with expiry. */
  | "cancelled";
export type ApprovalState = "approved" | "pending" | "rejected" | "archived";
export type VerificationState = "verified" | "unverified" | "pending";

export interface Room {
  id: string;
  tokenId: string;
  /** The room's ATS token. Only live listings have one; sample rooms do not. */
  tokenAddress?: string;
  name: string;
  note: string;
  price: number;
  state: RoomState;
  holder?: string;
  holderName?: string;
  holderNullifier?: string;
  validFrom: string;
  validUntil: string;
  transactionId?: string;
  tint: string;
}

export interface Property {
  id: string;
  nickname: string;
  locality: string;
  city: string;
  rooms: Room[];
  approval: ApprovalState;
  ownerWallet: string;
  submittedAt: string;
  reviewedAt?: string;
  rejectionReason?: string;
  deedName: string;
  deedPages: number;
  description: string;
}

// Set NEXT_PUBLIC_SITE_URL in the deployment environment for deep links/QRs.
export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://rentmeout.xyz";
export const siteHost = siteUrl.replace(/^https?:\/\//, "");

export const demo = {
  propertyId: "rmo-3b-andheri",
  propertyName: "Ashoka Residency",
  locality: "Andheri West",
  city: "Mumbai",
  ownerWallet: "0x6b4f8d1c3e7a92b40d5f6a18c2e9d7710a91",
  brokerWallet: "0x9f21c4a8b7e602d15a3c8f90be4271ad7c04",
  brokerShort: "0x9f21…7c04",
  ownerShort: "0x6b4f…0a91",
  nullifier: "0x7a3f9c2d84b16e507fa3c1d98e42b6a5c91e",
  nullifierShort: "0x7a3f…c91e",
  periodStart: "2027-01-01",
  periodEnd: "2027-03-31",
  periodLabel: "Jan – Mar 2027",
  propertyRoot: "0x4d2a…8f10",
  rootVersion: 12,
  registrarWallet: "0xregistrar…4e21",
  network: "Hedera testnet",
  listingTx: "0.0.5941282@1778930122.123456789",
  purchaseTx: "0.0.5941282@1778944810.884210345",
  usdcTx: "0.0.5941282@1778944810.884210345",
};

export const rooms: Room[] = [
  {
    id: "r1",
    tokenId: "0.0.5941280",
    name: "Room 1 · Sea-facing",
    note: "North-east corner, attached bath, 128 sq ft.",
    price: 850,
    state: "available",
    validFrom: demo.periodStart,
    validUntil: demo.periodEnd,
    tint: "var(--room-1)",
  },
  {
    id: "r2",
    tokenId: "0.0.5941281",
    name: "Room 2 · Balcony",
    note: "West-facing balcony, attached bath, 142 sq ft.",
    price: 980,
    state: "held",
    holder: demo.brokerWallet,
    holderName: "Verified broker · 0x9f21…7c04",
    holderNullifier: demo.nullifier,
    validFrom: demo.periodStart,
    validUntil: demo.periodEnd,
    transactionId: demo.purchaseTx,
    tint: "var(--room-2)",
  },
  {
    id: "r3",
    tokenId: "0.0.5941282",
    name: "Room 3 · Courtyard",
    note: "Quiet courtyard view, shared bath, 116 sq ft.",
    price: 820,
    state: "available",
    validFrom: demo.periodStart,
    validUntil: demo.periodEnd,
    tint: "var(--room-3)",
  },
];

export const property: Property = {
  id: demo.propertyId,
  nickname: demo.propertyName,
  locality: demo.locality,
  city: demo.city,
  rooms,
  approval: "approved",
  ownerWallet: demo.ownerWallet,
  submittedAt: "2026-10-18",
  reviewedAt: "2026-10-21",
  deedName: "ashoka-residency-deed.pdf",
  deedPages: 14,
  description:
    "A three-bedroom flat with a shared hall and kitchen. Each room is listed separately for a single three-month rental period.",
};

export const ownerProperties: Property[] = [
  property,
  {
    id: "rmo-bandra-studio",
    nickname: "Bandra studio",
    locality: "Bandra East",
    city: "Mumbai",
    rooms: [],
    approval: "pending",
    ownerWallet: demo.ownerWallet,
    submittedAt: "2026-11-02",
    deedName: "bandra-studio-deed.pdf",
    deedPages: 8,
    description: "A compact studio with a separate entry, listed as one room.",
  },
  {
    id: "rmo-powai-2bhk",
    nickname: "Powai 2BHK",
    locality: "Powai",
    city: "Mumbai",
    rooms: [],
    approval: "rejected",
    ownerWallet: demo.ownerWallet,
    submittedAt: "2026-10-11",
    reviewedAt: "2026-10-14",
    rejectionReason:
      "Page 3 of the deed is unreadable. Upload a clearer scan of the stamped pages.",
    deedName: "powai-deed.pdf",
    deedPages: 11,
    description: "Two bedrooms around a shared hall, close to the lake.",
  },
  {
    id: "rmo-colaba-1bhk",
    nickname: "Colaba flat",
    locality: "Colaba",
    city: "Mumbai",
    rooms: [],
    approval: "archived",
    ownerWallet: demo.ownerWallet,
    submittedAt: "2026-08-24",
    reviewedAt: "2026-08-29",
    deedName: "colaba-deed.pdf",
    deedPages: 6,
    description: "A one-bedroom flat, withdrawn by the owner.",
  },
];

export interface Application {
  id: string;
  nickname: string;
  locality: string;
  city: string;
  ownerWallet: string;
  submittedAt: string;
  status: "pending" | "approved" | "rejected";
  deedName: string;
  deedPages: number;
  rooms: number;
  note: string;
  rejectionReason?: string;
}

export const applications: Application[] = [
  {
    id: "APP-1042",
    nickname: "Marine Lines 2BHK",
    locality: "Marine Lines",
    city: "Mumbai",
    ownerWallet: "0x3d02b8c1f4a69e75d20b8a6c92f14e7b5a38",
    submittedAt: "2026-11-04",
    status: "pending",
    deedName: "marine-lines-deed.pdf",
    deedPages: 12,
    rooms: 2,
    note: "Deed and society NOC uploaded. Owner requests a Jan–Mar 2027 listing.",
  },
  {
    id: "APP-1041",
    nickname: "Khar heritage 3BHK",
    locality: "Khar West",
    city: "Mumbai",
    ownerWallet: "0x8c71a2e9d5b430f6a8c17e2d94b05f361c9d",
    submittedAt: "2026-11-03",
    status: "pending",
    deedName: "khar-heritage-deed.pdf",
    deedPages: 21,
    rooms: 3,
    note: "Old tenancy document included. Owner marked two rooms for family use.",
  },
  {
    id: "APP-1039",
    nickname: "Lower Parel 1BHK",
    locality: "Lower Parel",
    city: "Mumbai",
    ownerWallet: "0xa1f36c8d02e94b75c8a1d3e60f47b928d5c2",
    submittedAt: "2026-11-01",
    status: "pending",
    deedName: "lower-parel-deed.pdf",
    deedPages: 9,
    rooms: 1,
    note: "Single room, corporate lease expiring in December 2026.",
  },
  {
    id: "APP-1036",
    nickname: "Versova 2BHK",
    locality: "Versova",
    city: "Mumbai",
    ownerWallet: "0x6b4f8d1c3e7a92b40d5f6a18c2e9d7710a91",
    submittedAt: "2026-10-28",
    status: "approved",
    deedName: "versova-deed.pdf",
    deedPages: 10,
    rooms: 2,
    note: "Approved on 30 Oct 2026. Two room listings created.",
  },
];

export interface Transaction {
  id: string;
  type: string;
  detail: string;
  date: string;
  amount?: string;
  status: "confirmed" | "pending";
}

export const ownerTransactions: Transaction[] = [
  {
    id: demo.listingTx,
    type: "Listing created",
    detail: "3 room tokens minted for Jan – Mar 2027",
    date: "2026-11-05",
    status: "confirmed",
  },
  {
    id: demo.purchaseTx,
    type: "Room 2 sold",
    detail: "980 USDC received · token transferred to broker",
    date: "2027-01-02",
    amount: "+980 USDC",
    status: "confirmed",
  },
  {
    id: "0.0.5941282@1778867210.120945613",
    type: "Property approved",
    detail: "Registrar approved Ashoka Residency",
    date: "2026-10-21",
    status: "confirmed",
  },
];

export const brokerRights: Transaction[] = [
  {
    id: demo.purchaseTx,
    type: "Room 2 · Ashoka Residency",
    detail: "Rights held · Jan – Mar 2027 · 980 USDC",
    date: "2027-01-02",
    status: "confirmed",
  },
];

export const marketplaceRooms = rooms.map((room) => ({
  ...room,
  propertyId: demo.propertyId,
  propertyName: demo.propertyName,
  locality: demo.locality,
  city: demo.city,
  periodLabel: demo.periodLabel,
}));

export function shortWallet(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function formatUsdc(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

/** A room's own rights period, for sample and on-chain rooms alike. */
export function periodLabel(room: Pick<Room, "validFrom" | "validUntil">): string {
  return `${formatDate(room.validFrom)} – ${formatDate(room.validUntil)}`;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
