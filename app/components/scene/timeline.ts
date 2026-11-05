import gsap from "gsap";

export const TOTAL_DURATION = 28;
export const STEP_DURATION = 4;
export const STEP_COUNT = 7;

export interface CoinSceneState {
  x: number;
  y: number;
  z: number;
  opacity: number;
  scale: number;
}

export interface SceneState {
  roofY: number;
  roofOpacity: number;
  wallFill: number;
  deed: number;
  stamp: number;
  explode: number;
  ledger: number;
  broker: number;
  proof: number;
  payment: number;
  room2Fill: number;
  verify: number;
  scan: number;
  impostor: number;
  dust: number;
  zoom: number;
  drift: number;
  coins: CoinSceneState[];
}

const ROOM_POSITIONS = [
  [-3.1, -2],
  [3.1, -2],
  [-3.1, 2],
];

export const LEDGER_POSITIONS = [
  [-2.45, 4.55],
  [0, 4.85],
  [2.45, 4.55],
];

export const sceneState: SceneState = {
  roofY: 2.85,
  roofOpacity: 0.48,
  wallFill: 0,
  deed: 0,
  stamp: 0,
  explode: 0,
  ledger: 0,
  broker: 0,
  proof: 0,
  payment: 0,
  room2Fill: 0.38,
  verify: 0,
  scan: 0,
  impostor: 0,
  dust: 0,
  zoom: 1,
  drift: 0,
  coins: ROOM_POSITIONS.map(([x, z]) => ({
    x,
    y: 0.15,
    z,
    opacity: 0,
    scale: 0.6,
  })),
};

function resetBase(state: SceneState) {
  state.roofY = 2.85;
  state.roofOpacity = 0.48;
  state.wallFill = 0;
  state.deed = 0;
  state.stamp = 0;
  state.explode = 0;
  state.ledger = 0;
  state.broker = 0;
  state.proof = 0;
  state.payment = 0;
  state.room2Fill = 0.38;
  state.verify = 0;
  state.scan = 0;
  state.impostor = 0;
  state.dust = 0;
  state.zoom = 1;
  state.drift = 0;
  state.coins.forEach((coin, index) => {
    coin.x = ROOM_POSITIONS[index][0];
    coin.y = 0.15;
    coin.z = ROOM_POSITIONS[index][1];
    coin.opacity = 0;
    coin.scale = 0.6;
  });
}

export function createLoop(onPhase: (phase: number) => void) {
  const state = sceneState;
  const tl = gsap.timeline({
    repeat: -1,
    defaults: { ease: "power2.out" },
  });

  tl.add(() => resetBase(state), 0);

  tl.to(state, { drift: 1, duration: TOTAL_DURATION, ease: "none" }, 0);

  /* 1 — registrar checks the deed */
  tl.to(state, { deed: 1, duration: 0.55, ease: "power2.out" }, 0.15);
  tl.to(state, { stamp: 1, duration: 0.32, ease: "power3.in" }, 1.15);
  tl.to(state, { wallFill: 1, duration: 1.25, ease: "power2.inOut" }, 1.35);
  tl.to(state, { deed: 0, duration: 0.4, ease: "power2.in" }, 3.5);

  /* 2 — roof lifts, one token per room */
  tl.to(
    state,
    { roofY: 7.2, roofOpacity: 0, duration: 1.2, ease: "power2.inOut" },
    4.05,
  );
  tl.to(state, { explode: 1, duration: 1.0, ease: "power2.inOut" }, 4.3);
  state.coins.forEach((coin, index) => {
    tl.to(
      coin,
      {
        opacity: 1,
        scale: 1,
        y: 2.15,
        duration: 0.8,
        ease: "back.out(1.6)",
      },
      4.45 + index * 0.16,
    );
  });

  /* 3 — settle to the ledger strip */
  tl.to(state, { explode: 0, duration: 0.7, ease: "power2.inOut" }, 8.0);
  state.coins.forEach((coin, index) => {
    tl.to(
      coin,
      {
        x: LEDGER_POSITIONS[index][0],
        z: LEDGER_POSITIONS[index][1],
        y: 0.72,
        duration: 1.0,
        ease: "power2.inOut",
      },
      8.0 + index * 0.09,
    );
  });
  tl.to(state, { ledger: 1, duration: 0.45 }, 8.45);

  /* 4 — broker verifies with World ID */
  tl.to(state, { broker: 1, duration: 1.0, ease: "power2.out" }, 12.0);
  tl.to(state, { proof: 1, duration: 2.7, ease: "none" }, 12.75);

  /* 5 — payment and token move together */
  tl.to(state, { payment: 1, duration: 1.75, ease: "power1.inOut" }, 17.0);
  tl.to(
    state.coins[1],
    {
      x: 2.95,
      z: 1.4,
      y: 1.5,
      duration: 1.45,
      ease: "power2.inOut",
    },
    17.15,
  );
  tl.to(
    state,
    { room2Fill: 1, duration: 0.9, ease: "power2.inOut" },
    18.15,
  );

  /* 6 — tenant checks the holder, impostor fails */
  tl.to(state, { verify: 1, duration: 0.5 }, 21.0);
  tl.to(state, { scan: 1, duration: 1.1 }, 21.25);
  tl.to(state, { impostor: 1, duration: 0.7 }, 22.6);

  /* 7 — expiry and reset */
  tl.to(state, { impostor: 0, duration: 0.35 }, 25.05);
  tl.to(state, { verify: 0, duration: 0.5 }, 25.15);
  tl.to(
    state,
    { room2Fill: 0.06, duration: 1.1, ease: "power2.in" },
    25.55,
  );
  tl.to(
    state.coins[1],
    { opacity: 0, scale: 0.15, duration: 0.9, ease: "power2.in" },
    25.55,
  );
  tl.to(state, { dust: 1, duration: 1.5, ease: "none" }, 25.55);
  tl.to(
    state,
    { zoom: 0.94, duration: 2.35, ease: "sine.inOut" },
    25.4,
  );

  tl.eventCallback("onUpdate", () => {
    onPhase(Math.min(STEP_COUNT - 1, Math.floor(tl.time() / STEP_DURATION)));
  });

  return tl;
}

export function timeForStep(step: number) {
  return Math.min(TOTAL_DURATION - 0.4, step * STEP_DURATION + 0.25);
}
