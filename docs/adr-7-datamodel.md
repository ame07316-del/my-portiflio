# ADR — برومبت 7: نموذج البيانات والمحتوى

## الكيانات

```
Project {
  id, slug, order:int,
  status: draft | published | in_progress | archived,
  kind:   client | lab,
  title:  {ar, en},  desc: {ar, en},
  role:   {ar, en}?          ← اختياري؛ يُعرض «بانتظار التأكيد» لو فارغ
  tech:   string[]           ← تقنيات مؤكدة فقط
  links:  {live?, repo?}     ← صيغة URL تُتحقق
  images: [{path, alt:{ar,en}}],
  note:   {ar, en}?          ← حدود صادقة (مثل: الدفع Sandbox)
  createdAt, updatedAt
}
Sections  [{id, visible:bool, order:int}]        ← ترتيب وظهور أقسام الرئيسية
Settings  {contact:{email, whatsapp, github},
           seo:{title:{ar,en}, desc:{ar,en}},
           theme: dark | light}                  ← خيارات مظهر محدودة وآمنة
Media     [{name, path, bytes, usedBy:string[]}]
Version   {projectId, at, snapshot}              ← آخر 12 نسخة
Changelog [{at, action, entity, by}]
```

## قواعد النشر (تُفرض على السيرفر)

1. **مشروع `in_progress` لا يُنشر كمكتمل** → 409 برسالة واضحة.
2. **ترجمة ناقصة** → النشر يرجع تحذيرات؛ اللوحة تطلب تأكيدًا صريحًا ثانيًا قبل التنفيذ.
3. **حقول ناقصة في مسودة** → تُعرض كعدّاد «حقول مطلوبة» في المحرر قبل أي نشر.
4. **صورة مستخدمة لا تُحذف** → 409 بقائمة المواضع.
5. **كل حفظ ينشئ نسخة**؛ الاستعادة تنسخ الحالة الحالية كنسخة جديدة أولًا (لا فقدان).
6. **كل تعديل يسجَّل** في Changelog بفعل وكائن ووقت.

## معالجة الحقول الناقصة
- مسودة: أي حقل فارغ مسموح، ويظهر في عدّاد النقص.
- نشر: title/desc باللغتين + status صالح + kind = إلزامية.
- role فارغ → الواجهة العامة تعرض شارة «الدور: بانتظار التأكيد» بدل اختلاق دور.

## ما لا نفترضه
لا CDC، لا sharding، لا قواعد متعددة، لا مزامنة موزعة — مالك واحد وخادم واحد.
