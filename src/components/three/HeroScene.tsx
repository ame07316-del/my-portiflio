"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { orbFragment, orbVertex } from "./shaders";

/** Deterministic PRNG — keeps the render pure and the scene identical on every mount. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Orb({ accent, accent2 }: { accent: string; accent2: string }) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.ShaderMaterial>(null);
  const { size } = useThree();
  const detail = size.width < 768 ? 48 : 128;

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmp: { value: 0.34 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uColorA: { value: new THREE.Color(accent) },
      uColorB: { value: new THREE.Color(accent2) },
    }),
    [accent, accent2],
  );

  useFrame((state, delta) => {
    const u = mat.current?.uniforms;
    if (!u) return;
    u.uTime.value = state.clock.elapsedTime;
    u.uMouse.value.lerp(
      new THREE.Vector2(state.pointer.x, state.pointer.y),
      0.05,
    );
    if (mesh.current) {
      mesh.current.rotation.y += delta * 0.08;
      mesh.current.rotation.x = state.pointer.y * 0.15;
      mesh.current.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.12;
    }
  });

  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[1.55, detail > 64 ? 48 : 24]} />
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={orbVertex}
        fragmentShader={orbFragment}
        transparent
      />
    </mesh>
  );
}

function Dust({ accent }: { accent: string }) {
  const ref = useRef<THREE.Points>(null);
  const { positions, sizes } = useMemo(() => {
    const n = 900;
    const rand = mulberry32(20250908);
    const positions = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = 2.4 + rand() * 4.5;
      const th = rand() * Math.PI * 2;
      const ph = Math.acos(2 * rand() - 1);
      positions[i * 3] = Math.sin(ph) * Math.cos(th) * r;
      positions[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * r * 0.6;
      positions[i * 3 + 2] = Math.cos(ph) * r;
      sizes[i] = rand();
    }
    return { positions, sizes };
  }, []);

  useFrame((state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * 0.05;
    ref.current.rotation.x =
      Math.sin(state.clock.elapsedTime * 0.12) * 0.12 + state.pointer.y * 0.06;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aRnd" args={[sizes, 1]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        color={accent}
        transparent
        opacity={0.75}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function Rings({ accent2 }: { accent2: string }) {
  const g = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (!g.current) return;
    g.current.rotation.z += delta * 0.12;
    g.current.rotation.x = 0.4 + state.pointer.y * 0.12;
    g.current.rotation.y = state.pointer.x * 0.2;
  });
  return (
    <group ref={g}>
      {[2.5, 3.1, 3.9].map((r, i) => (
        <mesh key={r} rotation={[Math.PI / 2 + i * 0.22, i * 0.3, 0]}>
          <torusGeometry args={[r, 0.004, 8, 160]} />
          <meshBasicMaterial
            color={i % 2 ? accent2 : "#ffffff"}
            transparent
            opacity={0.35 - i * 0.07}
          />
        </mesh>
      ))}
    </group>
  );
}

export default function HeroScene({
  accent = "#22d3ee",
  accent2 = "#a855f7",
}: {
  accent?: string;
  accent2?: string;
}) {
  return (
    <Canvas
      className="!absolute inset-0"
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 5.2], fov: 50 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    >
      <ambientLight intensity={0.6} />
      <pointLight position={[4, 4, 4]} intensity={30} color={accent} />
      <pointLight position={[-4, -2, 2]} intensity={20} color={accent2} />
      <Orb accent={accent} accent2={accent2} />
      <Dust accent={accent} />
      <Rings accent2={accent2} />
    </Canvas>
  );
}
