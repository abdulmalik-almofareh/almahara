# المهرة — منصة إدارة حلقات تحفيظ القرآن

منصة ويب مستقلة على دومينك، فيها:

- **تسجيل الدخول** بحساب Google أو برمز يصل إلى البريد. لا توجد كلمات مرور.
- **دعوات بالبريد:** المشرف يدعو معلماً أو ولي أمر، فتصله رسالة، يضغطها، يسجّل، وينضم بالدور المحدد تلقائياً.
- **أدوار:**
  - المالك.
  - مشرف: يدير الفصول والطلاب والدعوات.
  - معلم: يضيف الواجبات ويسمّع.
  - ولي أمر: يرى أبناءه فقط.
- **لوحة المعلم:** جدول أسبوعي للواجبات (درس جديد، مراجعة جديدة، مراجعة سابقة، قراءة، القاعدة).
- **التسميع على المصحف** (حفص، صفحات مصحف المدينة): تسجيل الخطأ على الكلمة أو على حرف بعينه أو على الحركات فقط.
- **ملف الطالب:** سجل الواجبات، وملخص الأخطاء، والتقدم وخريطة الإتقان، وملخص يومي لولي الأمر.

الصلاحيات مطبّقة داخل قاعدة البيانات نفسها، فلا يستطيع أحد تجاوزها حتى لو عبث بالموقع.

---

## ما الذي تحتاجه (كله مجاني في البداية عدا الدومين)

| الخدمة | لماذا | التكلفة |
|---|---|---|
| **GitHub** | يحفظ الكود | مجاني |
| **Supabase** | قاعدة البيانات وتسجيل الدخول | مجاني حتى ٥٠ ألف مستخدم شهرياً |
| **Vercel** | يستضيف الموقع | مجاني للاستخدام الشخصي |
| **Resend** | يرسل رسائل الدعوات ورموز الدخول | مجاني حتى ٣٠٠٠ رسالة شهرياً |
| **Google Cloud** | زر «الدخول بحساب Google» | مجاني |
| **الدومين** | اسم موقعك | تقريباً ١٠–٢٠ دولاراً سنوياً |

> التسعير قد يتغير؛ راجع صفحات الأسعار عند التسجيل.

خصّص ساعة تقريباً للإعداد أول مرة. اتبع الخطوات بالترتيب.

---

## الخطوة ١: ارفع الكود إلى GitHub

1. فك ضغط الملف `almahara.zip` على جهازك.
2. افتح مستودعك: `github.com/abdulmlekasiri/almahara`
3. اضغط **uploading an existing file** (أو **Add file → Upload files**).
4. افتح المجلد الذي فككته، **حدّد كل ما بداخله** واسحبه إلى الصفحة.
   - على الماك: الملفات التي تبدأ بنقطة (`.gitignore` و`.env.example`) مخفية. اضغط `Cmd + Shift + .` في Finder لإظهارها ثم حددها مع الباقي.
5. انزل لأسفل واضغط **Commit changes**.

---

## الخطوة ٢: أنشئ قاعدة البيانات في Supabase

1. سجّل في [supabase.com](https://supabase.com) (يمكنك الدخول بحساب GitHub).
2. **New project:**
   - الاسم: `almahara`.
   - كلمة مرور قاعدة البيانات: احفظها في مكان آمن.
   - المنطقة: اختر الأقرب، مثل **Frankfurt** أو **Mumbai**.
3. بعد اكتمال الإنشاء: من القائمة الجانبية **SQL Editor → New query**.
4. افتح الملف `supabase/schema.sql` من الكود، انسخ محتواه كاملاً، الصقه، ثم اضغط **Run**. يجب أن تظهر رسالة نجاح (Success).
5. من **Project Settings → API Keys** انسخ القيمتين التاليتين واحفظهما:
   - **Project URL**، وشكله `https://xxxx.supabase.co`.
   - **Publishable key**، ويبدأ بـ `sb_publishable_`.

---

## الخطوة ٣: اشترِ الدومين وانشر الموقع على Vercel

1. سجّل في [vercel.com](https://vercel.com) **بحساب GitHub**.
2. **Add New → Project** ← اختر مستودع `almahara` ← **Import**.
3. قبل الضغط على Deploy، افتح **Environment Variables** وأضف المتغيرات التالية (التفاصيل في `.env.example`):

| الاسم | القيمة |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL من الخطوة ٢ |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key من الخطوة ٢ |
| `NEXT_PUBLIC_SITE_URL` | رابط موقعك النهائي، مثل `https://almahara.com` |
| `RESEND_API_KEY` | تضيفه في الخطوة ٥ |
| `EMAIL_FROM` | تضيفه في الخطوة ٥، مثل `المهرة <noreply@almahara.com>` |

4. اضغط **Deploy**. بعد دقيقة يصبح لديك رابط مؤقت مثل `almahara.vercel.app`.
5. **الدومين:** من المشروع في Vercel ← **Settings → Domains**.
   - **إن لم تشترِ دوميناً بعد:** اكتب الاسم الذي تريده، مثل `almahara.com`، واشترِه من Vercel مباشرة. يُربط تلقائياً دون أي إعداد.
   - **إن اشتريته من موقع آخر** (مثل Namecheap أو GoDaddy): أضفه هنا، ثم انسخ سجلات DNS التي يعرضها Vercel إلى لوحة الموقع الذي اشتريت منه.
6. بعد ربط الدومين: عدّل `NEXT_PUBLIC_SITE_URL` إلى الدومين، ثم من **Deployments** أعد النشر (**Redeploy**).

---

## الخطوة ٤: اربط روابط الموقع في Supabase

في Supabase: **Authentication → URL Configuration**

- **Site URL:** `https://almahara.com` (دومينك).
- **Redirect URLs:** أضف الرابطين التاليين:
  - `https://almahara.com/**`
  - `https://*.vercel.app/**`

---

## الخطوة ٥: البريد (Resend)

1. سجّل في [resend.com](https://resend.com).
2. **Domains → Add Domain** ← اكتب دومينك.
   - يعرض لك Resend سجلات DNS. أضفها في **Vercel → Domains → دومينك → DNS Records** (أو في لوحة الموقع الذي اشتريت منه الدومين).
   - انتظر حتى تظهر الحالة **Verified**.
3. **API Keys → Create API Key** ← انسخ المفتاح، ويبدأ بـ `re_`.
4. في Vercel أضف المتغيرين `RESEND_API_KEY` و`EMAIL_FROM` ثم أعد النشر. بهذا تُرسَل **رسائل الدعوات**.
5. في Supabase اذهب إلى **Authentication → Emails → SMTP Settings** وفعّل **Custom SMTP**. بهذا تُرسَل **رموز الدخول**:

| الحقل | القيمة |
|---|---|
| Sender email | `noreply@almahara.com` |
| Sender name | `المهرة` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | مفتاح Resend نفسه |

6. في **Authentication → Emails → Templates**:
   - افتح **Magic link** والصق محتوى الملف `supabase/email-templates/magic-link.html`.
   - اجعل العنوان (Subject): `رمز الدخول إلى المهرة: {{ .Token }}`
   - كرر الشيء نفسه في **Confirm signup**.

> بدون الخطوة ٥ تعمل المنصة، لكن: الدعوات تُنشأ ويظهر لك رابطها لترسله بنفسك (واتساب مثلاً)، ورموز الدخول بالبريد محدودة جداً من Supabase.

---

## الخطوة ٦: زر الدخول بحساب Google

1. ادخل [console.cloud.google.com](https://console.cloud.google.com) وأنشئ مشروعاً جديداً باسم `almahara`.
2. **Google Auth Platform** (أو **APIs & Services → OAuth consent screen**):
   - اسم التطبيق: `المهرة`.
   - بريد الدعم: بريدك.
   - نوع المستخدمين: **External**.
3. **Clients → Create client:**
   - النوع: **Web application**.
   - **Authorized JavaScript origins:** `https://almahara.com`
   - **Authorized redirect URIs:** الرابط الذي تجده في Supabase تحت **Authentication → Sign In / Providers → Google**، وشكله `https://xxxx.supabase.co/auth/v1/callback`.
4. انسخ **Client ID** و**Client Secret**.
5. في Supabase افتح **Authentication → Sign In / Providers → Google**:
   - فعّله.
   - الصق القيمتين.
   - اضغط **Save**.
6. ارجع إلى Google وانشر التطبيق (**Publish app**) حتى يستطيع أي شخص الدخول، لا حسابات الاختبار فقط.

---

## الخطوة ٧: ابدأ الاستخدام

1. افتح موقعك وسجّل الدخول.
2. أنشئ مدرستك؛ ستكون **المالك**.
3. من **الفصول** أنشئ الفصول، ثم من **الطلاب** أضف الطلاب.
4. من **الأعضاء والدعوات** ادعُ المعلمين والمشرفين وأولياء الأمور. لولي الأمر حدّد أبناءه.
5. كل مدعو تصله رسالة فيها زر «قبول الدعوة». يسجّل بحساب Google أو برمز البريد، وينضم مباشرة.

> **مهم:** يجب أن يسجّل المدعو بنفس البريد الذي وصلته عليه الدعوة.

---

## تحديثات قاعدة البيانات

بعض التحديثات تحتاج تعديلاً على قاعدة البيانات، وتأتي كملفات مرقّمة في `supabase/migrations/`. شغّل كل ملف جديد **مرة واحدة** بالترتيب، بنفس طريقة `schema.sql`: افتح SQL Editor، ثم New query، والصق المحتوى، واضغط Run.

| الملف | ما يضيفه |
|---|---|
| `002_student_comments_log.sql` | دور الطالب، والتعليقات، وسجل التغييرات، وتأكيد مراجعة الأخطاء |
| `003_teachers_types_tags_settings.sql` | إسناد المعلمين للحلقات، وأنواع الواجبات لكل طالب، والوسوم، وشعار المدرسة، ونقل الملكية |
| `004_protect_owner.sql` | يمنع أي شخص غير المالك من تعديل صلاحيات المالك |

## التعديل لاحقاً

اطلب أي تعديل من Claude وأرسل له الملف الذي تريد تعديله أو المشروع كاملاً. بعد التعديل ارفع الملفات المعدّلة إلى GitHub بنفس طريقة الخطوة ١، وسيعيد Vercel نشر الموقع تلقائياً خلال دقيقة.

## للمطورين

```bash
cp .env.example .env.local   # ثم ضع القيم
npm install
npm run dev                  # http://localhost:3000
```

- **التقنيات:** Next.js 16 (App Router)، و`@supabase/ssr`، وPostgres مع Row Level Security.
- **ملفات مهمة:**
  - `supabase/schema.sql`: الجداول والصلاحيات ودوال الدعوات.
  - `components/Platform.tsx`: الواجهة الرئيسية.
  - `components/Assignment.tsx`: إنشاء الواجبات والتسميع.
  - `app/api/invite/route.ts`: إرسال الدعوات.
- **بيانات المصحف:** `public/quran.json`.
  - النص برواية حفص من حزمة [quran-json](https://github.com/risan/quran-json)، بترخيص CC BY 4.0.
  - حدود الأجزاء من حزمة [quran-meta](https://www.npmjs.com/package/quran-meta)، بترخيص MIT.
  - عرض المصحف بخطوط مجمع الملك فهد (QCF4) وبيانات حزمة [quran-qcf4](https://www.npmjs.com/package/quran-qcf4) (البيانات MIT)، تُحمَّل من jsDelivr. الخطوط للعرض القرآني فقط، والاستخدام التجاري يحتاج إذن المجمع.
