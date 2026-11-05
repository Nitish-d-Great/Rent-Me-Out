"use client";

import { Billboard, Edges, Html, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { LEDGER_POSITIONS, sceneState } from "./timeline";
import { Room } from "./Room";

type Segment = {
  a: [number, number];
  b: [number, number];
  thickness?: number;
};

const exterior: Segment[] = [
  { a: [-5, -4], b: [5, -4], thickness: 0.2 },
  { a: [-5, 4], b: [2.5, 4], thickness: 0.2 },
  { a: [3.5, 4], b: [5, 4], thickness: 0.2 },
  { a: [-5, -4], b: [-5, 4], thickness: 0.2 },
  { a: [5, -4], b: [5, 4], thickness: 0.2 },
];

const interior: Segment[] = [
  { a: [-5, 0], b: [-1.2, 0] },
  { a: [1.2, 0], b: [5, 0] },
  { a: [-1.2, -4], b: [-1.2, -2.2] },
  { a: [-1.2, -1.2], b: [-1.2, 4] },
  { a: [1.2, -4], b: [1.2, -2.2] },
  { a: [1.2, -1.2], b: [1.2, 2.8] },
  { a: [1.2, 3.8], b: [1.2, 4] },
];

const roomAnchors: Array<[number, number]> = [
  [-3.1, -2],
  [3.1, -2],
  [-3.1, 2],
];

export function Flat() {
  const wallGroup = useRef<THREE.Group>(null);
  const roof = useRef<THREE.Group>(null);
  const roofMat = useRef<THREE.MeshStandardMaterial>(null);
  const deedGroup = useRef<THREE.Group>(null);
  const deedMat = useRef<THREE.MeshBasicMaterial>(null);
  const stamp = useRef<THREE.Group>(null);
  const ledger = useRef<THREE.Group>(null);
  const ledgerMat = useRef<THREE.MeshStandardMaterial>(null);
  const ledgerLabel = useRef<HTMLDivElement>(null);
  const links = useRef<THREE.Group>(null);
  const deedLabel = useRef<HTMLDivElement>(null);

  useFrame(() => {
    if (wallGroup.current) {
      wallGroup.current.scale.y = 0.02 + sceneState.wallFill * 0.98;
    }
    if (roof.current) {
      roof.current.position.y = sceneState.roofY;
    }
    if (roofMat.current) {
      roofMat.current.opacity = sceneState.roofOpacity;
    }
    if (deedGroup.current) {
      const visible = sceneState.deed > 0.005;
      deedGroup.current.visible = visible;
      deedGroup.current.position.y = 0.3 + sceneState.deed * 1.55;
      deedGroup.current.rotation.z = (1 - sceneState.deed) * -0.08;
    }
    if (deedMat.current) {
      deedMat.current.opacity = sceneState.deed;
    }
    if (deedLabel.current) {
      deedLabel.current.style.opacity = String(sceneState.deed);
    }
    if (stamp.current) {
      const value = Math.max(0.001, sceneState.stamp);
      stamp.current.visible = sceneState.stamp > 0.01;
      stamp.current.scale.setScalar(value);
    }
    if (ledger.current) {
      ledger.current.visible = sceneState.ledger > 0.02;
    }
    if (ledgerMat.current) {
      ledgerMat.current.opacity = sceneState.ledger;
    }
    if (ledgerLabel.current) {
      ledgerLabel.current.style.opacity = String(sceneState.ledger);
    }
    if (links.current) {
      links.current.visible = sceneState.ledger > 0.15;
    }
  });

  return (
    <group>
      {/* drawing sheet base */}
      <mesh position={[0, -0.11, 0]} receiveShadow>
        <boxGeometry args={[10.45, 0.18, 8.45]} />
        <meshStandardMaterial color="#E2E7EC" roughness={1} />
        <Edges color="rgba(22,35,59,0.6)" />
      </mesh>

      <mesh position={[0, -0.015, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[10.1, 8.1]} />
        <meshStandardMaterial color="#F5F7F9" roughness={1} />
      </mesh>

      <Room index={0} />
      <Room index={1} />
      <Room index={2} />

      {/* hall + kitchen floor */}
      <mesh position={[3.1, 0.012, 2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[3.7, 3.9]} />
        <meshStandardMaterial color="#E7ECF0" roughness={1} />
      </mesh>

      {/* kitchen counter */}
      <group position={[3.4, 0, 3.15]}>
        <mesh position={[0, 0.42, 0]}>
          <boxGeometry args={[2.6, 0.84, 0.62]} />
          <meshStandardMaterial color="#DCE3E8" roughness={0.9} />
          <Edges color="rgba(22,35,59,0.55)" />
        </mesh>
        <mesh position={[0, 0.87, 0]}>
          <boxGeometry args={[2.7, 0.07, 0.68]} />
          <meshStandardMaterial color="#EEF1F4" roughness={0.8} />
          <Edges color="rgba(22,35,59,0.4)" />
        </mesh>
        <mesh position={[-0.62, 0.91, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.03, 24]} />
          <meshStandardMaterial color="#9AA7B3" metalness={0.5} roughness={0.4} />
        </mesh>
      </group>

      {/* corridor / hall linework */}
      <mesh position={[0, 0.012, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[2.35, 7.9]} />
        <meshStandardMaterial color="#EDF0F3" roughness={1} />
      </mesh>

      <group ref={wallGroup}>
        {exterior.map((segment, index) => (
          <Wall key={`e-${index}`} segment={segment} />
        ))}
        {interior.map((segment, index) => (
          <Wall key={`i-${index}`} segment={segment} />
        ))}
      </group>

      {/* thin door thresholds */}
      <mesh position={[2.98, 0.018, 4]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.95, 0.2]} />
        <meshBasicMaterial color="#C79A2B" transparent opacity={0.5} />
      </mesh>

      {/* roof */}
      <group ref={roof} position={[0, 2.85, 0]}>
        <mesh>
          <boxGeometry args={[10.3, 0.08, 8.3]} />
          <meshStandardMaterial
            ref={roofMat}
            color="#EEF1F4"
            transparent
            opacity={0.48}
            roughness={1}
          />
          <Edges color="rgba(22,35,59,0.7)" />
        </mesh>
        <mesh position={[0, 0.045, 0]}>
          <planeGeometry args={[9.9, 7.9]} />
          <meshBasicMaterial color="#F7F9FA" transparent opacity={0.22} />
        </mesh>
      </group>

      {/* ledger strip */}
      <group ref={ledger} position={[0, 0, 0]}>
        <mesh position={[0, 0.035, 4.88]}>
          <boxGeometry args={[7.5, 0.06, 1.45]} />
          <meshStandardMaterial
            ref={ledgerMat}
            color="#F5F7F9"
            transparent
            opacity={1}
            roughness={1}
          />
          <Edges color="rgba(22,35,59,0.65)" />
        </mesh>
        <Html
          center
          position={[0, 0.1, 5.55]}
          zIndexRange={[3, 1]}
          style={{ pointerEvents: "none" }}
        >
          <div ref={ledgerLabel} className="ledger-caption">
            Jan – Mar 2027 · 850 / 980 / 820 USDC
          </div>
        </Html>
      </group>

      <group ref={links}>
        {roomAnchors.map((anchor, index) => (
          <Line
            key={index}
            points={[
              [anchor[0], 0.06, anchor[1]],
              [LEDGER_POSITIONS[index][0], 0.07, LEDGER_POSITIONS[index][1]],
            ]}
            color="#7B8794"
            lineWidth={0.8}
            dashed
            dashSize={0.12}
            gapSize={0.12}
            transparent
            opacity={0.42}
          />
        ))}
      </group>

      {/* deed + registrar stamp */}
      <Billboard position={[0.6, 0, 5.0]}>
        <group ref={deedGroup} position={[0, 0.3, 0]}>
          <mesh>
            <planeGeometry args={[2.7, 1.75]} />
            <meshBasicMaterial
              ref={deedMat}
              color="#F7F9FA"
              transparent
              opacity={0}
              side={THREE.DoubleSide}
            />
            <Edges color="rgba(22,35,59,0.72)" />
          </mesh>
          <Html
            center
            position={[0, 0.03, 0.02]}
            zIndexRange={[4, 2]}
            style={{ pointerEvents: "none", width: 164 }}
          >
            <div ref={deedLabel} className="deed-sheet">
              <span className="deed-sheet__kicker">Deed · Ashoka Residency</span>
              <strong>Declaration of rental rights</strong>
              <span className="deed-sheet__line" />
              <span className="deed-sheet__line deed-sheet__line--short" />
              <span className="deed-sheet__line" />
              <span className="deed-sheet__meta">14 pages · encrypted</span>
            </div>
          </Html>
          <group ref={stamp} position={[0.62, -0.48, 0.04]} scale={0.001}>
            <mesh>
              <ringGeometry args={[0.28, 0.36, 32]} />
              <meshBasicMaterial color="#C79A2B" transparent opacity={0.95} />
            </mesh>
            <mesh>
              <ringGeometry args={[0.18, 0.21, 32]} />
              <meshBasicMaterial color="#C79A2B" transparent opacity={0.7} />
            </mesh>
            <Html center zIndexRange={[5, 3]} style={{ pointerEvents: "none" }}>
              <span className="stamp-word">REGISTRAR</span>
            </Html>
          </group>
        </group>
      </Billboard>
    </group>
  );
}

function Wall({ segment }: { segment: Segment }) {
  const { a, b, thickness = 0.16 } = segment;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  const angle = -Math.atan2(dz, dx);
  const height = 2.5;

  return (
    <mesh
      position={[(a[0] + b[0]) / 2, height / 2, (a[1] + b[1]) / 2]}
      rotation-y={angle}
    >
      <boxGeometry args={[length, height, thickness]} />
      <meshStandardMaterial color="#E8EDF1" roughness={0.95} />
      <Edges color="#16233b" lineWidth={0.8} />
    </mesh>
  );
}
