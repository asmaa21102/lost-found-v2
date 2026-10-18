// Server-side translations (English, Arabic, Turkish).
// The browser sends its language in the X-Lang header; it is kept for the whole request
// (AsyncLocalStorage), so error messages, notifications, match reasons and category
// names come back in the reader's language without passing `lang` around.
const { AsyncLocalStorage } = require("async_hooks");

const LANGS = ["en", "ar", "tr"];
const als = new AsyncLocalStorage();
const pick = (v) => (LANGS.includes(v) ? v : "en");
const current = () => als.getStore()?.lang || "en";

function middleware(req, res, next) {
  req.lang = pick(String(req.get("X-Lang") || "").slice(0, 2));
  als.run({ lang: req.lang }, next);
}

const fill = (s, p = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p[k] ?? ""));

// ── Categories and colours ──────────────────────────────────────────────
const CATEGORY = {
  phone: { ar: "هواتف", tr: "Telefon" },
  wallet: { ar: "محافظ وحقائب يد صغيرة", tr: "Cüzdan" },
  keys: { ar: "مفاتيح", tr: "Anahtar" },
  bag: { ar: "حقائب وشنط ظهر", tr: "Çanta ve sırt çantası" },
  laptop: { ar: "لابتوب وتابلت", tr: "Dizüstü ve tablet" },
  audio: { ar: "سماعات", tr: "Kulaklık" },
  electronics: { ar: "إلكترونيات أخرى", tr: "Diğer elektronik" },
  glasses: { ar: "نظارات", tr: "Gözlük" },
  watch: { ar: "ساعات", tr: "Saat" },
  jewelry: { ar: "مجوهرات", tr: "Takı" },
  documents: { ar: "بطاقات ووثائق", tr: "Kimlik ve belgeler" },
  clothing: { ar: "ملابس", tr: "Giyim" },
  books: { ar: "كتب ودفاتر", tr: "Kitap ve defter" },
  bottle: { ar: "قوارير وأكواب", tr: "Şişe ve bardak" },
  umbrella: { ar: "مظلات", tr: "Şemsiye" },
  toys: { ar: "ألعاب", tr: "Oyuncak" },
  sports: { ar: "رياضة ودراجات", tr: "Spor ve bisiklet" },
  other: { ar: "أخرى", tr: "Diğer" },
};
const COLOR = {
  black: { ar: "أسود", tr: "Siyah" }, white: { ar: "أبيض", tr: "Beyaz" }, grey: { ar: "رمادي", tr: "Gri" },
  silver: { ar: "فضي", tr: "Gümüş" }, gold: { ar: "ذهبي", tr: "Altın" }, brown: { ar: "بني", tr: "Kahverengi" },
  beige: { ar: "بيج", tr: "Bej" }, red: { ar: "أحمر", tr: "Kırmızı" }, orange: { ar: "برتقالي", tr: "Turuncu" },
  yellow: { ar: "أصفر", tr: "Sarı" }, green: { ar: "أخضر", tr: "Yeşil" }, blue: { ar: "أزرق", tr: "Mavi" },
  navy: { ar: "كحلي", tr: "Lacivert" }, purple: { ar: "بنفسجي", tr: "Mor" }, pink: { ar: "وردي", tr: "Pembe" },
  multicolor: { ar: "متعدد الألوان", tr: "Çok renkli" }, transparent: { ar: "شفاف", tr: "Şeffaf" },
};
const categoryLabel = (slug, en, lang = current()) => (lang === "en" ? en : CATEGORY[slug]?.[lang] || en);
const colorLabel = (slug, en, lang = current()) => (lang === "en" ? en : COLOR[slug]?.[lang] || en);

// ── Messages (exact English text → translations) ────────────────────────
const M = {
  "Please sign in to continue": ["يرجى تسجيل الدخول للمتابعة", "Devam etmek için lütfen giriş yapın"],
  "Administrators only": ["للمسؤولين فقط", "Yalnızca yöneticiler"],
  "Request blocked": ["تم حظر الطلب", "İstek engellendi"],
  "Not found": ["غير موجود", "Bulunamadı"],
  "Not allowed": ["غير مسموح", "İzin verilmiyor"],
  "Something went wrong on our side. Please try again.": ["حدث خطأ من جهتنا. حاول مرة أخرى.", "Bizim tarafımızda bir sorun oluştu. Lütfen tekrar deneyin."],
  "Please fix the highlighted fields": ["يرجى تصحيح الحقول المحددة", "Lütfen işaretli alanları düzeltin"],
  "Registration failed": ["فشل التسجيل", "Kayıt başarısız"],
  "Use letters, numbers, dots or underscores": ["استخدم حروفًا وأرقامًا ونقاطًا أو شرطة سفلية", "Harf, rakam, nokta veya alt çizgi kullanın"],
  "Use at least one letter and one number": ["استخدم حرفًا واحدًا ورقمًا واحدًا على الأقل", "En az bir harf ve bir rakam kullanın"],
  "Please accept the privacy notice": ["يرجى الموافقة على إشعار الخصوصية", "Lütfen gizlilik bildirimini kabul edin"],
  "This username is taken": ["اسم المستخدم مستخدم من قبل", "Bu kullanıcı adı alınmış"],
  "An account with this email already exists": ["يوجد حساب بهذا البريد الإلكتروني", "Bu e-posta ile bir hesap zaten var"],
  "Account already exists": ["الحساب موجود مسبقًا", "Hesap zaten var"],
  "Enter your username or email and password": ["أدخل اسم المستخدم أو البريد وكلمة المرور", "Kullanıcı adınızı veya e-postanızı ve şifrenizi girin"],
  "Wrong username or password": ["اسم المستخدم أو كلمة المرور غير صحيحة", "Kullanıcı adı veya şifre yanlış"],
  "This account is suspended. Contact the administrator.": ["هذا الحساب موقوف. تواصل مع المسؤول.", "Bu hesap askıya alındı. Yöneticiyle iletişime geçin."],
  "Enter a valid email address": ["أدخل بريدًا إلكترونيًا صحيحًا", "Geçerli bir e-posta adresi girin"],
  "Current password is wrong": ["كلمة المرور الحالية غير صحيحة", "Mevcut şifre yanlış"],
  "At least 8 characters with a letter and a number": ["8 أحرف على الأقل مع حرف ورقم", "Harf ve rakam içeren en az 8 karakter"],
  "Password is wrong": ["كلمة المرور غير صحيحة", "Şifre yanlış"],
  "You are the only administrator. Make someone else an administrator first.": ["أنت المسؤول الوحيد. اجعل شخصًا آخر مسؤولًا أولًا.", "Tek yönetici sizsiniz. Önce başka birini yönetici yapın."],
  "This email is used by another account": ["هذا البريد مستخدم في حساب آخر", "Bu e-posta başka bir hesapta kullanılıyor"],
  "Too many attempts. Try again later.": ["محاولات كثيرة. حاول لاحقًا.", "Çok fazla deneme. Daha sonra tekrar deneyin."],
  "Too many sign-in attempts. Try again in 15 minutes.": ["محاولات دخول كثيرة. حاول بعد 15 دقيقة.", "Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin."],
  "Too many accounts created from this network. Try again later.": ["تم إنشاء حسابات كثيرة من هذه الشبكة. حاول لاحقًا.", "Bu ağdan çok fazla hesap oluşturuldu. Daha sonra tekrar deneyin."],
  "You've posted many reports in a short time. Please wait a bit before posting more.": ["نشرت بلاغات كثيرة في وقت قصير. انتظر قليلًا قبل نشر المزيد.", "Kısa sürede çok fazla bildirim gönderdiniz. Lütfen biraz bekleyin."],
  "Too many photo searches. Please wait a few minutes.": ["عمليات بحث بالصور كثيرة. انتظر بضع دقائق.", "Çok fazla fotoğraf araması. Lütfen birkaç dakika bekleyin."],
  "Too many requests sent. Please wait before sending more.": ["أرسلت طلبات كثيرة. انتظر قبل إرسال المزيد.", "Çok fazla talep gönderildi. Lütfen bekleyin."],
  "You're sending messages too quickly.": ["ترسل الرسائل بسرعة كبيرة.", "Mesajları çok hızlı gönderiyorsunuz."],
  "Too many reports sent. Please wait.": ["أرسلت بلاغات كثيرة. انتظر قليلًا.", "Çok fazla şikâyet gönderildi. Lütfen bekleyin."],
  "Report could not be saved": ["تعذّر حفظ البلاغ", "Bildirim kaydedilemedi"],
  "Pick the place on the map again": ["اختر المكان على الخريطة مرة أخرى", "Yeri haritadan tekrar seçin"],
  "You already reported this item today. Edit the existing report instead.": ["أبلغت عن هذا الغرض اليوم. عدّل البلاغ الموجود بدلًا من ذلك.", "Bu eşyayı bugün zaten bildirdiniz. Bunun yerine mevcut bildirimi düzenleyin."],
  "Duplicate of a report you posted today": ["مكرر لبلاغ نشرته اليوم", "Bugün gönderdiğiniz bir bildirimin kopyası"],
  "This report doesn't exist or was removed": ["هذا البلاغ غير موجود أو تم حذفه", "Bu bildirim yok veya kaldırıldı"],
  "You can only edit your own reports": ["يمكنك تعديل بلاغاتك فقط", "Yalnızca kendi bildirimlerinizi düzenleyebilirsiniz"],
  "This report was removed by an administrator": ["حذف المسؤول هذا البلاغ", "Bu bildirim bir yönetici tarafından kaldırıldı"],
  "Too many photos": ["صور كثيرة", "Çok fazla fotoğraf"],
  "You can only change your own reports": ["يمكنك تغيير بلاغاتك فقط", "Yalnızca kendi bildirimlerinizi değiştirebilirsiniz"],
  "That status isn't allowed for this report": ["هذه الحالة غير مسموحة لهذا البلاغ", "Bu durum bu bildirim için geçerli değil"],
  "An administrator has to review this report first": ["يجب أن يراجع المسؤول هذا البلاغ أولًا", "Bu bildirimin önce bir yönetici tarafından incelenmesi gerekiyor"],
  "You can only delete your own reports": ["يمكنك حذف بلاغاتك فقط", "Yalnızca kendi bildirimlerinizi silebilirsiniz"],
  "A return request for this item is in progress. Close the report instead of deleting it.": ["يوجد طلب استرجاع جارٍ لهذا الغرض. أغلق البلاغ بدلًا من حذفه.", "Bu eşya için bir iade talebi sürüyor. Silmek yerine bildirimi kapatın."],
  "Choose a photo first": ["اختر صورة أولًا", "Önce bir fotoğraf seçin"],
  "Choose a photo to search with": ["اختر صورة للبحث بها", "Aramak için bir fotoğraf seçin"],
  "Photo search is turned off on this server": ["البحث بالصورة متوقف على هذا الخادم", "Fotoğrafla arama bu sunucuda kapalı"],
  "The AI model is still starting up. Try again in a few seconds.": ["نموذج الذكاء الاصطناعي ما زال يبدأ. حاول بعد ثوانٍ.", "Yapay zekâ modeli hâlâ başlatılıyor. Birkaç saniye sonra tekrar deneyin."],
  "One of the files is not a valid image": ["أحد الملفات ليس صورة صالحة", "Dosyalardan biri geçerli bir görüntü değil"],
  "Only JPG, PNG or WebP photos are allowed": ["يُسمح فقط بصور JPG أو PNG أو WebP", "Yalnızca JPG, PNG veya WebP fotoğraflara izin verilir"],
  "Photos must be at least 120×120 pixels": ["يجب أن تكون الصور 120×120 بكسل على الأقل", "Fotoğraflar en az 120×120 piksel olmalı"],
  "Upload failed": ["فشل الرفع", "Yükleme başarısız"],
  "This report isn't accepting requests right now": ["هذا البلاغ لا يستقبل طلبات حاليًا", "Bu bildirim şu anda talep kabul etmiyor"],
  "This is your own report": ["هذا بلاغك أنت", "Bu sizin kendi bildiriminiz"],
  "You already have an open request for this item": ["لديك طلب مفتوح لهذا الغرض", "Bu eşya için zaten açık bir talebiniz var"],
  "Request not found": ["الطلب غير موجود", "Talep bulunamadı"],
  "You can't change this request to that status": ["لا يمكنك تغيير هذا الطلب إلى هذه الحالة", "Bu talebi bu duruma getiremezsiniz"],
  "Please add a short reason": ["أضف سببًا قصيرًا", "Lütfen kısa bir neden ekleyin"],
  "Please add a short reason for the other person": ["أضف سببًا قصيرًا للطرف الآخر", "Lütfen karşı taraf için kısa bir neden ekleyin"],
  "This request can't be disputed": ["لا يمكن الاعتراض على هذا الطلب", "Bu talebe itiraz edilemez"],
  "This conversation is closed": ["هذه المحادثة مغلقة", "Bu konuşma kapandı"],
  "Match not found": ["المطابقة غير موجودة", "Eşleşme bulunamadı"],
  "Choose yes or no": ["اختر نعم أو لا", "Evet veya hayır seçin"],
  "Missing target": ["الهدف غير محدد", "Hedef eksik"],
  "Report not found": ["البلاغ غير موجود", "Bildirim bulunamadı"],
  "Unknown decision": ["قرار غير معروف", "Bilinmeyen karar"],
  "Add a reason so the reporter knows why": ["أضف سببًا حتى يعرف صاحب البلاغ", "Bildiren kişinin bilmesi için bir neden ekleyin"],
  "Required": ["مطلوب", "Zorunlu"],
  "User not found": ["المستخدم غير موجود", "Kullanıcı bulunamadı"],
  "You can't change your own account here": ["لا يمكنك تغيير حسابك من هنا", "Kendi hesabınızı burada değiştiremezsiniz"],
  "Nothing to change": ["لا يوجد ما يتغير", "Değiştirilecek bir şey yok"],
  "Choose keep or dismiss": ["اختر إبقاء أو تجاهل", "Tutmayı veya yok saymayı seçin"],
  "Choose resolved or dismissed": ["اختر تمت المعالجة أو تجاهل", "Çözüldü veya yok sayıldı seçin"],
  "Unknown moderation mode": ["وضع مراجعة غير معروف", "Bilinmeyen denetim modu"],
  // moderation notes
  "Contains a link": ["يحتوي على رابط", "Bağlantı içeriyor"],
  "Contains a phone number (keep contact details private)": ["يحتوي على رقم هاتف (أبقِ بيانات التواصل خاصة)", "Telefon numarası içeriyor (iletişim bilgilerini gizli tutun)"],
  "Contains an email address": ["يحتوي على بريد إلكتروني", "E-posta adresi içeriyor"],
  "Waiting for approval": ["بانتظار الموافقة", "Onay bekleniyor"],
  "Hidden after several reports from users": ["أُخفي بعد عدة بلاغات من المستخدمين", "Kullanıcılardan gelen birkaç şikâyetten sonra gizlendi"],
  "Account suspended": ["الحساب موقوف", "Hesap askıya alındı"],
  "Closed automatically after 6 months without updates": ["أُغلق تلقائيًا بعد 6 أشهر بدون تحديث", "6 ay güncellenmediği için otomatik kapatıldı"],
  // claim history notes
  "Ownership request sent": ["أُرسل طلب الملكية", "Sahiplik talebi gönderildi"],
  "Finder response sent": ["أُرسل رد من وجد الغرض", "Bulan kişinin yanıtı gönderildi"],
  "Approved by the item's reporter, waiting for administrator verification": ["وافق صاحب البلاغ، بانتظار تحقق المسؤول", "Bildiren kişi onayladı, yönetici doğrulaması bekleniyor"],
  "The item was returned through another request": ["أُعيد الغرض عن طريق طلب آخر", "Eşya başka bir talep aracılığıyla iade edildi"],
  "Dispute reviewed by an administrator": ["راجع المسؤول الاعتراض", "İtiraz bir yönetici tarafından incelendi"],
  "Administrator": ["المسؤول", "Yönetici"],
  "System": ["النظام", "Sistem"],
  "You": ["أنت", "Siz"],
  "Anonymous": ["مجهول", "Anonim"],
};

// Field labels used inside validation messages.
const LABEL = {
  "Full name": ["الاسم الكامل", "Ad soyad"], Username: ["اسم المستخدم", "Kullanıcı adı"], Email: ["البريد الإلكتروني", "E-posta"],
  Password: ["كلمة المرور", "Şifre"], "Report type": ["نوع البلاغ", "Bildirim türü"], "Item name": ["اسم الغرض", "Eşya adı"],
  Category: ["الفئة", "Kategori"], Color: ["اللون", "Renk"], Brand: ["الماركة", "Marka"], Description: ["الوصف", "Açıklama"],
  Date: ["التاريخ", "Tarih"], Location: ["المكان", "Konum"], Latitude: ["خط العرض", "Enlem"], Longitude: ["خط الطول", "Boylam"],
  "Private details": ["التفاصيل الخاصة", "Gizli ayrıntılar"], Message: ["الرسالة", "Mesaj"], "Ownership details": ["تفاصيل الملكية", "Sahiplik ayrıntıları"],
  "Where and how you found it": ["أين وكيف وجدته", "Nerede ve nasıl buldunuz"], Reason: ["السبب", "Neden"], Details: ["التفاصيل", "Ayrıntılar"],
  Phone: ["الهاتف", "Telefon"], Target: ["الهدف", "Hedef"],
};
const label = (l, i) => LABEL[l]?.[i] ?? LABEL[Object.keys(LABEL).find((k) => k.toLowerCase() === l.toLowerCase())]?.[i] ?? l;

// Messages with variable parts: [regex, (match, i) => translation] where i is 0 = ar, 1 = tr.
const PATTERNS = [
  [/^(.+) is required$/, (m, i) => [`${label(m[1], 0)} مطلوب`, `${label(m[1], 1)} zorunludur`][i]],
  [/^(.+) must be at least (\d+) characters$/, (m, i) => [`${label(m[1], 0)} يجب ألا يقل عن ${m[2]} أحرف`, `${label(m[1], 1)} en az ${m[2]} karakter olmalı`][i]],
  [/^(.+) must be at most (\d+) characters$/, (m, i) => [`${label(m[1], 0)} يجب ألا يزيد عن ${m[2]} حرف`, `${label(m[1], 1)} en fazla ${m[2]} karakter olabilir`][i]],
  [/^Choose a valid (.+)$/, (m, i) => [`اختر ${label(m[1], 0)} صحيحًا`, `Geçerli bir ${label(m[1], 1).toLocaleLowerCase("tr")} seçin`][i]],
  [/^(.+) is not a valid date$/, (m, i) => [`${label(m[1], 0)} ليس تاريخًا صحيحًا`, `${label(m[1], 1)} geçerli bir tarih değil`][i]],
  [/^(.+) can't be in the future$/, (m, i) => [`${label(m[1], 0)} لا يمكن أن يكون في المستقبل`, `${label(m[1], 1)} gelecekte olamaz`][i]],
  [/^(.+) is out of range$/, (m, i) => [`${label(m[1], 0)} خارج النطاق`, `${label(m[1], 1)} aralık dışında`][i]],
  [/^Each photo must be smaller than (\d+) MB$/, (m, i) => [`يجب أن تكون كل صورة أصغر من ${m[1]} ميغابايت`, `Her fotoğraf ${m[1]} MB'tan küçük olmalı`][i]],
  [/^You can upload up to (\d+) photos$/, (m, i) => [`يمكنك رفع ${m[1]} صور كحد أقصى`, `En fazla ${m[1]} fotoğraf yükleyebilirsiniz`][i]],
  [/^A report can have up to (\d+) photos$/, (m, i) => [`يمكن أن يحتوي البلاغ على ${m[1]} صور كحد أقصى`, `Bir bildirimde en fazla ${m[1]} fotoğraf olabilir`][i]],
  [/^The AI model could not be loaded: (.*)$/, (m, i) => [`تعذّر تحميل نموذج الذكاء الاصطناعي: ${m[1]}`, `Yapay zekâ modeli yüklenemedi: ${m[1]}`][i]],
  [/^Asked an administrator to review: (.*)$/s, (m, i) => [`طلب مراجعة المسؤول: ${m[1]}`, `Yöneticiden inceleme istendi: ${m[1]}`][i]],
  [/^(.*) — Approved by the item's reporter, waiting for administrator verification$/s, (m, i) => [`${m[1]} — وافق صاحب البلاغ، بانتظار تحقق المسؤول`, `${m[1]} — Bildiren kişi onayladı, yönetici doğrulaması bekleniyor`][i]],
];

function tr(msg, lang = current()) {
  if (msg == null || lang === "en") return msg;
  const i = lang === "ar" ? 0 : 1;
  if (M[msg]) return M[msg][i];
  for (const [re, f] of PATTERNS) {
    const m = String(msg).match(re);
    if (m) return f(m, i);
  }
  return msg;
}

const trFields = (fields, lang = current()) => (fields ? Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, tr(v, lang)])) : fields);

// ── Notifications ───────────────────────────────────────────────────────
// key → { en: [title, body], ar: [...], tr: [...] }  ({param} placeholders)
const N = {
  welcome: {
    en: ["Welcome to Lost & Found", "Report an item or search by photo. We'll let you know when a possible match appears."],
    ar: ["أهلًا بك في Lost & Found", "أبلغ عن غرض أو ابحث بصورة، وسننبهك عند ظهور مطابقة محتملة."],
    tr: ["Lost & Found'a hoş geldiniz", "Bir eşya bildirin veya fotoğrafla arayın. Olası bir eşleşme çıktığında size haber vereceğiz."],
  },
  match_lost: {
    en: ["A possible match for “{lost}”", "Someone reported finding “{found}” ({score}% similarity). Review it to see if it's yours."],
    ar: ["مطابقة محتملة لـ «{lost}»", "أبلغ شخص أنه وجد «{found}» (تشابه {score}%). راجعها لترى إن كانت لك."],
    tr: ["“{lost}” için olası bir eşleşme", "Birisi “{found}” bulduğunu bildirdi (%{score} benzerlik). Sizin olup olmadığına bakın."],
  },
  match_lost_strong: {
    en: ["A strong possible match for “{lost}”", "Someone reported finding “{found}” ({score}% similarity). Review it to see if it's yours."],
    ar: ["مطابقة محتملة قوية لـ «{lost}»", "أبلغ شخص أنه وجد «{found}» (تشابه {score}%). راجعها لترى إن كانت لك."],
    tr: ["“{lost}” için güçlü bir olası eşleşme", "Birisi “{found}” bulduğunu bildirdi (%{score} benzerlik). Sizin olup olmadığına bakın."],
  },
  match_found: {
    en: ["A possible match for the item you found", "“{found}” may belong to someone who reported “{lost}” ({score}% similarity)."],
    ar: ["مطابقة محتملة للغرض الذي وجدته", "قد يكون «{found}» لشخص أبلغ عن فقدان «{lost}» (تشابه {score}%)."],
    tr: ["Bulduğunuz eşya için olası bir eşleşme", "“{found}”, “{lost}” kaybettiğini bildiren birine ait olabilir (%{score} benzerlik)."],
  },
  match_found_strong: {
    en: ["A strong possible match for the item you found", "“{found}” may belong to someone who reported “{lost}” ({score}% similarity)."],
    ar: ["مطابقة محتملة قوية للغرض الذي وجدته", "قد يكون «{found}» لشخص أبلغ عن فقدان «{lost}» (تشابه {score}%)."],
    tr: ["Bulduğunuz eşya için güçlü bir olası eşleşme", "“{found}”, “{lost}” kaybettiğini bildiren birine ait olabilir (%{score} benzerlik)."],
  },
  match_owner_yes: {
    en: ["The owner thinks “{title}” may be theirs", "Open your matches to continue."],
    ar: ["صاحب الغرض يعتقد أن «{title}» قد يكون له", "افتح المطابقات للمتابعة."],
    tr: ["Sahibi “{title}” eşyasının kendisine ait olabileceğini düşünüyor", "Devam etmek için eşleşmelerinizi açın."],
  },
  match_finder_yes: {
    en: ["The finder thinks your “{title}” may be what they found", "Open your matches to continue."],
    ar: ["من وجد الغرض يعتقد أن «{title}» قد يكون ما وجده", "افتح المطابقات للمتابعة."],
    tr: ["Bulan kişi “{title}” eşyanızın bulduğu şey olabileceğini düşünüyor", "Devam etmek için eşleşmelerinizi açın."],
  },
  claim_ownership: {
    en: ["Someone says “{title}” is theirs", "Review the request privately and decide what to do next."],
    ar: ["شخص يقول إن «{title}» له", "راجع الطلب بشكل خاص وقرر الخطوة التالية."],
    tr: ["Birisi “{title}” eşyasının kendisine ait olduğunu söylüyor", "Talebi gizlice inceleyin ve ne yapacağınıza karar verin."],
  },
  claim_finder: {
    en: ["Someone may have found your “{title}”", "Review the request privately and decide what to do next."],
    ar: ["ربما وجد شخص «{title}» الخاص بك", "راجع الطلب بشكل خاص وقرر الخطوة التالية."],
    tr: ["Birisi “{title}” eşyanızı bulmuş olabilir", "Talebi gizlice inceleyin ve ne yapacağınıza karar verin."],
  },
  claim_status: {
    en: ["Request for “{title}” is now {status}", "{note}"],
    ar: ["طلب «{title}» أصبح الآن: {status}", "{note}"],
    tr: ["“{title}” talebi artık: {status}", "{note}"],
  },
  claim_closed_other: {
    en: ["Your request for “{title}” was closed", "The item was returned through another request."],
    ar: ["أُغلق طلبك لـ «{title}»", "أُعيد الغرض عن طريق طلب آخر."],
    tr: ["“{title}” talebiniz kapatıldı", "Eşya başka bir talep aracılığıyla iade edildi."],
  },
  message_new: {
    en: ["New message about “{title}”", "{snippet}"],
    ar: ["رسالة جديدة بخصوص «{title}»", "{snippet}"],
    tr: ["“{title}” hakkında yeni mesaj", "{snippet}"],
  },
  report_published: {
    en: ["Your report “{title}” is published", "It's now visible to everyone and included in matching."],
    ar: ["تم نشر بلاغك «{title}»", "أصبح ظاهرًا للجميع ويدخل في المطابقة."],
    tr: ["“{title}” bildiriminiz yayınlandı", "Artık herkese görünüyor ve eşleştirmeye dahil."],
  },
  report_removed: {
    en: ["Your report “{title}” was removed", "{note}"],
    ar: ["تم حذف بلاغك «{title}»", "{note}"],
    tr: ["“{title}” bildiriminiz kaldırıldı", "{note}"],
  },
  admin_held: {
    en: ["A report is waiting for review", "“{title}” — {reason}"],
    ar: ["بلاغ بانتظار المراجعة", "«{title}» — {reason}"],
    tr: ["Bir bildirim inceleme bekliyor", "“{title}” — {reason}"],
  },
  admin_disputed: {
    en: ["Several people claim the same item", "{n} open ownership requests on “{title}”."],
    ar: ["عدة أشخاص يطلبون نفس الغرض", "{n} طلبات ملكية مفتوحة على «{title}»."],
    tr: ["Birden fazla kişi aynı eşyayı talep ediyor", "“{title}” için {n} açık sahiplik talebi."],
  },
  admin_valuable: {
    en: ["A valuable item needs your approval", "Request #{id} for “{title}”."],
    ar: ["غرض ثمين يحتاج موافقتك", "الطلب رقم {id} لـ «{title}»."],
    tr: ["Değerli bir eşya onayınızı bekliyor", "“{title}” için #{id} numaralı talep."],
  },
  admin_dispute: {
    en: ["A rejected request was disputed", "Request #{id} for “{title}”."],
    ar: ["تم الاعتراض على طلب مرفوض", "الطلب رقم {id} لـ «{title}»."],
    tr: ["Reddedilen bir talebe itiraz edildi", "“{title}” için #{id} numaralı talep."],
  },
  admin_flag: {
    en: ["New report about a {target}: {reason}", "{details}"],
    ar: ["بلاغ جديد عن {target}: {reason}", "{details}"],
    tr: ["Bir {target} hakkında yeni şikâyet: {reason}", "{details}"],
  },
};

const CLAIM_STATUS = {
  pending: ["Pending", "قيد الانتظار", "Beklemede"],
  under_review: ["Under review", "قيد المراجعة", "İnceleniyor"],
  approved: ["Approved", "مقبول", "Onaylandı"],
  rejected: ["Rejected", "مرفوض", "Reddedildi"],
  returned: ["Returned", "تمت الإعادة", "İade edildi"],
  cancelled: ["Cancelled", "ملغى", "İptal edildi"],
};
const FLAG_TARGET = { item: ["report", "بلاغ", "bildirim"], user: ["user", "مستخدم", "kullanıcı"], claim: ["request", "طلب", "talep"], match: ["match", "مطابقة", "eşleşme"] };
const FLAG_REASON = { spam: ["spam", "رسائل مزعجة", "spam"], fake: ["fake", "مزيف", "sahte"], offensive: ["offensive", "مسيء", "saldırgan"], scam: ["scam", "احتيال", "dolandırıcılık"], privacy: ["privacy", "خصوصية", "gizlilik"], other: ["other", "أخرى", "diğer"] };
const idx = (lang) => ({ en: 0, ar: 1, tr: 2 })[lang] ?? 0;

// Parameters that are themselves translatable are stored as codes and resolved here.
function resolveParams(params = {}, lang) {
  const p = { ...params };
  if (p.status_code) {
    p.status = CLAIM_STATUS[p.status_code]?.[idx(lang)] || p.status_code;
    if (lang === "en") p.status = p.status.toLowerCase(); // "…is now approved"
  }
  if (p.target_code) p.target = FLAG_TARGET[p.target_code]?.[idx(lang)] || p.target_code;
  if (p.reason_code) p.reason = FLAG_REASON[p.reason_code]?.[idx(lang)] || p.reason_code;
  if (p.note) p.note = tr(p.note, lang);
  if (p.reason && !p.reason_code) p.reason = tr(p.reason, lang);
  return p;
}

function notification(key, params, lang = current()) {
  const t = N[key];
  if (!t) return null;
  const [title, body] = t[lang] || t.en;
  const p = resolveParams(params, lang);
  return { title: fill(title, p), body: fill(body, p).trim() || null };
}

// ── Match reasons ───────────────────────────────────────────────────────
const R = {
  category: ["Same category: {cat}", "نفس الفئة: {cat}", "Aynı kategori: {cat}"],
  photo: ["Photos look alike (AI visual similarity {pct}%)", "الصور متشابهة (تشابه بصري بالذكاء الاصطناعي {pct}%)", "Fotoğraflar benziyor (yapay zekâ görsel benzerliği %{pct})"],
  text: ["Descriptions share: {words}", "كلمات مشتركة في الوصف: {words}", "Açıklamalardaki ortak kelimeler: {words}"],
  color_same: ["Same color: {color}", "نفس اللون: {color}", "Aynı renk: {color}"],
  color_similar: ["Similar colors: {a} / {b}", "ألوان متقاربة: {a} / {b}", "Benzer renkler: {a} / {b}"],
  brand: ["Same brand: {brand}", "نفس الماركة: {brand}", "Aynı marka: {brand}"],
  distance_m: ["Reported about {m} m apart", "المسافة بينهما حوالي {m} م", "Aralarında yaklaşık {m} m var"],
  distance_km: ["Reported about {km} km apart", "المسافة بينهما حوالي {km} كم", "Aralarında yaklaşık {km} km var"],
  area: ["Same area mentioned: {words}", "نفس المنطقة مذكورة: {words}", "Aynı bölge belirtilmiş: {words}"],
  date_same: ["Lost and found around the same day", "فُقد ووُجد في نفس اليوم تقريبًا", "Aşağı yukarı aynı gün kaybedildi ve bulundu"],
  date_close: ["Dates are within 2 days of each other", "الفرق بين التاريخين يومان أو أقل", "Tarihler arasında en fazla 2 gün var"],
  date_after: ["Found {d} days after it was lost", "وُجد بعد {d} أيام من فقدانه", "Kaybolduktan {d} gün sonra bulundu"],
};

// Reasons are stored with a key, params and an English text (older rows only have text).
function reason(r, lang = current()) {
  if (!r.key || !R[r.key]) return r;
  const p = { ...r.params };
  if (p.cat_slug) p.cat = categoryLabel(p.cat_slug, p.cat, lang);
  if (p.color_slug) p.color = colorLabel(p.color_slug, p.color, lang);
  if (p.a_slug) p.a = colorLabel(p.a_slug, p.a, lang);
  if (p.b_slug) p.b = colorLabel(p.b_slug, p.b, lang);
  return { ...r, text: fill(R[r.key][idx(lang)], p) };
}
const reasons = (list, lang = current()) => (Array.isArray(list) ? list.map((r) => reason(r, lang)) : list);
const reasonText = (key, params) => fill(R[key][0], params);

module.exports = { LANGS, middleware, current, tr, trFields, fill, notification, reasons, reasonText, categoryLabel, colorLabel, CLAIM_STATUS, idx };
