/* للتشغيل: npm i @gltf-transform/core ثم node tools/build-skeleton.mjs */
/* ══════════════════════════════════════════════════════════════
   مولّد هيكل عظمي بشري مبسط → skeleton.glb
   تشريح مبسّط: جمجمة · فك · 7 فقرات · 5 أضلاع · قصّ · ترقوتان ·
   لوحتان · حوض · طرفان علويان · طرفان سفليان  (~43 قطعة)
   ══════════════════════════════════════════════════════════════ */
import { Document, NodeIO } from '@gltf-transform/core';

/* ─────────── مولّدات أشكال (positions + indices) ─────────── */
function sphere(r, ws = 12, hs = 8) {
  const pos = [], idx = [];
  for (let y = 0; y <= hs; y++) for (let x = 0; x <= ws; x++) {
    const v = y / hs * Math.PI, u = x / ws * Math.PI * 2;
    pos.push(r * Math.sin(v) * Math.cos(u), r * Math.cos(v), r * Math.sin(v) * Math.sin(u));
  }
  for (let y = 0; y < hs; y++) for (let x = 0; x < ws; x++) {
    const a = y * (ws + 1) + x, b = a + ws + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return { pos, idx };
}
function cylinder(rt, rb, h, seg = 10) {
  const pos = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    pos.push(rt * c, h / 2, rt * s, rb * c, -h / 2, rb * s);
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  // غطاءان
  const t = pos.length / 3; pos.push(0, h / 2, 0);
  for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; pos.push(rt * Math.cos(a), h / 2, rt * Math.sin(a)); }
  for (let i = 0; i < seg; i++) idx.push(t, t + 1 + i, t + 2 + i);
  const b = pos.length / 3; pos.push(0, -h / 2, 0);
  for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; pos.push(rb * Math.cos(a), -h / 2, rb * Math.sin(a)); }
  for (let i = 0; i < seg; i++) idx.push(b, b + 2 + i, b + 1 + i);
  return { pos, idx };
}
function box(w, h, d) {
  const x = w / 2, y = h / 2, z = d / 2;
  const pos = [-x,-y,z, x,-y,z, x,y,z, -x,y,z, -x,-y,-z, x,-y,-z, x,y,-z, -x,y,-z];
  const idx = [0,1,2,0,2,3, 5,4,7,5,7,6, 4,0,3,4,3,7, 1,5,6,1,6,2, 3,2,6,3,6,7, 4,5,1,4,1,0];
  return { pos, idx };
}
function ribRing(R, r, arc, seg = 16, tseg = 6) {   // حلقة أفقية مفتوحة من الخلف
  const pos = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = (i / seg - .5) * arc;                 // متمركزة قدام (+Z)
    const cx = R * Math.sin(u), cz = R * Math.cos(u);
    for (let j = 0; j <= tseg; j++) {
      const v = j / tseg * Math.PI * 2;
      const rr = R + r * Math.cos(v);
      pos.push(rr * Math.sin(u), r * Math.sin(v), rr * Math.cos(u));
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < tseg; j++) {
    const a = i * (tseg + 1) + j, b = a + tseg + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return { pos, idx };
}

/* ─────────── تحويلات تُخبز في الإحداثيات ─────────── */
const rad = d => d * Math.PI / 180;
function bake(g, { p = [0,0,0], r = [0,0,0], s = [1,1,1] } = {}) {
  const [sx, sy, sz] = s, [rx, ry, rz] = r.map(rad);
  const cx = Math.cos(rx), sxr = Math.sin(rx), cy = Math.cos(ry), syr = Math.sin(ry), cz = Math.cos(rz), szr = Math.sin(rz);
  const out = [];
  for (let i = 0; i < g.pos.length; i += 3) {
    let x = g.pos[i] * sx, y = g.pos[i+1] * sy, z = g.pos[i+2] * sz;
    // Rx
    let y1 = y * cx - z * sxr, z1 = y * sxr + z * cx; y = y1; z = z1;
    // Ry
    let x1 = x * cy + z * syr, z2 = -x * syr + z * cy; x = x1; z = z2;
    // Rz
    let x2 = x * cz - y * szr, y2 = x * szr + y * cz; x = x2; y = y2;
    out.push(x + p[0], y + p[1], z + p[2]);
  }
  return { pos: out, idx: g.idx };
}
function normals(pos, idx) {
  const n = new Array(pos.length).fill(0);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i]*3, b = idx[i+1]*3, c = idx[i+2]*3;
    const ux = pos[b]-pos[a], uy = pos[b+1]-pos[a+1], uz = pos[b+2]-pos[a+2];
    const vx = pos[c]-pos[a], vy = pos[c+1]-pos[a+1], vz = pos[c+2]-pos[a+2];
    const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
    for (const k of [a,b,c]) { n[k]+=nx; n[k+1]+=ny; n[k+2]+=nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i+1], n[i+2]) || 1;
    n[i]/=l; n[i+1]/=l; n[i+2]/=l;
  }
  return n;
}

/* ─────────── قائمة العظام ─────────── */
const BONES = [];
const add = (g, t) => BONES.push(bake(g, t));

add(sphere(.11, 14, 10), { p: [0, 1.66, 0], s: [1, 1.18, 1.12] });          // جمجمة
add(box(.10, .05, .10),  { p: [0, 1.55, .03] });                            // فك
for (let i = 0; i < 7; i++) add(box(.055, .034, .055), { p: [0, 1.50 - i * .075, -.02] });   // فقرات
for (let i = 0; i < 5; i++)                                                  // أضلاع
  add(ribRing(.125 + i * .012, .011, Math.PI * 1.35), { p: [0, 1.42 - i * .062, 0] });
add(box(.032, .24, .02), { p: [0, 1.30, .135] });                           // قصّ
for (const s of [1, -1]) {
  add(box(.17, .022, .022), { p: [s * .10, 1.50, .05], r: [0, 0, -s * 12] });  // ترقوة
  add(box(.085, .11, .02),  { p: [s * .115, 1.40, -.10], r: [0, 0, s * 8] });  // لوح كتف
  add(box(.17, .11, .11),   { p: [s * .07, 1.00, 0], r: [0, 0, s * 14] });     // حوض
  add(sphere(.035, 8, 6),   { p: [s * .20, 1.475, 0] });                      // كتف
  add(cylinder(.021, .017, .30, 8), { p: [s * .225, 1.315, 0], r: [0, 0, s * 7] });  // عضد
  add(sphere(.024, 8, 6),   { p: [s * .245, 1.155, 0] });                     // مرفق
  add(cylinder(.014, .011, .26, 8), { p: [s * .255, 1.015, .012], r: [0, 0, s * 4] }); // كعبرة
  add(cylinder(.013, .011, .26, 8), { p: [s * .250, 1.015, -.012], r: [0, 0, s * 4] }); // زند
  add(box(.05, .10, .022),  { p: [s * .265, .845, 0] });                      // يد
  add(sphere(.042, 8, 6),   { p: [s * .095, .955, 0] });                      // ورك
  add(cylinder(.023, .018, .42, 8), { p: [s * .105, .735, 0], r: [0, 0, s * 3] });   // فخذ
  add(sphere(.028, 8, 6),   { p: [s * .112, .515, 0] });                      // ركبة
  add(cylinder(.017, .013, .40, 8), { p: [s * .112, .305, .012] });           // ظنبوب
  add(cylinder(.009, .007, .38, 6), { p: [s * .128, .305, -.012] });          // شظية
  add(box(.06, .04, .17),   { p: [s * .112, .025, .05] });                    // قدم
}

/* ─────────── تجميع.mesh واحد بقطع متعددة ─────────── */
const doc = new Document();
const buffer = doc.createBuffer();
const mat = doc.createMaterial('Bone')
  .setBaseColorFactor([.92, .96, 1, 1])
  .setEmissiveFactor([0, .42, .5])
  .setMetallicFactor(.15).setRoughnessFactor(.55);

const prims = [];
for (const g of BONES) {
  const posAcc = doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.pos)).setBuffer(buffer);
  const nrmAcc = doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals(g.pos, g.idx))).setBuffer(buffer);
  const idxAcc = doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(g.idx)).setBuffer(buffer);
  prims.push(doc.createPrimitive().setAttribute('POSITION', posAcc).setAttribute('NORMAL', nrmAcc).setIndices(idxAcc).setMaterial(mat));
}
const mesh = doc.createMesh('Skeleton');
prims.forEach(p => mesh.addPrimitive(p));
const node = doc.createNode('Skeleton').setMesh(mesh);
const scene = doc.createScene('Scene').addChild(node);
doc.getRoot().setDefaultScene(scene);

await new NodeIO().write('skeleton.glb', doc);

/* ─────────── تحقق: قراه تاني ─────────── */
const back = await new NodeIO().read('skeleton.glb');
const m = back.getRoot().listMeshes()[0];
console.log('nodes:', back.getRoot().listNodes().length,
  '| primitives:', m.listPrimitives().length,
  '| materials:', back.getRoot().listMaterials().map(x => x.getName()).join(','));
