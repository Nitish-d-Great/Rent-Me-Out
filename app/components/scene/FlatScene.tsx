"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import { Suspense } from "react";
import * as THREE from "three";
import { Coin } from "./Coin";
import { Dust } from "./Dust";
import { Flat } from "./Flat";
import {
  BrokerPawn,
  ImpostorPawn,
  OwnerPawn,
  Payment,
  Phone,
} from "./Pawns";
import { ProofSequence } from "./ProofSequence";
import { sceneState } from "./timeline";

function CameraRig() {
  const { camera, size } = useThree();

  useFrame(() => {
    const baseZoom = Math.min(size.width / 13.6, size.height / 10.4);
    // Leave breathing room around the flat and its animated tokens so the full
    // illustration stays inside the hero's allocated frame on desktop and mobile.
    const frameScale = size.width < 720 ? 0.72 : 0.88;
    const drift = sceneState.drift;
    camera.position.set(11 + drift * 0.55, 10.4, 11 - drift * 0.35);
    camera.lookAt(0, 0.35, 0);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = baseZoom * sceneState.zoom * frameScale;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

function SceneContent() {
  const { size } = useThree();
  const mobile = size.width < 720;

  return (
    <>
      <CameraRig />
      <ambientLight intensity={1.55} />
      <directionalLight
        position={[7, 12, 8]}
        intensity={1.5}
        color="#FFFDF7"
      />
      <directionalLight
        position={[-6, 6, -4]}
        intensity={0.55}
        color="#DCE6EE"
      />
      <hemisphereLight args={["#FFFFFF", "#C8D2DB", 0.35]} />

      <Flat />
      <Coin index={0} />
      <Coin index={1} />
      <Coin index={2} />

      <OwnerPawn />
      <BrokerPawn />
      <ProofSequence />
      <Payment />
      <Phone />
      <ImpostorPawn />
      <Dust />

      <ContactShadows
        position={[0, 0.015, 0]}
        opacity={0.22}
        scale={15}
        blur={2.6}
        far={5}
        resolution={mobile ? 128 : 256}
        frames={1}
        color="#16233B"
      />
    </>
  );
}

export default function FlatScene({ offscreen = false }: { offscreen?: boolean }) {
  return (
    <Canvas
      className="scene-canvas"
      orthographic
      dpr={[1, 1.5]}
      camera={{ position: [11, 10.4, 11], zoom: 48, near: 0.1, far: 100 }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      }}
      frameloop={offscreen ? "demand" : "always"}
      aria-label="Animated isometric cutaway of a three-bedroom flat. One room becomes one token, a verified broker buys a room, and the right expires at the end date."
    >
      <Suspense fallback={null}>
        <SceneContent />
      </Suspense>
    </Canvas>
  );
}
