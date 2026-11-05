# Rent Me Out: Frontend Design Spec

Frontend design for the Rental Rights Tokenisation project (ETHGlobal Mumbai 2026).
Owner of this doc: Person B (product + data). Hand-off to Person A at the API routes.

The one memorable thing in this design: **a 3D cutaway of a 3 BHK flat that tokenises itself on a loop**. Everything else stays quiet.

---

## 1. Design intent

**Subject:** rental rights for rooms in Indian flats. **Audience:** hackathon judges first, then brokers, owners, and tenants on phones. **Primary job of the landing page:** make a judge understand in 20 seconds that *one room = one token = one verified broker*, and that a tenant can check it.

**Visual idea: the architect's drawing sheet, made live.** A flat is first a floor plan, and a floor plan on drawing paper has a title block, a sheet number, hatched walls, and a stamp. We use that vocabulary because it belongs to the subject (property, deeds, registrars), and it avoids the generic dark-neon web3 look.

What we deliberately avoid:
- Dark background with neon green/purple gradients (the default web3 look).
- Cream paper with terracotta accent.
- Identical rounded cards with the same shadow everywhere.
- Tracked-out ALL-CAPS eyebrows above every heading.

---

## 2. Design tokens

### Color

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#EEF1F4` | Page and 3D scene background |
| `--ink` | `#16233B` | Text, walls, linework |
| `--graphite` | `#7B8794` | Secondary text, dimension lines |
| `--brass` | `#C79A2B` | The token itself (coin, key, "rights held") |
| `--verified` | `#1E9E6A` | Verified broker, green check, valid rights |
| `--alert` | `#D4465A` | Frozen, impostor, expired, error |
| `--room-1` | `#8CC3C9` | Room 1 tint (3D only) |
| `--room-2` | `#F0B98A` | Room 2 tint (3D only) |
| `--room-3` | `#B9A9E0` | Room 3 tint (3D only) |

Rule: brass means "a right exists". Green means "a person is verified". Red means "something is wrong". Never reuse them for decoration.

Dark mode: optional, post-hackathon. Ship light first. Do not design for both at the start.

### Type

One family, with its width axis doing the work of a second one.

- **Archivo** (variable: weight 100–900, width 62–125). Use condensed width (`wdth 75`) for the title-block headings, normal width for body and UI.
- **JetBrains Mono**, used **only** for wallet addresses, token IDs, transaction IDs and nullifier hashes. Those are real code-like strings; everything else is Archivo.

Scale (px, 1.25 ratio, mobile → desktop): 14 / 16 / 20 / 25 / 31 / 39 / 61.
Body line length under 70 characters. Sentence case everywhere. No ALL-CAPS labels.

### Shape, space, motion

- Radius: 2px for data elements (tables, chips, stamps), 12px only for the phone-style verify result card. Do not use one radius for everything.
- Spacing: 4px base grid; section gaps 96px desktop, 64px mobile.
- Borders: 1px `--ink` at 20% opacity for structure; 2px `--ink` only for the title block and stamp.
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)` for entrances, linear for the loop's camera drift.
- Respect `prefers-reduced-motion` (see section 9).

---

## 3. Libraries

| Need | Library | Why |
|---|---|---|
| 3D scene | `three` + `@react-three/fiber` (R3F) | Declarative three.js inside React/Next.js |
| 3D helpers | `@react-three/drei` | `OrthographicCamera`, `Text`, `Edges`, `Html`, `ContactShadows`, `Float`, `useGLTF` |
| Timeline / choreography | `gsap` (with `@gsap/react`) | One master timeline drives scene steps, captions, and loop |
| Scroll scrubbing | `lenis` + GSAP `ScrollTrigger` | Smooth scroll and pin the 3D canvas while chapters scroll |
| UI motion (non-3D) | `motion` (Framer Motion) | Button, modal, and stamp micro-interactions |
| Glow / outlines | `@react-three/postprocessing` | Optional. Skip if it hurts mobile FPS |
| Optional asset pipeline | `gltfjsx` + Blender | Only if you replace procedural geometry with a modelled flat |

Version note: match R3F to your React version (R3F v9 is built for React 19; v8 for React 18). Confirm on day one, as the plan already says for every partner SDK.

**Recommended approach for a hackathon: build the flat procedurally in code, not from a Blender model.** Walls are extruded boxes, the floor is a plane, doors are gaps. It is fast to change, has zero asset weight, and every room is a named component you can animate (`<Room index={1} />`). Move to a modelled glTF only if you have spare hours.

### Package manager: pnpm

The project uses **pnpm** only. Do not mix in npm or yarn lockfiles.

```bash
# one-time setup
corepack enable
corepack prepare pnpm@latest --activate   # or pin a version you have tested

# create the app
pnpm create next-app@latest app --typescript --app --eslint

# install the frontend + 3D libraries
cd app
pnpm add three @react-three/fiber @react-three/drei gsap @gsap/react lenis motion
pnpm add -D @types/three

# optional
pnpm add @react-three/postprocessing
pnpm dlx gltfjsx model.glb --transform    # only if you use a modelled glTF
```

Rules for the repo:
- Commit `pnpm-lock.yaml`. Delete any `package-lock.json` or `yarn.lock` that a tool creates.
- Add `"packageManager": "pnpm@<version>"` to the root `package.json` so everyone (and Vercel) uses the same version.
- Use `pnpm dlx` instead of `npx`, and `pnpm install --frozen-lockfile` in CI and on Vercel.
- The repo has `/contracts`, `/app` and `/scripts`. Keep one root `pnpm-workspace.yaml` listing them (`packages: ["app", "contracts", "scripts"]`) so a single `pnpm install` sets up everything.
- Hardhat, `@hashgraph/sdk`, `@arkiv-network/sdk` and `bee-js` are installed with `pnpm add` inside their own package.
- If a dependency complains about hoisting or a missing peer, try `pnpm install --shamefully-hoist` only as a last resort, and note it in the README.

Next.js note: the canvas is a client component. Load it with `dynamic(() => import('./FlatScene'), { ssr: false })`.

---

## 4. The hero: "tokenise a flat" loop

### Scene setup

- Camera: orthographic, isometric angle (about 35° elevation, 45° rotation). Orthographic keeps it looking like a drawing, not a game.
- Flat: 3 BHK plan, three bedrooms (R1, R2, R3) around a shared hall and kitchen. Walls are `--ink` outlines with a flat `--paper`-tinted fill. Room floors take `--room-1/2/3`.
- Lighting: one soft directional light, `ContactShadows` under the flat. No HDRI.
- Overlay: a **title block** in the bottom-right of the viewport (like a drawing sheet): project name, "Sheet 1 of 7", and the current phase name. It updates as the loop advances.

### Timeline (about 28 seconds, loops)

Each step maps to a phase from the project docs. Captions are short, written for a user, and stay on screen the whole step.

| # | Time | What happens in the scene | Caption |
|---|---|---|---|
| 1 | 0–4s | Flat is a flat outline. A deed (paper sheet) slides in and a rubber stamp presses on it. The walls fill in with hatching as the stamp lands. | "The registrar checks the deed." |
| 2 | 4–8s | Roof lifts away, rooms separate slightly (exploded view). Three brass coins rise, one above each room, each labelled `R1`, `R2`, `R3`. | "Each room becomes one token." |
| 3 | 8–12s | Coins settle into a ledger strip along the bottom: period (Jan–Mar 2027), price per room. A faint dotted line links each coin to its room. | "The owner sets the period and price." |
| 4 | 12–17s | A broker figure (simple low-poly pawn) enters. **ZK proof sequence** (section 5). On success a green ring closes and the broker is added to a list at the side. | "A real, unique person is verified. Nothing else is revealed." |
| 5 | 17–21s | USDC travels from the broker to the owner along a line, and at the same moment the brass coin for R2 travels owner → broker. Room 2 turns solid in the broker's colour; R1 and R3 stay outlined (still available). | "One payment, one token, one transaction." |
| 6 | 21–25s | Tenant phone icon scans a QR on the door. Verify card pops up: holder, valid until, green badge. Impostor attempt: a second pawn tries, ring turns red. | "Anyone can check who holds the room." |
| 7 | 25–28s | Calendar wipes to the end date. R2's coin dissolves into dust, the room's fill drains back to outline. Camera pulls back to the start frame. Loop. | "At the end date, the right expires on its own." |

Loop behaviour:
- Autoplays on load, muted by nature (no audio). Pauses when scrolled offscreen (`IntersectionObserver` → `timeline.pause()`).
- A small step indicator (7 ticks, plain lines, not numbered circles) lets people jump to a step. Clicking a tick pauses the loop on that step; "Play" resumes.
- Hovering a coin shows its real-looking fields (token ID, period, holder) in `--mono`.

### Technique notes

- One GSAP master timeline controls a plain mutable `state` object (camera zoom, `roofY`, `explode`, `coinY[]`, `holderIndex`, `proofProgress`). R3F components read this via `useFrame`. This keeps animation logic out of React re-renders.
- Coins: `CylinderGeometry` with a bevel, `MeshStandardMaterial` in `--brass`, `metalness 0.8`, `roughness 0.3`. Text on the face via drei `<Text>` (short token label only).
- Hatching and outlines: drei `<Edges>` on every wall for the drawing-sheet look.
- Dust at expiry: a small `Points` system (200 points max), not a heavy particle library.
- Pawns and phone: primitives (capsule + sphere, rounded box). No external models.

---

## 5. The ZK proof visual (step 4 and the live broker check)

This is the second most important moment after the flat. It must be **truthful about what is real**.

What actually happens (from the project docs): the user completes a World ID check through IDKit. World's proof is generated on the user's side, our **backend** validates it with World's verification API, and we store the **nullifier** (a per-action unique identifier) against the wallet. For presence at a viewing, the broker proves their saved session (`IDKit.proveSession`) and we match the returned `session_id` against the session bound to the token-holder wallet. We do **not** compare nullifiers here: a session proof returns `session_nullifier` purely for replay protection, and the World docs state it must not be used as an account identifier.

So the animation shows the *idea* of a zero-knowledge proof, not our own proof generation:

1. **Face scan ring** (0–1.5s): a thin ring scans over the broker pawn's head.
2. **Collapse** (1.5–3s): the ring's lines dissolve into particles that fold into a single small hexagon.
3. **Nullifier chip** (3–4s): the hexagon becomes a short hash chip in mono, e.g. `0x7a3f…c91e`. A tooltip line: "Same person, same ID every time. Cannot be traced back to who they are."
4. **Match** (4–5s): the chip travels to the token's holder wallet and is compared with the stored hash. Green ring closes on match. Mismatch: ring turns `--alert` and the chip shakes once.

Rules:
- In the **marketing loop**, hashes are fixed fake values. Add a small caption: "Illustration."
- In the **live product flow** (the real broker check), render the **real nullifier from the backend response**, truncated. Never render anything from the client-side proof as proof of authorisation; the backend result is what turns the ring green.
- Never imply we "generate" ZK proofs ourselves. Say "verified with World ID" in copy. If a judge asks, the honest answer is: World ID produces the proof, we validate it server-side and use the nullifier for uniqueness and matching.
- Confirm at the World workshop (5 Nov) what the selfie check and simulator can return, then align the copy and the animation labels.

---

## 6. Page structure (landing)

```
┌───────────────────────────────────────────────────────────┐
│ nav: Rent Me Out            Owner  Broker  Verify a room   │
├───────────────────────────────────────────────────────────┤
│                                                           │
│   Headline (left, 2 lines)       3D FLAT LOOP (right,     │
│   One line of support             60% width, bleeds off   │
│   [List a property] [Verify a room]  the edge)            │
│                                                           │
│                              ┌── title block ──┐          │
│                              │ Sheet 4 of 7    │          │
│                              └─────────────────┘          │
├───────────────────────────────────────────────────────────┤
│ Pinned scroll: the same scene, scrubbed by scroll,        │
│ one chapter per phase, caption left, scene right          │
├───────────────────────────────────────────────────────────┤
│ Three trust moments (World ID): owner / broker / viewing  │
├───────────────────────────────────────────────────────────┤
│ Under the hood: Hedera · World · Arkiv + Swarm (one line  │
│ each, what it does here)                                  │
├───────────────────────────────────────────────────────────┤
│ footer: repo, HashScan links, Arkiv wallet + sample query │
└───────────────────────────────────────────────────────────┘
```

Alignment: text left-aligned; the 3D scene is the only thing that breaks the grid.

Hero copy (editable):
- Headline: **One verified broker for every room.**
- Support: "Owners tokenise the right to rent a room. Brokers buy it. Tenants check it in seconds."
- Buttons: "List a property" and "Verify a room". Button text says what happens, with no arrows appended.

Mobile: the 3D scene sits under the headline at full width, capped at 60vh. The pinned scroll section turns into a vertical stack of chapters, each with a short looped clip or a still frame instead of a live scrubbed 3D canvas.

---

## 7. App screens (from the project doc)

Use the same tokens. Keep screens plain; the drama lives on the landing page.

### Shared components
- **Wallet chip:** address in mono, network badge ("Hedera testnet").
- **Status stamp:** a rectangular outlined stamp (2px border, slight rotation of 0°, no gimmick) with text `Available`, `Sold`, `Frozen`, `Expired`. Colors: available = ink, sold = brass, frozen/expired = alert.
- **Room card:** room name, period, price in USDC, status stamp, small isometric thumbnail of the room (from the same 3D scene, rendered once to an image).
- **Verification badge:** green check with "Verified broker" plus the truncated nullifier hash in mono.
- **Tx link:** every transaction ID links to HashScan.

### Owner
Verify (World ID) → Add property + deed upload → My properties (status) → Create listing (rooms, period, price per room) → Sales.
Submit stays visibly locked until World ID is validated by the backend (edge case from the doc), with the reason written under the button.

### Registrar
Pending queue (from Arkiv) → Application detail (deed viewer on left, owner details on right, Approve / Reject with a required reason) → Rooms table (freeze / unfreeze).

### Broker
Verify (World ID) → Marketplace → Room detail + Buy → My rooms (QR, "Prove I'm the holder").
Buy is disabled until verified, with a one-line prompt to verify.

### Tenant (mobile first)
Verify property (QR or ID) → per-room list: holder, valid until, badge → "Verify this broker" → full-screen green or red result.
This is the screen judges will see on a phone. Make it large, high-contrast, and readable in sunlight.

### State color map

| State | Visual |
|---|---|
| Available | Outlined room, ink stamp |
| Sold (valid) | Filled room, brass stamp, green verified badge |
| Frozen | Diagonal hatch over the room, alert stamp, "Frozen: under review" |
| Expired | Outline only, graphite text, "No valid holder" |
| Impostor | Full-width red result, short reason line |

---

## 8. Copy rules

- Plain words: "room", "broker", "check", "rights". Avoid "mint", "nullifier", "ERC-3643" in headings. They may appear in a small "How this works" detail section.
- Buttons say the action: "Buy room 2", "Approve property", "Verify this broker".
- Same verb across a flow: the button "Buy room 2" leads to a confirmation "Room 2 bought".
- Errors say what happened and what to do, with no apology:
  - "This identity is already linked to another wallet."
  - "Insufficient USDC. Add USDC to your wallet to buy this room."
  - "Associate USDC first." with a one-click fix button.
  - "Rooms already listed for part of this period."

---

## 9. Performance, accessibility, fallbacks

- **Mobile FPS:** cap `dpr` at `[1, 1.5]`, no shadows except `ContactShadows` at low resolution, skip postprocessing on mobile, 200-point particle cap.
- **Offscreen:** pause the timeline and set `frameloop="demand"` when the canvas is not visible.
- **Reduced motion:** if `prefers-reduced-motion: reduce`, do not autoplay. Show the scene at step 5 (the sale) as a static frame, with the step ticks still clickable to jump between frames.
- **Fallback:** if WebGL fails, show a pre-rendered poster image or a short MP4 of the loop. Record the loop once at the end of the build and keep it in `/public`.
- **Keyboard and screen reader:** all step ticks are buttons with labels ("Show step 4: verify the broker"). Captions live in a text region that updates with the step, and the canvas has an `aria-label` summarising the animation.
- **Contrast:** `--ink` on `--paper` passes AA. Check `--brass` and `--verified` only as shapes or with ink text, not as small text on `--paper`.
- **Focus:** visible 2px focus ring in `--ink`, offset by 2px.

---

## 10. File layout (inside the Next.js app)

```
/app
  /(marketing)/page.tsx          landing page
  /owner  /registrar  /broker  /verify/[propertyId]
/components
  /scene
    FlatScene.tsx                canvas, camera, lights
    Flat.tsx                     walls, floors, roof
    Room.tsx                     one room, takes index + status
    Coin.tsx                     brass token
    Pawns.tsx                    broker, tenant, impostor
    ProofSequence.tsx            section 5 animation
    timeline.ts                  GSAP master timeline + shared state object
  /ui
    StatusStamp.tsx  RoomCard.tsx  WalletChip.tsx  VerifyBadge.tsx  TitleBlock.tsx
/styles/tokens.css               CSS variables from section 2
/public/loop.mp4  /public/poster.jpg
```

---

## 11. Build order (so it fits a 36-hour plan)

The plan gives Person B the Next.js screens, IDKit, Arkiv, and the verify page. The landing animation is a bonus layer, so protect the must-build flow first.

1. **Hours 0–4:** pnpm workspace and lockfile committed, tokens.css, fonts, nav, empty pages. No 3D yet.
2. **During the product build (hours 4–28):** use plain, token-styled screens. Wire them to the real data.
3. **Slack time, about 3–4 hours total:** build the landing 3D loop in this order, stopping when time runs out:
   1. Static isometric flat with three tinted rooms.
   2. Coins rising and the ledger strip (steps 2–3).
   3. The sale animation (step 5), since it is the heart of the product.
   4. The proof sequence (step 4) and the tenant check (step 6).
   5. Expiry and loop (step 7), then the scroll-pinned version.
4. **Hours 28–32:** record `loop.mp4` and `poster.jpg` for the fallback and the demo video.

Cut first if short on time: scroll-pinned chapters, postprocessing, step-tick interaction, the dust effect.
Never cut: the tenant verify screen's green/red result, since it is a required demo moment for World.

---

## 12. Open items to confirm

- Whether the World selfie check or simulator exposes anything we can show beyond the nullifier (workshop, 5 Nov).
- Whether judges will see the app on a laptop or phone first. This changes how much of the landing page matters versus the tenant screen.
- Final room names and the sample property used in the demo, so the 3D flat matches the data (3 rooms, Jan–Mar 2027).