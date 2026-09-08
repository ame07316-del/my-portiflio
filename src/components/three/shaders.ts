export const particleVertex = /* glsl */ `
uniform float uTime;
uniform float uProgress;
uniform float uBurst;
uniform float uSize;
uniform float uPixelRatio;

attribute vec3 aSphere;
attribute vec3 aKnot;
attribute vec3 aGrid;
attribute float aRnd;

varying float vGlow;
varying float vRnd;

mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,-s, 0.,s,c); }

// cheap hash noise
float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123); }

void main() {
  float p = clamp(uProgress, 0.0, 1.0);

  // three-stage morph: cloud -> sphere -> knot -> grid
  vec3 pos = mix(aSphere, aKnot, smoothstep(0.12, 0.55, p));
  pos = mix(pos, aGrid, smoothstep(0.62, 0.98, p));

  // organic swirl
  float t = uTime * 0.35;
  float swirl = (0.35 + aRnd * 0.65) * (1.0 - p * 0.55);
  pos = rotY(t * swirl) * rotX(sin(t * 0.6 + aRnd * 6.2831) * 0.25 * swirl) * pos;

  // breathing turbulence
  float n = hash(pos * 1.7 + aRnd);
  pos += normalize(pos + 0.0001) * sin(uTime * 1.6 + aRnd * 12.0) * (0.06 + 0.22 * (1.0 - p));
  pos += vec3(n - 0.5) * 0.05;

  // explosion on exit
  pos += normalize(pos + 0.0001) * uBurst * (2.0 + aRnd * 9.0);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float size = uSize * (0.55 + aRnd * 0.9) * (1.0 + uBurst * 1.4);
  gl_PointSize = size * uPixelRatio * (12.0 / -mv.z);

  vGlow = 0.35 + 0.65 * aRnd + uBurst;
  vRnd = aRnd;
}
`;

export const particleFragment = /* glsl */ `
precision highp float;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacity;
varying float vGlow;
varying float vRnd;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float alpha = smoothstep(0.5, 0.02, d);
  vec3 col = mix(uColorA, uColorB, vRnd);
  col += vec3(0.35) * pow(1.0 - d * 2.0, 3.0);
  gl_FragColor = vec4(col * vGlow, alpha * uOpacity);
}
`;

export const orbVertex = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform vec2 uMouse;
varying vec3 vNormal;
varying vec3 vPos;
varying float vNoise;

//	Simplex 3D noise by Ian McEwan, Ashima Arts (MIT)
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

void main() {
  vNormal = normalize(normalMatrix * normal);
  float t = uTime * 0.28;
  float n = snoise(position * 1.15 + vec3(t, t * 0.7, -t));
  float n2 = snoise(position * 2.6 - vec3(t * 1.4, 0.0, t));
  float displace = (n * 0.75 + n2 * 0.25) * uAmp;
  displace += (uMouse.x * normal.x + uMouse.y * normal.y) * 0.12;
  vec3 pos = position + normal * displace;
  vNoise = n;
  vPos = pos;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const orbFragment = /* glsl */ `
precision highp float;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vPos;
varying float vNoise;

void main() {
  vec3 viewDir = normalize(cameraPosition - vPos);
  float fresnel = pow(1.0 - max(dot(viewDir, normalize(vNormal)), 0.0), 2.4);
  float bands = sin(vPos.y * 5.5 + uTime * 0.9 + vNoise * 3.0) * 0.5 + 0.5;

  vec3 base = mix(uColorA, uColorB, clamp(vNoise * 0.5 + 0.5, 0.0, 1.0));
  vec3 col = base * (0.28 + bands * 0.35);
  col += vec3(0.55, 0.85, 1.0) * fresnel * 1.25;
  col += uColorB * pow(fresnel, 3.0) * 1.4;

  gl_FragColor = vec4(col, 0.92);
}
`;
