"use client";

import { Billboard, Edges, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { sceneState } from "./timeline";

const labels = ["R1", "R2", "R3"];

export function Coin({ index }: { index: number }) {
  const group = useRef<THREE.Group>(null);
  const label = useRef<HTMLDivElement>(null);
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const rim = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(() => {
    const coin = sceneState.coins[index];
    if (!coin) return;
    if (group.current) {
      group.current.position.set(coin.x, coin.y, coin.z);
      group.current.scale.setScalar(Math.max(0.001, coin.scale));
      group.current.visible = coin.opacity > 0.01;
    }
    if (label.current) {
      label.current.style.opacity = String(coin.opacity);
    }
    if (material.current) {
      material.current.opacity = coin.opacity;
    }
    if (rim.current) {
      rim.current.opacity = coin.opacity;
    }
  });

  return (
    <group ref={group} position={[-3.1, 0.15, -2]}>
      <Billboard>
        <mesh rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.5, 0.5, 0.11, 56]} />
          <meshStandardMaterial
            ref={material}
            color="#C79A2B"
            metalness={0.78}
            roughness={0.29}
            transparent
            opacity={0}
          />
          <Edges color="rgba(22,35,59,0.42)" />
        </mesh>
        <mesh>
          <torusGeometry args={[0.5, 0.035, 10, 56]} />
          <meshStandardMaterial
            ref={rim}
            color="#E3BC54"
            metalness={0.85}
            roughness={0.22}
            transparent
            opacity={0}
          />
        </mesh>
        <mesh position-z={0.058}>
          <ringGeometry args={[0.24, 0.27, 40]} />
          <meshBasicMaterial color="#8C6914" transparent opacity={0.55} />
        </mesh>
        <mesh position-z={0.058}>
          <circleGeometry args={[0.09, 24]} />
          <meshBasicMaterial color="#8C6914" transparent opacity={0.35} />
        </mesh>
      </Billboard>

      <Html
        center
        position={[0, 0.86, 0]}
        zIndexRange={[6, 2]}
        style={{ pointerEvents: "none" }}
      >
        <div ref={label} className="coin-label">
          <span>{labels[index]}</span>
          <span className="mono">1 of 1</span>
        </div>
      </Html>
    </group>
  );
}
