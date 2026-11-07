# World ID: trust moments and credential choice

> **Question:** Clearly explain the specific product event requiring trust and why the chosen
> credential is the minimum sufficient assurance.

Rent Me Out sells the time-limited right to rent out one room. A broker buys that right as a
token, then shows the room to tenants. The fraud we exist to stop is a broker collecting an
advance for a room they have no right to rent.

World ID answers one question at three moments: **is this one real person, and is it the same
one we enrolled?** We use **Proof of Human** at all three. That also limits bots and AI agents,
because each identity has to cost one real person.

| Product event | What must be true | Credential |
|---|---|---|
| An owner lists a property | Each owner identity belongs to one real person, and one person cannot hold several | Proof of Human |
| A broker enrolls before buying | Only enrolled wallets can buy, and one person cannot enroll several broker wallets | Proof of Human |
| A broker proves themselves at a viewing | The rights holder's session is being proven now, not replayed | Proof of Human |

## 1. An owner lists a property

**The event.** Owners submit a property, and once approved, they can issue a room token that
brokers pay for.

**Why trust is needed.** One person could appear as many unrelated owners. Bots or AI agents
posing as owners could also flood the registrar with fake applications. Each one takes a human
review to clear, and costs us storage on Swarm and a paid write on Arkiv. Requiring Proof of Human
before an application is how we address this. The app asks for it today, but the server does not
enforce it yet (see Current implementation).

**Why Proof of Human is the minimum.** The registrar already checks the deed, so World ID does
not need to prove ownership or identity. We only need to know that each owner identity is one
real person. Proof of Human provides that, and we learn nothing else about the person.

**Why not something else.**
- **Selfie Check** is medium assurance and does not provide a strict one-person-one-account
  guarantee, which is the exact property we need.
- **Passport** is unique per document rather than per person, so two passports could mean two
  identities. It also reveals more than we need.

## 2. A broker enrolls before buying

**The event.** A broker verifies before they can buy a room. `RentalRegistry.buyRoom` rejects any
wallet that is not enrolled, so this is enforced on-chain as well as in the UI.

**Why trust is needed.** Without it, one person could run many wallets to hoard rooms, or abandon
a wallet with a bad record and start again. Scripted wallets or AI agents could do the same at
scale, buying up a city's rooms to resell access or lock out real brokers.

**Why Proof of Human is the minimum.** The fraud is one operator running many accounts, whether
that operator is a person or a program, so one-person-one-account is exactly what we need. A
broker's name, nationality and documents are not needed to enforce that, so we do not ask for them.

World confirms that a proof is valid, but it accepts a repeated proof. Rejecting a duplicate is
our job, so `BrokerIdentityRegistry` binds one identity to one wallet on-chain.

## 3. A broker proves themselves at a viewing

**The event.** A tenant standing in a room asks the broker to prove they hold its rights before
paying an advance.

**Why trust is needed.** A public record shows that a wallet holds the room, but not that this
visit is connected to it. This is the moment the money is at risk.

**Why Proof of Human is the minimum.** The question here is continuity with the person already
enrolled, so a new credential or more personal data adds nothing. The broker proves the session
created at Proof of Human enrollment, with a fresh request tied to this viewing:

1. The tenant's page issues a fresh challenge for this room, which expires after 5 minutes.
2. The broker proves their session in the World app.
3. The server checks the proof with World and checks that the session is bound on-chain to the
   wallet holding this room.
4. The tenant gets a server-signed match or mismatch. The page shows the holder's public wallet
   and a hash of their World ID identity, but no name or personal details.

A proof captured at an earlier viewing is rejected at a new one, because it is bound to the earlier
viewing's challenge.

**What this does not prove.** World's documentation does not guarantee that a session proof is
cryptographically tied to the human who created the session. So a match means "this session
belongs to the current rights holder", which is the claim the product makes and no more.

## Bots and AI agents

Creating wallets is free and easy to automate, so a wallet says nothing about who is behind it.
A CAPTCHA only slows automation down, and collecting documents would ask for far more personal
data than this problem needs. Proof of Human changes the cost: each new identity requires another
real person, not another script.

| Without Proof of Human | With it |
|---|---|
| A script creates unlimited owner identities | Each owner identity needs a unique person |
| Agents enroll many broker wallets and hoard rooms | One person can enroll one broker wallet |
| An operator abandons a wallet and enrolls a fresh one | The fresh wallet is refused while their identity stays bound |

**What it does not stop.** A real person could still let an agent act through their own enrolled
wallet. Proof of Human limits how many identities one person can have, not who or what operates
them, so that person is still limited to one identity, and the registrar can freeze or reject
what they do.

## Why Proof of Human over Selfie Check

Selfie Check is easier to get, because it needs no Orb visit. We still chose Proof of Human,
because our rules depend on one guarantee that Selfie Check does not offer.

| What we need | Proof of Human | Selfie Check |
|---|---|---|
| One real person per identity | Documented as one per human | Medium assurance, with no strict one-person-one-account guarantee |
| An on-chain "one identity, one wallet" rule that means something | Yes: a second wallet for the same action needs a second person | The rule still runs, but one person getting two identities could hold two wallets |
| Limits on bots and agents at scale | Each new identity needs a person who has not enrolled | Weaker, and its `sybil_score` is a risk signal rather than a uniqueness verdict |

The strongest reason is `BrokerIdentityRegistry`. It enforces one identity per wallet exactly, but
it can only be as trustworthy as the uniqueness of the credential feeding it. Money changes hands
on that rule: a broker pays for a room, and a tenant pays that broker an advance. So we want the
stronger guarantee at enrollment rather than a risk score to interpret.


## Why not ask for more

World ID verifies a person, not a property. It cannot show that someone owns a flat or may rent
it. The registrar and the on-chain rights cover that, so asking World ID for more identity data
would add exposure without closing any gap.

## Current implementation

So that a reader can check these claims against the code:

- **Requested credential.** In sandbox and production, requests use
  `any(proof_of_human, selfie)` from `app/lib/world/client.ts`, so a user without Proof of Human
  can fall back to Selfie Check. The server does not currently check which credential was
  returned, so Proof of Human is the credential we have designed around and tested with, and not
  yet one the code enforces.
- **Where bots are blocked today.** Buying is enforced on-chain, because `buyRoom` rejects a wallet
  that is not enrolled. Listing needs a registrar-approved proof. Submitting an application checks
  World ID only in the UI: `/api/properties` does not check it yet, so a script calling that route
  directly could still reach the queue. `/api/world/verify` also does not yet require a signature
  proving the caller owns the wallet being enrolled.
- **Scope of the uniqueness rule.** It applies per action, so one person can hold one owner wallet
  and one broker wallet. There is no ban feature: rejecting an application does not block that
  person from applying again, and the registrar's `removeBroker` frees an identity for re-enrollment.
- **Tested so far.** Enrollment has run with Proof of Human through the World ID Simulator. A
  real device run through the Sandbox app has also reported Proof of Human. Both use test
  credentials: no Orb has been involved, and a real user would need an Orb visit for Proof of Human.
- **Viewing check.** It has completed end to end on a real device through the Sandbox app, on a
  local deployment. The app does not record which credential came back, so the credential used
  at that moment has not been observed.
- **Unsuccessful paths.** A person who declines in the app gets "Verification was cancelled" and
  nothing is submitted, which we tested on a real device through the Sandbox app. A second wallet
  for the same identity and action is refused, which we saw through the simulator.

---

> **Question:** Include a short integration debrief/feedback: time to first success, friction
> encountered, missing capability or documentation, and the one improvement with the greatest
> impact.

## Time to first success

**Minutes once our RP existed, and about four hours in practice.** Writing the integration was
not the slow part. The time went on working out which integration was current, and on an app that
answered `app_not_migrated` with no visible way to migrate. The dashboard showed no banner because
the app had no RP registration at all. The Developer Portal MCP's `configure_world_id` created one
in a single call, and the first signed request succeeded minutes later.

## Friction encountered

1. **v2 versus v4 ambiguity cost the most time.** An error code still points to a v2 endpoint
   that the docs do not describe, so confirming that `/api/v4/verify/{rp_id}` is current took
   longer than writing the code.
2. **We designed a flow that cannot exist.** We planned a repeatable `broker-presence` action, but
   each person can complete an action only once. Session proofs are the right answer, but we found
   them only after the design was written, because the credentials page and API reference did not
   lead us there.
3. **The simulator hid real problems.** Our viewing check passed through the simulator but could
   not work on a phone: no QR was shown, and its nonce check would have rejected every genuine
   proof. We found this only when moving to a real device.
4. **`environment` silently decides which app the QR opens.** `sandbox` opens the Sandbox app and
   `staging` opens the regular World App. We found no documentation of this mapping, and a mismatch
   looks like a verification failure.
5. **Errors are too vague to act on.** Refused requests often arrive as `generic_error`, so we
   built a probe page that changes one input at a time. That is how we found `nullifier_replayed`.
6. **Testing is one-shot.** Each identity gets one attempt per action, so rehearsing needs a new
   action name for each run.
7. **No server-side verify helper in 4.x.** Every integrator hand-writes the fetch and the
   environment check, and omitting that check means a staging proof could be accepted in production.

## Missing capability or documentation

- **Session binding is not stated.** The docs do not say whether a session proof is
  cryptographically tied to the human who created the session.
- **Session support for Proof of Human is not documented.** Every session example we found uses
  Selfie Check, so products needing high assurance and repeat checks have no documented path.
- **`signRequest` cannot accept a chosen nonce.** A relying party with its own per-event challenge
  has no direct way to tie it to the proof. We sign a binding between the two ourselves. It is also
  not stated that a result's nonce equals the `rp_context` nonce, though our testing depends on it.
- **A reused nullifier returns `success: true`.** Only the message text differs, so an integration
  that checks the obvious field accepts every duplicate.
- **`any()` is exported but appears in no prose docs we read,** even though the unavailable-credential
  path depends on it.
- **What each credential reveals is not listed,** so a data-minimization argument has to be inferred.

## The one improvement with the greatest impact

**State whether a session proof is cryptographically bound to the human who created the session,
and if it is, give relying parties a stable way to check "is this the same human as last time?"**

That question is the point of repeated verification, and today there is no documented way to
answer it. `session_nullifier` is explicitly not an account identifier, and an enrollment nullifier
cannot be compared with later session responses.

For us this is concrete. A tenant at a door wants to know the broker in front of them is the human
who bought the rights. We can prove the session is bound to the rights-holding wallet, and we claim
only that. With this guarantee documented, the same flow would give a cryptographic answer instead
of a product assumption.

**Runner-up:** a 4.x server helper for verification that includes the environment check.
