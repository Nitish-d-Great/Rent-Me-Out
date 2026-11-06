# Why Arkiv

**What users would lose with Postgres:**

- **Checking without trusting us.** Anyone can run the query in [schema.md](schema.md) with
  no account and no key. A tenant, or another app, does not need our API to find a room or a
  rights record. With Postgres, only our app could answer.
- **Expiry they can verify.** A listing's expiry is part of the record, enforced by the
  network, not a cleanup job on our server that might not run.
- **A record that outlives our app.** Listings and rights records stay readable until they
  expire, even if our site is down.

**What Arkiv does not do:** it does not decide who holds a room. Hedera does. If the two ever
disagree, the app shows Hedera's answer, and a failed Arkiv write is reported as "not indexed"
rather than as a failed sale.

**What we kept off Arkiv, and why:**

| Data | Where it is | Why |
|---|---|---|
| Deeds, addresses, nicknames, commitments | Encrypted on Swarm | Arkiv entities are public |
| The encryption key | Server environment | A public entity must never hold it |
| Encrypted-reference keys | Nowhere: we encrypt ourselves, so references hold no key | Swarm's own encrypted references contain their key |
| Who holds a room, and payments | Hedera | Needs atomic settlement and compliance controls |
| World ID nullifiers | Hedera, hashed | Expiry would let a banned person re-register when it lapsed |
| Owner's Semaphore secret | The owner's browser | Must never leave their device |
