"use client";

import { Billboard, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { sceneState } from "./timeline";

const PARTICLE_COUNT = 90;

export function ProofSequence() {
  const group = useRef<THREE.Group>(null);
  const scanRing = useRef<THREE.Mesh>(null);
  const scanMat = useRef<THREE.MeshBasicMaterial>(null);
  const matchRing = useRef<THREE.Mesh>(null);
  const matchMat = useRef<THREE.MeshBasicMaterial>(null);
  const hex = useRef<THREE.Mesh>(null);
  const hexMat = useRef<THREE.MeshBasicMaterial>(null);
  const points = useRef<THREE.Points>(null);
  const pointMat = useRef<THREE.PointsMaterial>(null);
  const chip = useRef<HTMLDivElement>(null);
  const chipWrap = useRef<HTMLDivElement>(null);

  const directions = useMemo(() => {
    const values: number[] = [];
    let seed = 7;
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      seed = (seed * 16807) % 2147483647;
      const u = seed / 2147483647;
      seed = (seed * 16807) % 2147483647;
      const v = seed / 2147483647;
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      values.push(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi) * 0.82,
        Math.sin(phi) * Math.sin(theta),
      );
    }
    return values;
  }, []);

  const positions = useMemo(() => new Float32Array(PARTICLE_COUNT * 3), []);

  useFrame(() => {
    const p = sceneState.proof;
    if (!group.current) return;
    group.current.visible = p > 0.005;

    const scanPhase = Math.min(1, p / 0.32);
    if (scanRing.current) {
      scanRing.current.scale.setScalar(
        THREE.MathUtils.lerp(1.75, 0.62, easeOutCubic(scanPhase)),
      );
      scanRing.current.visible = p < 0.54;
    }
    if (scanMat.current) {
      scanMat.current.opacity = p < 0.54 ? 0.85 : 0;
      scanMat.current.color.set(p > 0.22 ? "#C79A2B" : "#16233B");
    }

    if (matchRing.current) {
      const matchProgress = THREE.MathUtils.clamp((p - 0.72) / 0.26, 0, 1);
      matchRing.current.visible = matchProgress > 0.01;
      matchRing.current.scale.setScalar(
        THREE.MathUtils.lerp(1.9, 0.8, easeOutCubic(matchProgress)),
      );
    }
    if (matchMat.current) {
      matchMat.current.opacity = THREE.MathUtils.clamp((p - 0.72) * 4, 0, 0.95);
      matchMat.current.color.set("#1E9E6A");
    }

    if (hex.current) {
      const hexProgress = THREE.MathUtils.clamp((p - 0.35) / 0.28, 0, 1);
      hex.current.scale.setScalar(0.001 + hexProgress * 0.72);
      hex.current.rotation.z += 0.005;
    }
    if (hexMat.current) {
      hexMat.current.opacity = THREE.MathUtils.clamp((p - 0.35) * 4, 0, 0.9);
    }

    if (points.current) {
      const attribute = points.current.geometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute;
      const collapse = THREE.MathUtils.clamp((p - 0.18) / 0.5, 0, 1);
      const radius = THREE.MathUtils.lerp(0.62, 0.14, easeInOut(collapse));
      for (let i = 0; i < PARTICLE_COUNT; i += 1) {
        const j = i * 3;
        positions[j] = directions[j] * radius;
        positions[j + 1] = directions[j + 1] * radius;
        positions[j + 2] = directions[j + 2] * radius;
      }
      attribute.needsUpdate = true;
    }
    if (pointMat.current) {
      pointMat.current.opacity =
        THREE.MathUtils.clamp((p - 0.05) * 5, 0, 0.78) *
        (1 - THREE.MathUtils.clamp((p - 0.82) / 0.18, 0, 0.7));
    }

    if (chip.current) {
      chip.current.style.opacity = String(
        THREE.MathUtils.clamp((p - 0.48) / 0.2, 0, 1),
      );
    }
    if (chipWrap.current) {
      chipWrap.current.style.transform = `translateY(${THREE.MathUtils.lerp(10, 0, THREE.MathUtils.clamp((p - 0.48) / 0.25, 0, 1))}px)`;
    }
  });

  return (
    <group ref={group} position={[2.95, 1.55, 1.55]} visible={false}>
      <Billboard>
        <mesh ref={scanRing}>
          <ringGeometry args={[0.58, 0.61, 64]} />
          <meshBasicMaterial
            ref={scanMat}
            color="#16233B"
            transparent
            opacity={0.85}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh ref={matchRing} visible={false}>
          <ringGeometry args={[0.55, 0.59, 64]} />
          <meshBasicMaterial
            ref={matchMat}
            color="#1E9E6A"
            transparent
            opacity={0}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh ref={hex} visible={false}>
          <circleGeometry args={[0.16, 6]} />
          <meshBasicMaterial
            ref={hexMat}
            color="#C79A2B"
            transparent
            opacity={0}
            side={THREE.DoubleSide}
          />
        </mesh>
        <points ref={points}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[positions, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            ref={pointMat}
            color="#C79A2B"
            size={0.035}
            transparent
            opacity={0}
            depthWrite={false}
            sizeAttenuation
          />
        </points>
      </Billboard>

      <Html
        center
        position={[0, 1.02, 0]}
        zIndexRange={[6, 3]}
        style={{ pointerEvents: "none" }}
      >
        <div ref={chipWrap} className="proof-chip">
          <div ref={chip} className="proof-chip__inner">
            <span className="micro dim">nullifier</span>
            <span className="mono">0x7a3f…c91e</span>
            <span className="micro proof-chip__note">
              Same person, same ID. Cannot be traced back.
            </span>
          </div>
        </div>
      </Html>
    </group>
  );
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function easeInOut(value: number) {
  return value < 0.5
    ? 2 * value * value
    : 1 - Math.pow(-2 * value + 2, 2) / 2;
}
