/* ══════════════════════════════════════════════════════════════
   المجسم: هيكل عظمي بشري من assets/models/skeleton.glb
   ملف .glb حقيقي مولّد إجرائيًا (45 قطعة تشريحية) — مش موديل AI.
   الحالات: تحميل → جاهز / فشل الملف أو WebGL → بديل مقروء /
   تقليل حركة → إطار ثابت.
   ══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';

const canvas   = document.getElementById('gl');
const loading  = document.getElementById('glLoading');
const fallback = document.getElementById('glFallback');
const fill     = document.getElementById('holdFill');
const hint     = document.getElementById('holdHint');
const REDUCED  = matchMedia('(prefers-reduced-motion: reduce)').matches;
let motionOn   = !REDUCED;

function fail() {
  loading.hidden = true;
  fallback.hidden = false;
  canvas.style.display = 'none';
  document.body.classList.add('no-webgl');   // البديل الخطي يظهر فورًا — مفيش فراغ
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) { fail(); }

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  camera.position.set(0, 0, 9);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;

  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2, 4, 6); scene.add(key);
  const cyan = new THREE.PointLight(0x00F0FF, 30, 30); cyan.position.set(-5, 2, 4); scene.add(cyan);
  const vio  = new THREE.PointLight(0x8A2BE2, 24, 30); vio.position.set(5, -2, 3);  scene.add(vio);

  /* خامة هولوغرام: عظام فاتحة بتشعّ سيان */
  const holo = new THREE.MeshStandardMaterial({
    color: 0xdfe9ff, emissive: 0x00F0FF, emissiveIntensity: .22,
    metalness: .25, roughness: .42, flatShading: true
  });

  const rig = new THREE.Group();
  scene.add(rig);

  let skeleton = null;
  new GLTFLoader().load('assets/models/skeleton.glb', gltf => {
    skeleton = gltf.scene;
    skeleton.traverse(o => { if (o.isMesh) { o.material = holo; o.castShadow = false; } });
    /* توسيط وتوحيد المقياس لارتفاع 4.4 وحدة */
    const box = new THREE.Box3().setFromObject(skeleton);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    skeleton.position.sub(center);
    skeleton.scale.setScalar(4.4 / Math.max(size.y, .001));
    rig.add(skeleton);
    loading.hidden = true;
    if (!motionOn) frame();          // تقليل حركة: إطار واحد بعد التحميل
  }, undefined, () => { fail(); });

  /* قطع زجاجية عائمة حوالي الهيكل — بتتفرّق مع الضغط المستمر */
  const shardMat = new THREE.MeshPhysicalMaterial({
    transmission: 1, thickness: 1.2, roughness: .08, ior: 1.45, dispersion: 3.5,
    flatShading: true, clearcoat: 1
  });
  const shards = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(.42, .42, .05), shardMat);
    m.userData = { a: (i / 6) * Math.PI * 2, r: 2.6 + (i % 3) * .4, y: (i % 2 ? 1 : -1) * (.8 + i * .3) };
    scene.add(m); shards.push(m);
  }

  /* ── اضغط واستمر ── */
  let hold = 0, holdTarget = 0;
  const down = e => { holdTarget = 1; hint.style.color = 'var(--cyan)'; canvas.setPointerCapture?.(e.pointerId); };
  const up   = () => { holdTarget = 0; hint.style.color = ''; };
  canvas.addEventListener('pointerdown', down);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); down(e); } });
  canvas.addEventListener('keyup',   e => { if (e.key === ' ' || e.key === 'Enter') up(); });

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

  document.addEventListener('amr:motion', e => { motionOn = e.detail.on; if (motionOn) loop(); else frame(); });

  const clock = new THREE.Clock();
  let raf = 0;

  function frame() {
    const t = clock.getElapsedTime();
    hold += (holdTarget - hold) * .06;
    fill.style.width = (hold * 100).toFixed(1) + '%';
    const h1 = hold > .45 ? '1' : '0';
    if (document.body.dataset.hold !== h1) document.body.dataset.hold = h1;  // التعليقات تضيء بالترتيب

    rig.rotation.y = t * (.18 + hold * 1.6) + scrollY * .0005;
    rig.rotation.x = Math.sin(t * .3) * .06 + py * .12;
    rig.rotation.z = px * .05;
    rig.position.y = Math.sin(t * .8) * .08;

    holo.emissiveIntensity = .22 + hold * .8;
    holo.emissive.setHex(hold > .55 ? 0xEC4899 : 0x00F0FF);

    shards.forEach((m, i) => {
      const u = m.userData;
      const r = u.r + hold * 1.8 + Math.sin(t * .6 + i) * .1;
      m.position.set(Math.cos(u.a + t * (.2 + hold)) * r, u.y + Math.sin(t * .5 + i) * .2,
                     Math.sin(u.a + t * (.2 + hold)) * r * .5);
      m.rotation.set(t * .3 + i, t * .25 + i * .5, hold * 2);
    });

    camera.position.x += (px * .7 - camera.position.x) * .04;
    camera.position.y += (-py * .5 - camera.position.y) * .04;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }

  function loop() {
    cancelAnimationFrame(raf);
    if (!motionOn) { frame(); return; }
    const step = () => { frame(); raf = requestAnimationFrame(step); };
    step();
  }
  loop();
}
