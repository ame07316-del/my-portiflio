"use client";

/**
 * Globe3D — a premium dotted-earth globe.
 *
 * Renders a land dot-matrix (pre-computed in /public/globe-dots.json), a glass
 * core, a fresnel atmosphere, animated great-circle arcs and interactive
 * markers with optional avatars.
 *
 * <Globe3D markers={markers} config={{ atmosphereColor, atmosphereIntensity, bumpScale, autoRotateSpeed }} />
 */

import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type GlobeMarker = {
  lat: number;
  lng: number;
  /** Optional avatar image shown on the pin */
  src?: string;
  label?: string;
  /** Secondary line under the label */
  caption?: string;
  /** Highlights this marker (home base) and makes it the arc origin */
  home?: boolean;
  color?: string;
  id?: string | number;
};

export type GlobeConfig = {
  /** Rim glow colour */
  atmosphereColor?: string;
  /** Rim glow strength, 0 – 40 */
  atmosphereIntensity?: number;
  /** How far the land dots sit above the sphere (relief) */
  bumpScale?: number;
  /** Degrees per second-ish */
  autoRotateSpeed?: number;
  /** Sphere body colour */
  globeColor?: string;
  /** Land dot colour */
  landColor?: string;
  /** Secondary land dot colour (gradient towards the poles) */
  landColorAlt?: string;
  /** Marker + arc colour */
  markerColor?: string;
  /** Home marker colour */
  homeColor?: string;
  dotSize?: number;
  showArcs?: boolean;
  showGraticule?: boolean;
  /** Allow dragging to spin */
  interactive?: boolean;
};

const defaults: Required<GlobeConfig> = {
  atmosphereColor: "#4da6ff",
  atmosphereIntensity: 20,
  bumpScale: 5,
  autoRotateSpeed: 0.3,
  globeColor: "#070a14",
  landColor: "#22d3ee",
  landColorAlt: "#a855f7",
  markerColor: "#ffffff",
  homeColor: "#e9c98b",
  dotSize: 1,
  showArcs: true,
  showGraticule: true,
  interactive: true,
};

const RADIUS = 1;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function latLngToVector3(lat: number, lng: number, radius = RADIUS) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function arcPoints(a: THREE.Vector3, b: THREE.Vector3, segments = 64) {
  const angle = a.angleTo(b);
  const lift = 0.18 + angle * 0.22;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = new THREE.Vector3().copy(a).lerp(b, t);
    // slerp-ish: normalise back onto the sphere, then lift with a sine bell
    p.normalize().multiplyScalar(RADIUS + Math.sin(Math.PI * t) * lift);
    pts.push(p);
  }
  return pts;
}

/* ------------------------------------------------------------------ */
/*  Land dot matrix                                                    */
/* ------------------------------------------------------------------ */

const dotVertex = /* glsl */ `
uniform float uSize;
uniform float uPixelRatio;
uniform float uTime;
uniform float uReveal;
attribute float aRnd;
varying float vFade;
varying float vRnd;

void main() {
  vec3 pos = position * (1.0 + sin(uTime * 0.6 + aRnd * 6.28) * 0.0015);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);

  // fade dots that face away from the camera
  vec3 worldNormal = normalize(mat3(modelMatrix) * normalize(position));
  vec3 toCam = normalize(cameraPosition - (modelMatrix * vec4(pos, 1.0)).xyz);
  float facing = dot(worldNormal, toCam);
  vFade = smoothstep(-0.05, 0.45, facing);

  float appear = smoothstep(0.0, 1.0, clamp(uReveal * 1.6 - aRnd * 0.6, 0.0, 1.0));
  vRnd = aRnd;

  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPixelRatio * appear * (1.0 + aRnd * 0.35) * (2.6 / -mv.z);
}
`;

const dotFragment = /* glsl */ `
precision highp float;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying float vFade;
varying float vRnd;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float alpha = smoothstep(0.5, 0.12, d) * vFade;
  if (alpha < 0.01) discard;
  vec3 col = mix(uColorA, uColorB, vRnd * 0.85);
  gl_FragColor = vec4(col, alpha);
}
`;

function LandDots({
  cfg,
}: {
  cfg: Required<GlobeConfig>;
}) {
  const [dots, setDots] = useState<Float32Array | null>(null);
  const [rnd, setRnd] = useState<Float32Array | null>(null);
  const mat = useRef<THREE.ShaderMaterial>(null);
  const reveal = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/globe-dots.json")
      .then((r) => r.json())
      .then((data: { points: [number, number][] }) => {
        if (cancelled) return;
        const n = data.points.length;
        const arr = new Float32Array(n * 3);
        const rn = new Float32Array(n);
        const lift = 1 + cfg.bumpScale * 0.0016;
        for (let i = 0; i < n; i++) {
          const [lat, lng] = data.points[i];
          const v = latLngToVector3(lat, lng, RADIUS * lift);
          arr[i * 3] = v.x;
          arr[i * 3 + 1] = v.y;
          arr[i * 3 + 2] = v.z;
          // deterministic pseudo random from coordinates
          rn[i] = ((Math.sin(lat * 12.9898 + lng * 78.233) * 43758.5453) % 1 + 1) % 1;
        }
        setDots(arr);
        setRnd(rn);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cfg.bumpScale]);

  const uniforms = useMemo(
    () => ({
      uSize: { value: 2.4 * cfg.dotSize },
      uPixelRatio: {
        value: typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio),
      },
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uColorA: { value: new THREE.Color(cfg.landColor) },
      uColorB: { value: new THREE.Color(cfg.landColorAlt) },
    }),
    [cfg.dotSize, cfg.landColor, cfg.landColorAlt],
  );

  useFrame((state, delta) => {
    if (!mat.current) return;
    reveal.current = Math.min(1, reveal.current + delta * 0.55);
    mat.current.uniforms.uTime.value = state.clock.elapsedTime;
    mat.current.uniforms.uReveal.value = reveal.current;
  });

  if (!dots || !rnd) return null;

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[dots, 3]} />
        <bufferAttribute attach="attributes-aRnd" args={[rnd, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={dotVertex}
        fragmentShader={dotFragment}
        transparent
        depthWrite={false}
      />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/*  Atmosphere                                                         */
/* ------------------------------------------------------------------ */

const atmoVertex = /* glsl */ `
varying vec3 vNormal;
varying vec3 vPos;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vPos = (modelViewMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const atmoFragment = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uIntensity;
varying vec3 vNormal;
varying vec3 vPos;
void main() {
  vec3 viewDir = normalize(-vPos);
  float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
  float glow = pow(rim, 3.2) * (uIntensity * 0.06);
  gl_FragColor = vec4(uColor * glow, glow * 0.9);
}
`;

function Atmosphere({ cfg }: { cfg: Required<GlobeConfig> }) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(cfg.atmosphereColor) },
      uIntensity: { value: cfg.atmosphereIntensity },
    }),
    [cfg.atmosphereColor, cfg.atmosphereIntensity],
  );
  return (
    <mesh scale={1.16}>
      <sphereGeometry args={[RADIUS, 64, 64]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={atmoVertex}
        fragmentShader={atmoFragment}
        transparent
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/*  Markers                                                            */
/* ------------------------------------------------------------------ */

function Marker({
  marker,
  cfg,
  active,
  onEnter,
  onLeave,
  onClick,
}: {
  marker: GlobeMarker;
  cfg: Required<GlobeConfig>;
  active: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  const ring = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const pos = useMemo(
    () => latLngToVector3(marker.lat, marker.lng, RADIUS * 1.012),
    [marker.lat, marker.lng],
  );
  const color = marker.color ?? (marker.home ? cfg.homeColor : cfg.markerColor);
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pos.clone().normalize());
    return q;
  }, [pos]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const pulse = (offset: number) => {
      const p = ((t * 0.55 + offset) % 1);
      return { s: 0.5 + p * 2.4, o: (1 - p) * 0.55 };
    };
    if (ring.current) {
      const { s, o } = pulse(0);
      ring.current.scale.setScalar(s);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = o;
    }
    if (ring2.current) {
      const { s, o } = pulse(0.5);
      ring2.current.scale.setScalar(s);
      (ring2.current.material as THREE.MeshBasicMaterial).opacity = o * 0.7;
    }
  });

  const size = marker.home ? 0.022 : 0.015;

  return (
    <group position={pos} quaternion={quaternion}>
      {/* pulsing rings, laid flat on the surface */}
      <mesh ref={ring}>
        <ringGeometry args={[size * 1.4, size * 1.75, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={ring2}>
        <ringGeometry args={[size * 1.4, size * 1.65, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* light beam */}
      <mesh position={[0, 0, marker.home ? 0.07 : 0.045]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[size * 0.14, size * 0.3, marker.home ? 0.14 : 0.09, 12, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} depthWrite={false} />
      </mesh>

      {/* hit area + head */}
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          onEnter();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onLeave();
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        scale={active ? 1.35 : 1}
      >
        <sphereGeometry args={[size, 20, 20]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>

      {(active || marker.src) && (
        <Html
          center
          position={[0, 0, marker.src ? 0.12 : 0.1]}
          distanceFactor={2.4}
          zIndexRange={[20, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{ borderColor: `${color}55` }}
            className="flex -translate-y-1 items-center gap-2 rounded-full border bg-black/70 px-2.5 py-1.5 backdrop-blur-md"
          >
            {marker.src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={marker.src}
                alt=""
                className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-white/30"
              />
            )}
            <span className="whitespace-nowrap text-[11px] leading-none font-semibold text-white">
              {marker.label}
              {marker.caption && (
                <span className="ms-1.5 font-mono text-[9px] font-normal text-white/45">
                  {marker.caption}
                </span>
              )}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Arcs                                                               */
/* ------------------------------------------------------------------ */

function Arcs({
  markers,
  cfg,
}: {
  markers: GlobeMarker[];
  cfg: Required<GlobeConfig>;
}) {
  const home = markers.find((m) => m.home) ?? markers[0];
  const group = useRef<THREE.Group>(null);

  const curves = useMemo(() => {
    if (!home) return [];
    const origin = latLngToVector3(home.lat, home.lng);
    return markers
      .filter((m) => m !== home)
      .map((m) => arcPoints(origin, latLngToVector3(m.lat, m.lng)));
  }, [markers, home]);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.children.forEach((child, i) => {
      const line = child as THREE.Object3D & {
        material?: THREE.Material & { opacity?: number };
      };
      if (line.material && "opacity" in line.material) {
        const phase = (t * 0.35 + i * 0.17) % 1;
        line.material.opacity = 0.12 + Math.sin(phase * Math.PI) * 0.5;
      }
    });
  });

  if (!curves.length) return null;

  return (
    <group ref={group}>
      {curves.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          color={cfg.homeColor}
          lineWidth={1}
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Graticule                                                          */
/* ------------------------------------------------------------------ */

function Graticule({ color }: { color: string }) {
  const lats = [-60, -30, 0, 30, 60];
  return (
    <group>
      {lats.map((lat) => {
        const r = Math.cos((lat * Math.PI) / 180) * RADIUS * 1.001;
        const y = Math.sin((lat * Math.PI) / 180) * RADIUS * 1.001;
        return (
          <mesh key={lat} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r, 0.0012, 6, 128]} />
            <meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} />
          </mesh>
        );
      })}
      {[0, 45, 90, 135].map((deg) => (
        <mesh key={deg} rotation={[0, (deg * Math.PI) / 180, 0]}>
          <torusGeometry args={[RADIUS * 1.001, 0.0012, 6, 128]} />
          <meshBasicMaterial color={color} transparent opacity={0.1} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Globe body                                                         */
/* ------------------------------------------------------------------ */

function GlobeBody({
  markers,
  cfg,
  onMarkerClick,
  onMarkerHover,
}: {
  markers: GlobeMarker[];
  cfg: Required<GlobeConfig>;
  onMarkerClick?: (m: GlobeMarker) => void;
  onMarkerHover?: (m: GlobeMarker | null) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const [active, setActive] = useState<number | null>(null);
  const { size } = useThree();

  useFrame((_, delta) => {
    if (group.current && active === null) {
      group.current.rotation.y += delta * cfg.autoRotateSpeed * 0.28;
    }
  });

  // slightly smaller on phones so labels stay inside the canvas
  const scale = size.width < 640 ? 0.82 : 1;

  return (
    <group scale={scale}>
      <group ref={group}>
        {/* glass core */}
        <mesh>
          <sphereGeometry args={[RADIUS * 0.995, 64, 64]} />
          <meshPhongMaterial
            color={cfg.globeColor}
            emissive={new THREE.Color(cfg.globeColor)}
            emissiveIntensity={0.35}
            shininess={18}
            specular={new THREE.Color(cfg.atmosphereColor)}
          />
        </mesh>

        {cfg.showGraticule && <Graticule color={cfg.atmosphereColor} />}
        <LandDots cfg={cfg} />
        {cfg.showArcs && <Arcs markers={markers} cfg={cfg} />}

        {markers.map((m, i) => (
          <Marker
            key={m.id ?? `${m.lat}-${m.lng}-${i}`}
            marker={m}
            cfg={cfg}
            active={active === i}
            onEnter={() => {
              setActive(i);
              onMarkerHover?.(m);
            }}
            onLeave={() => {
              setActive(null);
              onMarkerHover?.(null);
            }}
            onClick={() => onMarkerClick?.(m)}
          />
        ))}
      </group>

      <Atmosphere cfg={cfg} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Public component                                                   */
/* ------------------------------------------------------------------ */

export function Globe3D({
  markers = [],
  config,
  onMarkerClick,
  onMarkerHover,
  className = "",
}: {
  markers?: GlobeMarker[];
  config?: GlobeConfig;
  onMarkerClick?: (marker: GlobeMarker) => void;
  onMarkerHover?: (marker: GlobeMarker | null) => void;
  className?: string;
}) {
  const cfg = { ...defaults, ...config } as Required<GlobeConfig>;
  // On touch devices dragging should scroll the page, not spin the globe.
  const coarsePointer = useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(pointer: coarse)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );

  return (
    <div className={`relative h-full w-full ${className}`}>
      <Canvas
        dpr={[1, 1.9]}
        camera={{ position: [0, 0.35, 3.05], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <ambientLight intensity={1.1} />
        <directionalLight position={[3, 2, 4]} intensity={1.6} color={cfg.atmosphereColor} />
        <directionalLight position={[-4, -1, -2]} intensity={0.7} color={cfg.homeColor} />
        <GlobeBody
          markers={markers}
          cfg={cfg}
          onMarkerClick={onMarkerClick}
          onMarkerHover={onMarkerHover}
        />
        {cfg.interactive && !coarsePointer && (
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            rotateSpeed={0.45}
            enableDamping
            dampingFactor={0.06}
            minPolarAngle={Math.PI / 3.4}
            maxPolarAngle={Math.PI / 1.5}
          />
        )}
      </Canvas>
    </div>
  );
}

export default Globe3D;
