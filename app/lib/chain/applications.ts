import "server-only";
import { ExpirationTime } from "@arkiv-network/sdk";
import { and, eq } from "@arkiv-network/sdk/query";
import { addr, u64 } from "@arkiv-network/sdk/schema";
import { bytesToString, getAddress, hexToBytes, keccak256, stringToBytes, toBytes, type Hex } from "viem";
import { arkivPublic, arkivWallet, arkivWriterAddress, columnValue, serialWrite } from "@/lib/arkiv/client";
import { PropertyApplication } from "@/lib/arkiv/schemas";
import { downloadSealedJson, uploadSealed, uploadSealedJson } from "@/lib/swarm/store";
import { registryAddress } from "./registry";

/**
 * Property applications, held between the owner submitting one and the registrar
 * deciding on it.
 *
 * Arkiv holds the public, queryable part: status and timestamps. Everything that could
 * identify the property is encrypted on Swarm, and the entity keeps only a reference to
 * that ciphertext. Each entity is tagged with the registry it was made for, so deploying
 * a new registry starts with an empty queue rather than approvals that mean nothing.
 */

const APPLICATION_LIFETIME_DAYS = 90;
const PAGE_LIMIT = 100;

/** What the owner submitted. Encrypted on Swarm and never written to Arkiv. */
interface SealedDetails {
  commitment: string;
  nickname: string;
  locality: string;
  city: string;
  latitudeE6?: number;
  longitudeE6?: number;
  rooms: number;
  deedName: string;
  deedRef: string;
}

export interface ApplicationRow {
  entityKey: Hex;
  applicationId: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  decidedAt?: string;
  transactionHash?: string;
  reason?: string;
  sealedRef: string;
}

export type Application = ApplicationRow & SealedDetails;

export interface NewApplication {
  applicationId: string;
  commitment: string;
  nickname: string;
  locality: string;
  city: string;
  latitudeE6: number;
  longitudeE6: number;
  rooms: number;
  deedName: string;
  deed: Uint8Array;
}

/** Lets an owner's device find its applications without publishing its commitment. */
export function ownerTagOf(commitment: string): string {
  return keccak256(toBytes(`rentmeout-owner:${commitment}`));
}

type Condition = Parameters<typeof and>[number];

const registry = () => addr(getAddress(registryAddress()));

const COLUMNS = {
  $key: true, applicationId: true, status: true, submittedAt: true, sealedRef: true,
  decidedAt: true, decisionTx: true, reason: true,
} as const;

function toRow(entity: Record<string, unknown>): ApplicationRow {
  const reason = columnValue<Hex>(entity.reason);
  const decidedAt = columnValue<bigint | string>(entity.decidedAt);
  return {
    entityKey: entity.$key as Hex,
    applicationId: columnValue<string>(entity.applicationId) ?? "",
    status: (columnValue<string>(entity.status) ?? "pending") as ApplicationRow["status"],
    submittedAt: new Date(Number(columnValue<bigint | string>(entity.submittedAt)) * 1000).toISOString(),
    decidedAt: decidedAt === undefined ? undefined : new Date(Number(decidedAt) * 1000).toISOString(),
    transactionHash: columnValue<string>(entity.decisionTx),
    reason: reason ? bytesToString(hexToBytes(reason)) : undefined,
    sealedRef: columnValue<string>(entity.sealedRef) ?? "",
  };
}

async function queryRows(filter?: { ownerTag?: string; applicationId?: string }): Promise<ApplicationRow[]> {
  const conditions: Condition[] = [eq("registry", registry())];
  if (filter?.ownerTag) conditions.push(eq("ownerTag", filter.ownerTag));
  if (filter?.applicationId) conditions.push(eq("applicationId", filter.applicationId));

  const { entities } = await arkivPublic()
    .select(COLUMNS)
    .from(PropertyApplication)
    .ownedBy(arkivWriterAddress())
        // The SDK types where() against a fixed list of columns, so a filter assembled at
    // runtime has to be cast.
    .where(and(...(conditions as [never])) as never)
    .limit(PAGE_LIMIT)
    .fetch();

  return (entities as unknown as Record<string, unknown>[]).map(toRow);
}

/** A reference is immutable, so its plaintext can be kept for the life of the process. */
const detailsCache = new Map<string, SealedDetails>();

async function withDetails(row: ApplicationRow): Promise<Application> {
  let details = detailsCache.get(row.sealedRef);
  if (!details) {
    details = await downloadSealedJson<SealedDetails>(row.sealedRef);
    detailsCache.set(row.sealedRef, details);
  }
  return { ...row, ...details };
}

const newestFirst = (a: ApplicationRow, b: ApplicationRow) =>
  b.submittedAt.localeCompare(a.submittedAt);

/**
 * One application the server cannot decrypt, usually because another deployment wrote it
 * with a different DEED_ENCRYPTION_KEY, must not hide the rest of the queue.
 */
export async function listApplications(): Promise<{
  applications: Application[];
  unreadable: string[];
}> {
  const rows = (await queryRows()).sort(newestFirst);
  const results = await Promise.allSettled(rows.map(withDetails));
  const applications: Application[] = [];
  const unreadable: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      applications.push(result.value);
    } else {
      unreadable.push(rows[index].applicationId);
      console.error(
        `[applications] cannot read ${rows[index].applicationId}:`,
        result.reason instanceof Error ? result.reason.message : result.reason,
      );
    }
  });
  return { applications, unreadable };
}

export async function listApplicationsOfOwner(commitment: string): Promise<Application[]> {
  const rows = (await queryRows({ ownerTag: ownerTagOf(commitment) })).sort(newestFirst);
  const results = await Promise.allSettled(rows.map(withDetails));
  // Same reasoning as listApplications: an old unreadable entry must not hide the rest.
  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

export async function getApplication(applicationId: string): Promise<Application | undefined> {
  const [row] = await queryRows({ applicationId });
  return row ? withDetails(row) : undefined;
}

export async function addApplication(app: NewApplication): Promise<ApplicationRow> {
  if ((await queryRows({ applicationId: app.applicationId })).length > 0) {
    throw new Error("duplicate_application");
  }

  const deedRef = await uploadSealed(app.deed);
  const sealedRef = await uploadSealedJson({
    commitment: app.commitment,
    nickname: app.nickname,
    locality: app.locality,
    city: app.city,
    latitudeE6: app.latitudeE6,
    longitudeE6: app.longitudeE6,
    rooms: app.rooms,
    deedName: app.deedName,
    deedRef,
  } satisfies SealedDetails);

  const submittedAt = Math.floor(Date.now() / 1000);
  const { entityKey } = await serialWrite(() =>
    arkivWallet().createEntity(
      PropertyApplication,
      {
        registry: registry(),
        applicationId: app.applicationId,
        status: "pending",
        ownerTag: ownerTagOf(app.commitment),
        submittedAt: u64(BigInt(submittedAt)),
        sealedRef,
      },
      { expiration: ExpirationTime.fromDays(APPLICATION_LIFETIME_DAYS) },
    ),
  );

  return {
    entityKey,
    applicationId: app.applicationId,
    status: "pending",
    submittedAt: new Date(submittedAt * 1000).toISOString(),
    sealedRef,
  };
}

export async function settleApplication(
  applicationId: string,
  status: "approved" | "rejected",
  transactionHash: string,
  reason?: string,
): Promise<void> {
  const [row] = await queryRows({ applicationId });
  if (!row) return;
  await serialWrite(() =>
    arkivWallet().patchEntity(PropertyApplication, row.entityKey, {
      set: {
        status,
        decidedAt: u64(BigInt(Math.floor(Date.now() / 1000))),
        ...(transactionHash ? { decisionTx: transactionHash } : {}),
        ...(reason ? { reason: stringToBytes(reason) } : {}),
      },
    }),
  );
}
