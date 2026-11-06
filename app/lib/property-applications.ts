import { ExpirationTime } from "@arkiv-network/sdk";
import { addr, defineSchema, str, u64 } from "@arkiv-network/sdk/schema";
import { and, eq } from "@arkiv-network/sdk/query";
import { arkivPublicClient, type ArkivWalletClient } from "@/lib/arkiv";

export const PropertyApplicationSchema = defineSchema(
  "rent-me-out.property-application.v1",
  {
    owner: addr().indexed(),
    propertyName: str(),
    locality: str().indexed(),
    city: str().indexed(),
    roomCount: u64(),
    status: str().indexed(),
    submittedAt: u64().indexed(),
  },
);

export const PropertyReviewSchema = defineSchema(
  "rent-me-out.property-review.v1",
  {
    applicationKey: str().indexed(),
    status: str().indexed(),
    reviewer: addr().indexed(),
    reason: str(),
    reviewedAt: u64().indexed(),
  },
);

export type PropertyApplicationRecord = {
  key: string;
  owner: `0x${string}`;
  propertyName: string;
  locality: string;
  city: string;
  roomCount: number;
  submittedAt: number;
  status: "pending" | "approved" | "rejected";
  decisionReason?: string;
  reviewedAt?: number;
};

export const registrarWallets = (process.env.NEXT_PUBLIC_REGISTRAR_WALLETS ?? "")
  .split(",")
  .map((wallet) => wallet.trim().toLowerCase())
  .filter((wallet) => /^0x[0-9a-f]{40}$/.test(wallet));

export async function createPropertyApplication(
  wallet: ArkivWalletClient,
  input: {
    owner: `0x${string}`;
    propertyName: string;
    locality: string;
    city: string;
    roomCount: number;
  },
) {
  return wallet.createEntity(
    PropertyApplicationSchema,
    {
      ...input,
      owner: addr(input.owner),
      roomCount: u64(BigInt(input.roomCount)),
      status: "pending",
      submittedAt: u64(BigInt(Math.floor(Date.now() / 1000))),
    },
    { expiration: ExpirationTime.fromDays(365) },
  );
}

export async function fetchPendingPropertyApplications() {
  const { entities } = await arkivPublicClient
    .select()
    .from(PropertyApplicationSchema)
    .where(eq("status", "pending"))
    .fetch();

  const pending = await Promise.all(
    entities.map(async (entity): Promise<PropertyApplicationRecord | null> => {
      if (entity.$owner.toLowerCase() !== entity.owner.value.toLowerCase()) {
        return null;
      }
      const reviews = await arkivPublicClient
        .select()
        .from(PropertyReviewSchema)
        .where(eq("applicationKey", entity.$key))
        .fetch();
      const trustedReviews = reviews.entities
        .filter((review) =>
          registrarWallets.includes(review.$owner.toLowerCase()),
        )
        .sort((a, b) => Number(b.$createdAt - a.$createdAt));
      const latest = trustedReviews[0];
      const status = latest?.status.value;
      if (status === "approved" || status === "rejected") return null;

      return {
        key: entity.$key,
        owner: entity.owner.value,
        propertyName: entity.propertyName.value,
        locality: entity.locality.value,
        city: entity.city.value,
        roomCount: Number(entity.roomCount.value),
        submittedAt: Number(entity.submittedAt.value),
        status: "pending",
      };
    }),
  );

  return pending
    .filter((application): application is PropertyApplicationRecord => application !== null)
    .sort((a, b) => b.submittedAt - a.submittedAt);
}

export async function createPropertyReview(
  wallet: ArkivWalletClient,
  input: {
    applicationKey: string;
    reviewer: `0x${string}`;
    status: "approved" | "rejected";
    reason: string;
  },
) {
  return wallet.createEntity(
    PropertyReviewSchema,
    {
      ...input,
      reviewer: addr(input.reviewer),
      reviewedAt: u64(BigInt(Math.floor(Date.now() / 1000))),
    },
    { expiration: ExpirationTime.fromDays(365) },
  );
}

export async function fetchApplicationReview(applicationKey: string) {
  const { entities } = await arkivPublicClient
    .select()
    .from(PropertyReviewSchema)
    .where(eq("applicationKey", applicationKey))
    .fetch();

  const latest = entities
    .filter((review) => registrarWallets.includes(review.$owner.toLowerCase()))
    .sort((a, b) => Number(b.$createdAt - a.$createdAt))[0];

  if (!latest) return null;
  const status = latest.status.value;
  if (status !== "approved" && status !== "rejected") return null;
  return {
    status: status as "approved" | "rejected",
    reason: latest.reason.value,
    reviewedAt: Number(latest.reviewedAt.value),
    reviewer: latest.$owner,
  };
}

export async function fetchApprovedPropertyApplication(owner: `0x${string}`) {
  const { entities } = await arkivPublicClient
    .select()
    .from(PropertyApplicationSchema)
    .where(eq("owner", addr(owner)))
    .fetch();

  const owned = entities.filter(
    (entity) => entity.$owner.toLowerCase() === owner.toLowerCase(),
  );
  const approvedRecords = await Promise.all(
    owned.map(async (entity) => {
      const reviews = await arkivPublicClient
        .select()
        .from(PropertyReviewSchema)
        .where(eq("applicationKey", entity.$key))
        .fetch();
      const latest = reviews.entities
        .filter((review) => registrarWallets.includes(review.$owner.toLowerCase()))
        .sort((a, b) => Number(b.$createdAt - a.$createdAt))[0];
      return latest?.status.value === "approved" ? entity : null;
    }),
  );
  const approved = approvedRecords.find((entity) => entity !== null);
  if (!approved) return null;
  return {
    key: approved.$key,
    owner: approved.owner.value,
    propertyName: approved.propertyName.value,
    locality: approved.locality.value,
    city: approved.city.value,
    roomCount: Number(approved.roomCount.value),
    submittedAt: Number(approved.submittedAt.value),
    status: "approved" as const,
  };
}

export async function submitReview(
  wallet: ArkivWalletClient,
  reviewer: `0x${string}`,
  applicationKey: string,
  status: "approved" | "rejected",
  reason: string,
) {
  const application = await arkivPublicClient.getEntity(
    applicationKey as `0x${string}`,
    PropertyApplicationSchema,
  );
  const existing = await arkivPublicClient
    .select()
    .from(PropertyReviewSchema)
    .where(and(eq("applicationKey", applicationKey), eq("reviewer", addr(reviewer))))
    .fetch();

  if (application.status.value !== "pending") {
    throw new Error("This application is not pending.");
  }
  if (existing.entities.some((record) => record.$owner.toLowerCase() === reviewer.toLowerCase())) {
    throw new Error("You have already reviewed this application.");
  }

  return createPropertyReview(wallet, {
    applicationKey,
    reviewer,
    status,
    reason: reason.trim(),
  });
}
