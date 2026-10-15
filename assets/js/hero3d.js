/* ══════════════════════════════════════════════════════════════
   برومبت 4 — المجسم: كرة زجاجية مُقسّطة (انكسار + تشتّت لوني)
   Three.js procedural — مفيش ملف موديل خارجي.
   الحالات: تحميل → جاهز / خطأ (WebGL غير متاح) / تقليل حركة (إطار ثابت)
   ══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';

const canvas   = document.getElementById('gl');
const loading  = document.getElementById('glLoading');
const fallback = document.getElementById('glFallback');
const fill     = document.getElementById('holdFill');
const hint     = document.getElementById('holdHint');
const REDUCED  = matchMedia('(prefers-reduced-motion: reduce)').matches;
let motionOn   = !REDUCED;

/* ── فشل WebGL: محتوى مقروء من غير المجسم ── */
function fail() {
  loading.hidden = true;
  fallback.hidden = false;
  canvas.style.display = 'none';
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) { fail(); }

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  camera.position.set(0, 0, 9);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;

  scene.add(new THREE.DirectionalLight(0xffffff, 1.4).translateZ(6));
  const cyan = new THREE.PointLight(0x00F0FF, 26, 30); cyan.position.set(-5, 3, 4); scene.add(cyan);
  const vio  = new THREE.PointLight(0x8A2BE2, 22, 30); vio.position.set(5, -3, 3);  scene.add(vio);

  /* الزجاج المُقسّط: انكسار + تشتّت لوني (dispersion) */
  const glass = new THREE.MeshPhysicalMaterial({
    transmission: 1, thickness: 2.4, roughness: .06, ior: 1.45,
    dispersion: 4.2, flatShading: true, metalness: 0,
    clearcoat: 1, clearcoatRoughness: .1,
    iridescence: .35, iridescenceIOR: 1.3
  });
  const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(2.35, 2), glass);
  scene.add(sphere);

  /* القلب: شكل منبعث يتلوّن بسيان/بنفسجي — بيظهر منكسر جوّه الزجاج */
  const core = new THREE.Mesh(
    new THREE.TorusKnotGeometry(.85, .26, 140, 18),
    new THREE.MeshStandardMaterial({ color: 0x0b0d16, emissive: 0x00F0FF, emissiveIntensity: .55,
      metalness: .9, roughness: .25 })
  );
  scene.add(core);

  /* قطع متفككة عائمة — بتتفرّق مع الضغط المستمر */
  const facets = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .06), glass);
    const a = (i / 7) * Math.PI * 2;
    m.userData = { a, r: 3.1 + (i % 3) * .35, y: (i % 2 ? 1 : -1) * (.6 + i * .18), s: .7 + (i % 4) * .18 };
    scene.add(m); facets.push(m);
  }

  /* ── تفاعل «اضغط واستمر» ── */
  let hold = 0, holdTarget = 0;
  const down = e => { holdTarget = 1; hint.style.color = 'var(--cyan)'; canvas.setPointerCapture?.(e.pointerId); };
  const up   = () => { holdTarget = 0; hint.style.color = ''; };
  canvas.addEventListener('pointerdown', down);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  canvas.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); down(e); } });
  canvas.addEventListener('keyup',   e => { if (e.key === ' ' || e.key === 'Enter') up(); });
  canvas.tabIndex = 0;

  /* مؤشر + سكرول */
  let px = 0, py = 0;
  addEventListener('pointermove', e => {
    px = (e.clientX / innerWidth - .5) * 2;
    py = (e.clientY / innerHeight - .5) * 2;
  }, { passive: true });

  function resize() {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  document.addEventListener('amr:motion', e => {
    motionOn = e.detail.on;
    if (motionOn) loop();
  });

  const clock = new THREE.Clock();
  let raf = 0;

  function frame() {
    const t = clock.getElapsedTime();
    hold += (holdTarget - hold) * .06;
    fill.style.width = (hold * 100).toFixed(1) + '%';

    sphere.rotation.y = t * (.12 + hold * 1.5) + scrollY * .0006;
    sphere.rotation.x = Math.sin(t * .22) * .18 + py * .22;
    sphere.rotation.z = px * .12;
    sphere.scale.setScalar(1 + hold * .08);

    glass.dispersion = 4.2 + hold * 6.5;
    glass.roughness  = .06 + hold * .05;

    core.rotation.x = t * .5; core.rotation.y = t * .34;
    core.material.emissive.setHex(hold > .5 ? 0xEC4899 : 0x00F0FF);

    facets.forEach((m, i) => {
      const u = m.userData;
      const r = u.r + hold * 2.2 + Math.sin(t * .6 + i) * .12;
      m.position.set(Math.cos(u.a + t * (.15 + hold)) * r, u.y + Math.sin(t * .5 + i) * .2,
                     Math.sin(u.a + t * (.15 + hold)) * r * .55);
      m.rotation.set(t * .3 + i, t * .22 + i * .5, hold * 2);
      m.scale.setScalar(u.s * (1 + hold * .35));
    });

    camera.position.x += (px * .8 - camera.position.x) * .04;
    camera.position.y += (-py * .6 - camera.position.y) * .04;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  function loop() {
    cancelAnimationFrame(raf);
    if (!motionOn) { frame(); return; }        // تقليل حركة/إيقاف: إطار ثابت واحد
    const step = () => { frame(); raf = requestAnimationFrame(step); };
    step();
  }

  loading.hidden = true;
  loop();
}
