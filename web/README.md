# Sovereign Edge UI — المرحلة الأولى (Phase 1)

إعادة البناء الكامل للواجهة وفق بروتوكول **Sovereign Edge & V8-Optimized UI**:
حالة التطبيق بالكامل خارج الـ Main Thread، تشفير وحسابات ثقيلة في WASM،
وواجهة تفاؤلية محلية-أولًا (Local-First) لا تنتظر الشبكة أبدًا.

**صفر اعتماديات وقت تشغيل.** الأدوات الوحيدة في `devDependencies`:
`typescript` (مترجم) و`@types/node` (أنواع فقط). لا إطار عمل، لا مجمّع
(bundler) — وحدات ES أصلية يخدمها المتصفح مباشرة.

---

## البنية (dataflow باتجاه واحد)

```
┌ Main Thread — PAINT ONLY ─────────────────────────────────────────┐
│ index.html (skeleton, CLS=0) → boot.ts                            │
│   signal effects → dom-batch (rAF, reads→writes) → DOM            │
│   HUD rAF loop ← SpscRing (SharedArrayBuffer, lock-free)          │
│   morph-bench canvas ← SAB frame buffer (zero-copy)               │
└──────────────▲───────────────────────────────│────────────────────┘
        binary frames {bin: ArrayBuffer}   binary frames {bin, sab?}
┌──────────────│───────────────────────────────▼────────────────────┐
│ SharedWorker (fallback: Worker) — THE SOVEREIGN STATE NODE        │
│  protocol.ts (binary, لا JSON) → validate.ts (حدود قبل الحجز)     │
│  crdt.ts (LWW بطابعين: وجود/حقول) → state-node.ts                 │
│  Optimistic apply → oplog → SyncAdapter.commit                    │
│     ├─ ok  → OpCommit + حذف من الـ oplog                          │
│     └─ fail→ inverse ops (تراجع حتمي) + Patch + OpReject          │
│  IndexedDB: snapshot + oplog (تعافٍ من الانهيار بإعادة التشغيل)   │
│  core.wasm: fnv1a32 / ct_eq / f32_morph                           │
└────────────────────────────────────────────────────────────────────┘
```

## دليل الملفات والتعقيد (Big-O)

| الملف | الدور | التعقيد |
|---|---|---|
| `core/bounds.ts` | ميزانيات الذاكرة والرسائل (فحص قبل أي حجز) | O(1) |
| `core/validate.ts` | مخططات صارمة بديلة لـ Zod: طول البايتات يُحسب دون تخصيص، وحدود المصفوفات تُفحص قبل إنشائها | parse: O(input)، مساحة إضافية O(1) |
| `core/lru.ts` | LRU على ترتيب إدراج `Map` مباشرة (بلا عقد قائمة مزدوجة) | O(1) لكل عملية، O(capacity) |
| `core/fsm.ts` | آلة حالات دورة حياة التطبيق؛ الانتقال غير القانوني يرمي خطأ | send: O(1) |
| `core/ring.ts` | SPSC Ring Buffer فوق SharedArrayBuffer بلا أقفال؛ مؤشران على خطي كاش منفصلين (64B)؛ عند الامتلاء **إسقاط** بدل الحظر | O(1) لكل عملية |
| `core/crdt.ts` | LWW بأختام (Lamport, actor): طابع `live` وطابع `dead` لكل سجل — الوجود يُشتق من المقارنة فلا يستطيع أي وصول متأخر قلبه؛ تقارب مبرهن (تبديلية/تجميعية/عدم تغيير) باختبار عشوائي | لكل عملية O(1)، دفعة k: O(k) |
| `core/protocol.ts` | بروتوكول ثنائي (بديل JSON على المسار الساخن)؛ بادئات أطوال تُتحقق مقابل الميزانية **قبل** التخصيص | ترميز/فك: O(payload) |
| `core/idb.ts` / `core/storage.ts` | تخزين محلي: `snapshot + oplog` بمخطط ثابت (مكافئ Prepared Statements)؛ `MemoryStorage` للاختبارات | حسب فهارس IndexedDB |
| `runtime/signal.ts` | إشارات دقيقة الحبيبات: تعديل يُعلِّم الأتباع فقط، بلا diff ولا إعادة رسم مكونات؛ تجميع بالـ batch | set: O(1) + O(الحواف المتسخة) عند التفريغ |
| `runtime/dom-batch.ts` | مجدول rAF: تفويض بالقيم، القراءة قبل الكتابة دائمًا (منع الاهتزاز)، مراقبة ميزانية 8ms | O(المهام)/إطار |
| `runtime/wasm-core.ts` | غلاف مكتوب بدقة حول `core.wasm` مع نمو صفحات محكوم بميزانية 16MiB | fnv/ctEq/morph: O(len) داخل WASM |
| `tools/wasm-assemble.mjs` | مجمّع WASM يدوي (بلا wabt/emscripten): يبعث البايتات مباشرة ويختبر ذاته قبل الكتابة | O(1) |
| `worker/state-node.ts` | المحرك السيادي: تحقق → طابع → تطبيق تفاؤلي → تراجع بعمليات عكسية مختومة بعد الأصل | لكل رسالة O(payload) |
| `worker/state-worker.ts` | غلاف متصفح رفيع (SharedWorker ثم fallback) | O(1) |
| `worker/sync-adapter.ts` | عقد المزامنة؛ `MockSyncAdapter` بزمن استجابة وفشل قابلين للضبط (يُستبدل ببوابة QUIC في المرحلة 2 دون لمس المحرك) | O(1) + زمن الشبكة |
| `client/store.ts` | مرآة الحالة على الخيط الرئيسي كإشارات؛ الإقرار/الرفض يديران `pending` | لكل Patch: O(السجلات) |
| `components/keyed-list.ts` | مصالحة DOM بالقيم: بلا DOM افتراضي ولا `innerHTML` متكرر | O(n) لكل تمريرة |
| `components/section-projects.ts` | CRUD تفاؤلي كامل (إضافة/تعديل/حذف/تبديل حالة) مع تراجع مرئي | لكل إيماءة: O(1) إرسال |
| `components/morph-bench.ts` | برهان عزل الخيط الرئيسي: 8192 نقطة تُحسب في العامل عبر WASM وتُرسم من SAB مباشرة | لكل إطار: O(N + W·H) |

## ضمانات المرحلة الأولى وكيف تحققت

1. **الحالة داخل Shared Worker، والرسم فقط على الـ Main Thread** — لا يوجد في `boot.ts` أي منطق حالة؛ كل قرار في `state-node.ts`.
2. **Optimistic UI + تراجع حتمي** — العمليات العكسية تُختم بعد العملية الأصلية فتفوز دائمًا في ترتيب LWW؛ الاختبار التكاملـي `state-node.test.ts` يفرض المسار كاملًا.
3. **CRDT + IndexedDB = Offline-First** — إعادة إقلاع تعيد بث الـ snapshot ثم تعيد تشغيل الـ oplog؛ لا تضيع كتابة محلية (اختبار "التعافي من الانهيار").
4. **CLS = 0** — الهندسة المحجوزة في `index.html` تساوي الهندسة المائية تمامًا (صفوف 56px، لوحات بحدود دنيا ثابتة، `scrollbar-gutter: stable`).
5. **WASM للعمليات الثقيلة** — `f32_morph` و`fnv1a32` و`ct_eq` (مقارنة ثابتة الزمن تمهيدًا للمرحلة 5) مجمّعة يدويًا ومختبرة مقابل مراجع JS.
6. **Type-Safety وحدود الذاكرة** — `strict + noUncheckedIndexedAccess`، وكل تخصيص يسبقه تحقق من الحدود (`bounds.ts`).

## التشغيل

```bash
cd web
npm install          # أدوات التطوير فقط (typescript)
npm test             # 54 اختبارًا: وحدات + تكامل عبر البروتوكول الثنائي الفعلي
npm run serve        # http://0.0.0.0:8080 مع ترويسات COOP/COEP لتفعيل SharedArrayBuffer
```

> النشر على Vercel لاحقًا كموقع ثابت + ترويسات العزل؛ الخدمات الحرجة
> (المرحلة 2 وما بعدها) على الخادم المستقل وفق قرار النشر الهجين.

## الربط مع الخادم السيادي (تم — المراحل 2-6 في `../server`)

`SyncAdapter` استُبدل فعليًا عند الطلب: عرّف `globalThis.SYNC_URL` في
الصفحة قبل إقلاع العامل ليتم ترحيل كل عملية CRDT عبر `HttpSyncAdapter`
إلى نقطة `/ops` في مستوى التحكم (`../server`) — حيث تُختم وتُكتب في
PostgreSQL مع صف Outbox ذري. بدون `SYNC_URL` يعمل `MockSyncAdapter`
المحلي بزمن استجابة وفشل محاكى. الخادم نفسه يوثق في `../server/README.md`.
