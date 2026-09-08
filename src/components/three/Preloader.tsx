"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { AnimatePresence, motion } from "motion/react";
import { particleFragment, particleVertex } from "./shaders";

/* ------------------------------------------------------------------ */
/*  Geometry targets                                                   */
/* ------------------------------------------------------------------ */

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

function buildAttributes(count: number) {
  const rand = mulberry32(1337 + count);
  const sphere = new Float32Array(count * 3);
  const knot = new Float32Array(count * 3);
  const grid = new Float32Array(count * 3);
  const rnd = new Float32Array(count);

  const knotGeo = new THREE.TorusKnotGeometry(2.1, 0.62, 260, 32, 2, 3);
  const knotPos = knotGeo.attributes.position.array as ArrayLike<number>;
  const knotCount = knotPos.length / 3;

  const cols = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    // fibonacci sphere
    const k = i + 0.5;
    const phi = Math.acos(1 - (2 * k) / count);
    const theta = Math.PI * (1 + Math.sqrt(5)) * k;
    const r = 2.6 + rand() * 0.12;
    sphere[i * 3] = Math.cos(theta) * Math.sin(phi) * r;
    sphere[i * 3 + 1] = Math.sin(theta) * Math.sin(phi) * r;
    sphere[i * 3 + 2] = Math.cos(phi) * r;

    // torus knot sample
    const j = (i % knotCount) * 3;
    knot[i * 3] = knotPos[j] + (rand() - 0.5) * 0.06;
    knot[i * 3 + 1] = knotPos[j + 1] + (rand() - 0.5) * 0.06;
    knot[i * 3 + 2] = knotPos[j + 2] + (rand() - 0.5) * 0.06;

    // rippled grid plane
    const gx = (i % cols) / (cols - 1) - 0.5;
    const gy = Math.floor(i / cols) / (cols - 1) - 0.5;
    grid[i * 3] = gx * 9.5;
    grid[i * 3 + 1] = gy * 5.6;
    grid[i * 3 + 2] =
      Math.sin(gx * 9) * 0.35 + Math.cos(gy * 7) * 0.35 - 0.4;

    rnd[i] = rand();
  }
  knotGeo.dispose();
  return { sphere, knot, grid, rnd };
}

/* ------------------------------------------------------------------ */
/*  Particle system                                                    */
/* ------------------------------------------------------------------ */

function Particles({
  progress,
  exiting,
}: {
  progress: React.RefObject<number>;
  exiting: React.RefObject<boolean>;
}) {
  const { viewport, size } = useThree();
  const isMobile = size.width < 768;
  const count = isMobile ? 6000 : 16000;
  const attrs = useMemo(() => buildAttributes(count), [count]);
  const points = useRef<THREE.Points>(null);
  const mat = useRef<THREE.ShaderMaterial>(null);
  const burst = useRef(0);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uBurst: { value: 0 },
      uSize: { value: isMobile ? 5.5 : 6.5 },
      uPixelRatio: { value: Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio : 1) },
      uColorA: { value: new THREE.Color("#22d3ee") },
      uColorB: { value: new THREE.Color("#a855f7") },
      uOpacity: { value: 1 },
    }),
    [isMobile],
  );

  useFrame((state, delta) => {
    const u = mat.current?.uniforms;
    if (!u) return;
    u.uTime.value = state.clock.elapsedTime;
    u.uProgress.value += (progress.current / 100 - u.uProgress.value) * 0.06;
    if (exiting.current) burst.current += delta * 0.75;
    u.uBurst.value = burst.current;
    u.uOpacity.value = Math.max(0, 1 - burst.current * 1.35);

    if (points.current) {
      points.current.rotation.y += delta * 0.06;
      points.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.15) * 0.08;
      const s = 1 + burst.current * 0.15;
      points.current.scale.setScalar(s * Math.min(1, viewport.width / 8 + 0.55));
    }
  });

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[attrs.sphere, 3]}
        />
        <bufferAttribute attach="attributes-aSphere" args={[attrs.sphere, 3]} />
        <bufferAttribute attach="attributes-aKnot" args={[attrs.knot, 3]} />
        <bufferAttribute attach="attributes-aGrid" args={[attrs.grid, 3]} />
        <bufferAttribute attach="attributes-aRnd" args={[attrs.rnd, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={particleVertex}
        fragmentShader={particleFragment}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function Core({ exiting }: { exiting: React.RefObject<boolean> }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (!group.current) return;
    group.current.rotation.x += delta * 0.35;
    group.current.rotation.y += delta * 0.5;
    const s = exiting.current
      ? Math.max(0, group.current.scale.x - delta * 3)
      : 1 + Math.sin(state.clock.elapsedTime * 2) * 0.05;
    group.current.scale.setScalar(s);
  });
  return (
    <group ref={group}>
      <mesh>
        <icosahedronGeometry args={[0.85, 1]} />
        <meshBasicMaterial wireframe color="#7dd3fc" transparent opacity={0.5} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.6, 0.006, 8, 120]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.7} />
      </mesh>
      <mesh rotation={[0, Math.PI / 3, Math.PI / 4]}>
        <torusGeometry args={[2.05, 0.005, 8, 120]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Scrambling text                                                    */
/* ------------------------------------------------------------------ */

const GLYPHS = "アイウエオカキクケコサシスセソ01<>/\\{}[]#$%&*+-";

function Scramble({ text }: { text: string }) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    let frame = 0;
    let raf = 0;
    const target = text;
    const tick = () => {
      frame++;
      const revealed = Math.floor(frame / 2);
      setOut(
        target
          .split("")
          .map((ch, i) =>
            i < revealed || ch === " "
              ? ch
              : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
          )
          .join(""),
      );
      if (revealed <= target.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text]);
  return <span>{out}</span>;
}

/* ------------------------------------------------------------------ */
/*  Preloader                                                          */
/* ------------------------------------------------------------------ */

export default function Preloader({
  phases,
  enterLabel,
  hint,
  brandMark = "</>",
}: {
  phases: string[];
  enterLabel: string;
  hint: string;
  brandMark?: string;
}) {
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [gone, setGone] = useState(false);
  const [exitingState, setExitingState] = useState(false);
  const progressRef = useRef(0);
  const exitingRef = useRef(false);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    document.body.classList.add("is-locked");
    let raf = 0;
    let value = 0;
    let loaded = false;
    const onLoad = () => (loaded = true);
    if (document.readyState === "complete") loaded = true;
    else window.addEventListener("load", onLoad);

    const tick = () => {
      const ceiling = loaded ? 100 : 92;
      const speed = value < 60 ? 0.85 : value < 88 ? 0.42 : 0.22;
      value = Math.min(ceiling, value + Math.random() * speed + 0.25);
      setProgress(value);
      if (value >= 100) {
        setReady(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("load", onLoad);
    };
  }, []);

  const finish = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setExitingState(true);
    document.body.classList.remove("is-locked");
    window.dispatchEvent(new CustomEvent("pf:entered"));
    setTimeout(() => setGone(true), 1250);
  }, []);

  // auto-enter shortly after reaching 100%
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(finish, 900);
    return () => clearTimeout(t);
  }, [ready, finish]);

  const phaseIndex = Math.min(
    phases.length - 1,
    Math.floor((progress / 100) * phases.length),
  );
  const shown = Math.floor(progress);

  return (
    <AnimatePresence>
      {!gone && (
        <motion.div
          key="preloader"
          className="fixed inset-0 z-[100] cursor-pointer overflow-hidden bg-ink"
          onClick={() => ready && finish()}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="grid-bg absolute inset-0 opacity-40" />
          <div className="aurora opacity-70" />

          <Canvas
            className="absolute inset-0"
            dpr={[1, 1.8]}
            camera={{ position: [0, 0, 8.5], fov: 55 }}
            gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          >
            <Particles progress={progressRef} exiting={exitingRef} />
            <Core exiting={exitingRef} />
          </Canvas>

          {/* HUD */}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5 sm:p-8">
            <div className="flex items-start justify-between font-mono text-[10px] uppercase tracking-[0.32em] text-white/45">
              <span className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-[10px] font-black text-ink">
                  {brandMark}
                </span>
                WEBGL / RENDERER ONLINE
              </span>
              <span className="hidden sm:block">SYS.PORTFOLIO v2.0</span>
            </div>

            <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 text-center">
              <motion.div
                animate={{ opacity: exitingState ? 0 : 1, y: exitingState ? -30 : 0 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col items-center gap-6"
              >
                <div className="font-mono text-[11px] uppercase tracking-[0.4em] text-white/55">
                  <Scramble text={phases[phaseIndex] ?? ""} />
                </div>
                <div
                  className="text-[19vw] leading-[0.8] font-black tracking-tighter text-transparent sm:text-[12rem]"
                  style={{
                    WebkitTextStroke: "1px rgba(255,255,255,.28)",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  {String(shown).padStart(3, "0")}
                </div>
              </motion.div>
            </div>

            <div className="mx-auto w-full max-w-3xl">
              <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="absolute inset-y-0 start-0 rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg,#22d3ee,#a855f7,#22d3ee)",
                    backgroundSize: "200% 100%",
                    width: `${progress}%`,
                  }}
                  animate={{ backgroundPositionX: ["0%", "200%"] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">
                <span>{shown < 100 ? "LOADING ASSETS" : "READY"}</span>
                <AnimatePresence>
                  {ready && !exitingState && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0.35, 1, 0.35] }}
                      transition={{ duration: 1.6, repeat: Infinity }}
                      className="text-white"
                    >
                      {enterLabel} — {hint}
                    </motion.span>
                  )}
                </AnimatePresence>
                <span>{shown}%</span>
              </div>
            </div>
          </div>

          {/* exit flash + curtains */}
          <AnimatePresence>
            {exitingState && (
              <>
                <motion.div
                  className="absolute inset-0 bg-white"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.85, 0] }}
                  transition={{ duration: 0.7, times: [0, 0.15, 1] }}
                />
                <motion.div
                  className="absolute inset-x-0 top-0 h-1/2 bg-ink"
                  initial={{ y: 0 }}
                  animate={{ y: "-100%" }}
                  transition={{ duration: 0.9, ease: [0.83, 0, 0.17, 1], delay: 0.25 }}
                />
                <motion.div
                  className="absolute inset-x-0 bottom-0 h-1/2 bg-ink"
                  initial={{ y: 0 }}
                  animate={{ y: "100%" }}
                  transition={{ duration: 0.9, ease: [0.83, 0, 0.17, 1], delay: 0.25 }}
                />
              </>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
