import "server-only";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Pending property applications, held between the owner submitting one and the
 * registrar deciding on it.
 *
 * File-backed rather than in-memory so a dev-server restart mid-demo does not lose the
 * owner's commitment -- without it the registrar has nothing to approve, and the owner
 * would have to re-create their identity.
 *
 * This is demo-scale storage, not a database: single process, no concurrent writers.
 */

export interface Application {
  applicationId: string;
  /** The owner's Semaphore identity commitment, generated on their device. */
  commitment: string;
  nickname: string;
  locality: string;
  city: string;
  rooms: number;
  submittedAt: string;
  status: "pending" | "approved" | "rejected";
  transactionHash?: string;
  reason?: string;
}

const STORE = join(process.cwd(), ".rmo-data", "applications.json");

function load(): Application[] {
  try {
    return JSON.parse(readFileSync(STORE, "utf8")) as Application[];
  } catch {
    return [];
  }
}

function save(apps: Application[]): void {
  mkdirSync(dirname(STORE), { recursive: true });
  writeFileSync(STORE, JSON.stringify(apps, null, 2));
}

export function listApplications(): Application[] {
  return load().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function getApplication(applicationId: string): Application | undefined {
  return load().find((a) => a.applicationId === applicationId);
}

export function addApplication(
  app: Omit<Application, "submittedAt" | "status">,
): Application {
  const apps = load();
  if (apps.some((a) => a.applicationId === app.applicationId)) {
    throw new Error("duplicate_application");
  }
  const record: Application = {
    ...app,
    submittedAt: new Date().toISOString(),
    status: "pending",
  };
  apps.push(record);
  save(apps);
  return record;
}

export function settleApplication(
  applicationId: string,
  status: "approved" | "rejected",
  transactionHash: string,
  reason?: string,
): void {
  const apps = load();
  const app = apps.find((a) => a.applicationId === applicationId);
  if (!app) return;
  app.status = status;
  app.transactionHash = transactionHash;
  if (reason) app.reason = reason;
  save(apps);
}
