"use client";

import { Billboard, Float, Html, Line, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { sceneState } from "./timeline";

function Pawn({
  color,
  accent,
  head = 1.12,
}: {
  color: string;
  accent: string;
  head?: number;
}) {
  return (
    <group>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.26, 0.3, 0.09, 24]} />
        <meshStandardMaterial color={accent} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.58, 0]}>
        <capsuleGeometry args={[0.2, 0.58, 6, 18]} />
        <meshStandardMaterial color={color} roughness={0.72} />
      </mesh>
      <mesh position={[0, head, 0]}>
        <sphereGeometry args={[0.235, 24, 24]} />
        <meshStandardMaterial color={color} roughness={0.64} />
      </mesh>
      <mesh position={[0, head + 0.02, 0.205]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial color="#EEF1F4" />
      </mesh>
    </group>
  );
}

function HtmlTag({
  text,
  opacity,
  position = [0, 1.7, 0],
  variant,
}: {
  text: string;
  opacity: () => number;
  position?: [number, number, number];
  variant?: "alert" | "brass";
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useFrame(() => {
    if (ref.current) {
      ref.current.style.opacity = String(Math.max(0, Math.min(1, opacity())));
    }
  });

  return (
    <Html center position={position} zIndexRange={[3, 1]} style={{ pointerEvents: "none" }}>
      <span
        ref={ref}
        className={`scene-tiny-label${variant ? ` scene-tiny-label--${variant}` : ""}`}
      >
        {text}
      </span>
    </Html>
  );
}

export function BrokerPawn() {
  const group = useRef<THREE.Group>(null);

  useFrame(() => {
    const progress = sceneState.broker;
    if (!group.current) return;
    group.current.visible = progress > 0.01;
    group.current.position.x = THREE.MathUtils.lerp(6.8, 2.95, progress);
    group.current.position.z = THREE.MathUtils.lerp(6.5, 1.55, progress);
    group.current.position.y = Math.sin(progress * Math.PI) * 0.12;
    group.current.scale.setScalar(0.92);
  });

  return (
    <group ref={group} position={[6.8, 0, 6.5]}>
      <Pawn color="#2B3D5E" accent="#C79A2B" />
      <Billboard position={[0, 1.62, 0]}>
        <mesh>
          <ringGeometry args={[0.32, 0.345, 36]} />
          <meshBasicMaterial color="#1E9E6A" transparent opacity={0.5} />
        </mesh>
      </Billboard>
      <HtmlTag text="VERIFIED BROKER" opacity={() => sceneState.proof * 0.9} />
    </group>
  );
}

export function OwnerPawn() {
  return (
    <group position={[-5.95, 0, 4.75]} scale={0.88}>
      <Pawn color="#16233B" accent="#7B8794" head={1.06} />
      <HtmlTag text="OWNER" opacity={() => 0.82} position={[0, 1.62, 0]} />
    </group>
  );
}

export function ImpostorPawn() {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Group>(null);

  useFrame(() => {
    const progress = sceneState.impostor;
    if (!group.current) return;
    group.current.visible = progress > 0.01;
    group.current.position.x = THREE.MathUtils.lerp(7.1, 4.75, progress);
    group.current.position.z = THREE.MathUtils.lerp(6.8, 4.65, progress);
    group.current.scale.setScalar(0.88);
    if (ring.current) {
      ring.current.rotation.z += 0.012;
      ring.current.scale.setScalar(0.9 + Math.sin(progress * Math.PI) * 0.08);
    }
  });

  return (
    <group ref={group} position={[7.1, 0, 6.8]}>
      <Pawn color="#8F3A48" accent="#D4465A" />
      <group ref={ring} position={[0, 1.14, 0]}>
        <Billboard>
          <mesh>
            <ringGeometry args={[0.4, 0.435, 40]} />
            <meshBasicMaterial color="#D4465A" transparent opacity={0.92} />
          </mesh>
        </Billboard>
      </group>
      <HtmlTag
        text="NO MATCH"
        opacity={() => sceneState.impostor}
        variant="alert"
        position={[0, 1.72, 0]}
      />
    </group>
  );
}

export function Phone() {
  const group = useRef<THREE.Group>(null);
  const screen = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(() => {
    const progress = sceneState.verify;
    if (!group.current) return;
    group.current.visible = progress > 0.01;
    group.current.scale.setScalar(0.001 + progress * 0.95);
    if (screen.current) {
      screen.current.opacity = 0.38 + sceneState.scan * 0.5;
    }
  });

  return (
    <group ref={group} position={[4.65, 0.74, 4.15]}>
      <Float speed={1.5} rotationIntensity={0.18} floatIntensity={0.22}>
        <group rotation={[0.1, -0.42, -0.08]}>
          <RoundedBox args={[0.44, 0.86, 0.07]} radius={0.055} smoothness={4}>
            <meshStandardMaterial color="#16233B" roughness={0.4} />
          </RoundedBox>
          <mesh position-z={0.041}>
            <planeGeometry args={[0.36, 0.7]} />
            <meshBasicMaterial
              ref={screen}
              color="#8CC3C9"
              transparent
              opacity={0.6}
            />
          </mesh>
          <mesh position={[0, 0.02, 0.044]}>
            <planeGeometry args={[0.16, 0.16]} />
            <meshBasicMaterial color="#EEF1F4" transparent opacity={0.82} />
          </mesh>
        </group>
      </Float>
      <HtmlTag
        text="CHECK HOLDER"
        opacity={() => sceneState.verify * 0.9}
        position={[0, 0.95, 0]}
      />
    </group>
  );
}

export function Payment() {
  const group = useRef<THREE.Group>(null);
  const usdc = useRef<THREE.Group>(null);

  useFrame(() => {
    const progress = sceneState.payment;
    if (group.current) {
      group.current.visible = progress > 0.01;
    }
    if (usdc.current) {
      const x = THREE.MathUtils.lerp(2.95, -5.9, progress);
      const z = THREE.MathUtils.lerp(1.55, 4.7, progress);
      const y = 1.55 + Math.sin(progress * Math.PI) * 1.05;
      usdc.current.position.set(x, y, z);
      usdc.current.rotation.z += 0.03;
    }
  });

  return (
    <group ref={group} visible={false}>
      <Line
        points={[
          [2.95, 1.55, 1.55],
          [-1.4, 2.75, 3.25],
          [-5.9, 1.55, 4.7],
        ]}
        color="#C79A2B"
        lineWidth={1.2}
        dashed
        dashSize={0.14}
        gapSize={0.11}
        transparent
        opacity={0.62}
      />
      <group ref={usdc} position={[2.95, 1.55, 1.55]}>
        <mesh>
          <sphereGeometry args={[0.12, 20, 20]} />
          <meshStandardMaterial
            color="#C79A2B"
            metalness={0.7}
            roughness={0.3}
          />
        </mesh>
        <HtmlTag
          text="980 USDC"
          opacity={() =>
            sceneState.payment > 0.02 && sceneState.payment < 0.98 ? 0.92 : 0
          }
          variant="brass"
          position={[0, 0.3, 0]}
        />
      </group>
    </group>
  );
}
