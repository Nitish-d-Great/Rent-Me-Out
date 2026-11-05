"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { sceneState } from "./timeline";

const COUNT = 180;

export function Dust() {
  const points = useRef<THREE.Points>(null);
  const material = useRef<THREE.PointsMaterial>(null);

  const seeds = useMemo(() => {
    const values = new Float32Array(COUNT * 3);
    let seed = 19;
    for (let i = 0; i < COUNT; i += 1) {
      seed = (seed * 16807) % 2147483647;
      values[i * 3] = (seed / 2147483647 - 0.5) * 0.55;
      seed = (seed * 16807) % 2147483647;
      values[i * 3 + 1] = (seed / 2147483647 - 0.2) * 0.6;
      seed = (seed * 16807) % 2147483647;
      values[i * 3 + 2] = (seed / 2147483647 - 0.5) * 0.55;
    }
    return values;
  }, []);

  const positions = useMemo(() => new Float32Array(seeds), [seeds]);

  useFrame(() => {
    const p = sceneState.dust;
    if (points.current) {
      points.current.visible = p > 0.005;
      const attribute = points.current.geometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute;
      for (let i = 0; i < COUNT; i += 1) {
        const j = i * 3;
        positions[j] = seeds[j] * (1 + p * 1.4);
        positions[j + 1] = seeds[j + 1] + p * p * 1.9;
        positions[j + 2] = seeds[j + 2] * (1 + p * 1.4);
      }
      attribute.needsUpdate = true;
    }
    if (material.current) {
      material.current.opacity =
        p < 0.1 ? p * 6 : Math.max(0, 1 - (p - 0.1) * 1.18);
    }
  });

  return (
    <points ref={points} position={[2.95, 1.5, 1.4]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={material}
        color="#C79A2B"
        size={0.055}
        transparent
        opacity={0}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
