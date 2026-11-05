"use client";

import { useFrame } from "@react-three/fiber";
import { Edges, Html } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";
import { sceneState } from "./timeline";

const roomData = [
  {
    center: [-3.1, -2] as const,
    size: [3.7, 3.9] as const,
    tint: "#8CC3C9",
    label: "R1 · BEDROOM",
    drift: [-0.48, -0.48] as const,
  },
  {
    center: [3.1, -2] as const,
    size: [3.7, 3.9] as const,
    tint: "#F0B98A",
    label: "R2 · BEDROOM",
    drift: [0.48, -0.48] as const,
  },
  {
    center: [-3.1, 2] as const,
    size: [3.7, 3.9] as const,
    tint: "#B9A9E0",
    label: "R3 · BEDROOM",
    drift: [-0.48, 0.48] as const,
  },
];

export function Room({ index }: { index: number }) {
  const group = useRef<THREE.Group>(null);
  const floorMat = useRef<THREE.MeshStandardMaterial>(null);
  const topMat = useRef<THREE.MeshBasicMaterial>(null);
  const data = roomData[index];

  useFrame(() => {
    const groupRef = group.current;
    if (!groupRef) return;
    groupRef.position.x = data.center[0] + sceneState.explode * data.drift[0];
    groupRef.position.z = data.center[1] + sceneState.explode * data.drift[1];

    const fill =
      index === 1 ? sceneState.room2Fill : index === 2 ? 0.32 : 0.36;
    if (floorMat.current) {
      floorMat.current.opacity = 0.14 + fill * 0.62;
    }
    if (topMat.current) {
      topMat.current.opacity =
        index === 1 ? Math.max(0, fill - 0.14) * 0.34 : 0;
    }
  });

  return (
    <group ref={group} position={[data.center[0], 0, data.center[1]]}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.015} receiveShadow>
        <planeGeometry args={[data.size[0], data.size[1]]} />
        <meshStandardMaterial
          ref={floorMat}
          color={data.tint}
          transparent
          opacity={0.36}
          roughness={0.95}
        />
      </mesh>

      {index === 0 && <Bed position={[-0.82, 0, -0.6]} rotation={0} />}
      {index === 1 && <Bed position={[0.72, 0, -0.55]} rotation={Math.PI} />}
      {index === 2 && <Bed position={[-0.82, 0, 0.48]} rotation={Math.PI / 2} />}
      {index === 2 && (
        <mesh position={[0.9, 0.3, -1.05]}>
          <boxGeometry args={[0.56, 0.6, 0.9]} />
          <meshStandardMaterial color="#EEF1F4" roughness={0.9} />
          <Edges color="#16233b" />
        </mesh>
      )}

      <Html
        center
        position={[0, 0.035, 0]}
        zIndexRange={[2, 0]}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <span className="scene-room-label">{data.label}</span>
      </Html>

      <mesh position={[0, 0.006, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[data.size[0], data.size[1]]} />
        <meshBasicMaterial
          ref={topMat}
          color={data.tint}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function Bed({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: number;
}) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 0.13, 0]}>
        <boxGeometry args={[1.35, 0.22, 1.9]} />
        <meshStandardMaterial color="#F7F9FA" roughness={0.95} />
        <Edges color="rgba(22,35,59,0.55)" />
      </mesh>
      <mesh position={[0, 0.28, -0.62]}>
        <boxGeometry args={[1.18, 0.1, 0.38]} />
        <meshStandardMaterial color="#E4E9EE" roughness={1} />
        <Edges color="rgba(22,35,59,0.35)" />
      </mesh>
    </group>
  );
}
