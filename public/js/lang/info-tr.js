// Uzun sayfalar Türkçe (sabit, güvenilir HTML).
export default {
  how: {
    title: "Kayıptan iadeye",
    lead: "Bir eşyayı bildirdikten sonra neler olur, eşleştirme ve doğrulama nasıl çalışır.",
    body: `
    <h2 style="margin-top:0">1. Bildirim</h2>
    <p><strong>Bir şey kaybettim</strong> veya <strong>Bir şey buldum</strong> seçin. Ad, kategori, renk, marka, açıklama, tarih ve yeri (haritadan seçin) ekleyin. Fotoğraflar isteğe bağlıdır ama fotoğrafla eşleştirmeyi mümkün kılar. <strong>Gizli ayrıntılar</strong> da ekleyebilirsiniz — yalnızca gerçek sahibinin bileceği şeyler. Bunları başka kimse görmez.</p>
    <h2>2. Akıllı eşleştirme</h2>
    <p>Her yeni kayıp bildirimi aktif bulunan bildirimleriyle karşılaştırılır, tersi de geçerlidir. Puan (%0–95) şunları birleştirir:</p>
    <ul>
      <li><strong>Fotoğraflar</strong> — bir yapay zekâ modeli (CLIP) her fotoğrafı "görsel parmak izine" dönüştürüp karşılaştırır. Sunucumuzda çalışır; fotoğraflar dış bir hizmete gönderilmez.</li>
      <li><strong>Kategori, renk ve marka</strong> — farklı kategoriler puanı ciddi şekilde düşürür; benzer renkler (siyah/lacivert) kısmen sayılır.</li>
      <li>Ad ve açıklamadaki <strong>kelimeler</strong>, yaygın eş anlamlılarla (AirPods ↔ kablosuz kulaklık).</li>
      <li><strong>Yer</strong> — iki harita noktası arasındaki mesafe; <strong>tarih</strong> — kaybolduğu gün veya sonrasında bulunmuş olması.</li>
    </ul>
    <p>Bir çift yeterince yüksek puan aldığında bildirim alırsınız ve puanı <em>gerekçeleriyle</em> görürsünüz. Bir öneri asla kesin eşleşme sayılmaz — bir sonraki adım bunun içindir.</p>
    <h2>3. Gizli doğrulama</h2>
    <p>Bulunan bir eşyanın size ait olduğunu düşünüyorsanız bir <strong>sahiplik talebi</strong> gönderin ve herkese açık bildirimde olmayan ayrıntıları yazın. Bulan kişi cevabınızı kendi gizli notlarıyla karşılaştırır ve onaylar veya reddeder. Bir kayıp bildirimine uyan bir şey bulduysanız sahibine bir <strong>bulan kişi yanıtı</strong> gönderin.</p>
    <p><strong>Değerli veya hassas eşyalarda</strong> (bildiren kişinin işaretledikleri ve tüm kimlik belgeleri) talebi bir yönetici de doğrular. Aynı eşyayı birden fazla kişi talep ederse veya bir ret itiraz edilirse, yöneticiler inceler.</p>
    <h2>4. Teslim</h2>
    <p>Onaydan sonra teslimi gizli mesajlarla ayarlayın — kalabalık bir yerde veya resmi bir kayıp eşya masasında. Ardından taraflardan biri iadeyi onaylar ve iki bildirim de kavuşmuş olarak işaretlenir.</p>
    <p class="row"><a class="btn btn-primary" href="/report/lost" data-link>Kayıp eşya bildir</a><a class="btn" href="/guide" data-link>Kullanıcı kılavuzunu oku</a></p>`,
  },
  privacy: {
    title: "Gizlilik ve veri saklama",
    lead: "Neyi gösteriyoruz, neyi gizli tutuyoruz ve ne kadar saklıyoruz.",
    body: `
    <h2 style="margin-top:0">Herkese açık olanlar</h2>
    <ul>
      <li>Bildirimin kendisi: eşya adı, kategori, renk, marka, açıklama, tarih, yer adı ve fotoğraflar.</li>
      <li>Haritada <strong>yaklaşık bir alan</strong>: nokta yuvarlanır ve ~250 m'ye kadar kaydırılır, ~300 m'lik bir daire olarak gösterilir.</li>
      <li>Adınız ve soyadınızın baş harfi (veya kullanıcı adınız).</li>
    </ul>
    <h2>Gizli kalanlar</h2>
    <ul>
      <li>E-posta adresiniz ve telefon numaranız — diğer kullanıcılara asla gösterilmez.</li>
      <li>Haritadaki tam nokta — yalnızca siz ve yöneticiler görür.</li>
      <li>Bildirimlerdeki gizli doğrulama ayrıntıları ve iade taleplerindeki cevaplar — yalnızca talepteki kişiler ve yöneticiler.</li>
      <li>Gizli mesajlar — yalnızca talepteki iki kişi ve yöneticiler.</li>
      <li>Fotoğrafın çekildiği GPS konumu dahil fotoğraf meta verileri (EXIF) yükleme sırasında silinir.</li>
    </ul>
    <p>Bağlantı, telefon numarası veya e-posta adresi içeren bildirimler incelemeye alınır; böylece iletişim bilgileri yanlışlıkla yayınlanmaz.</p>
    <h2>Fotoğraflar ve yapay zekâ</h2>
    <p>Fotoğraflar kendi sunucumuzda çalışan bir yapay zekâ modeliyle analiz edilir. <em>Fotoğrafla arama</em> için kullandığınız fotoğraflar bellekte işlenir ve saklanmaz.</p>
    <h2>Verileri ne kadar saklıyoruz</h2>
    <ul>
      <li><strong>6 ay</strong> boyunca güncellenmeyen aktif bildirimler otomatik kapatılır.</li>
      <li>Kapatılan, iade edilen veya kaldırılan bildirimler ve fotoğrafları <strong>1 yıl sonra silinir</strong>.</li>
      <li>Biten taleplerdeki mesajlar, talep kapandıktan <strong>180 gün</strong> sonra silinir.</li>
      <li>Okunan bildirimler <strong>90 gün</strong> sonra; kaydedilen e-postalar 30 gün sonra silinir.</li>
      <li>Önemli işlemlerin denetim kaydı, kötüye kullanımı incelemek için <strong>2 yıl</strong> saklanır.</li>
      <li>Hesabınızı istediğiniz zaman <a href="/dashboard/settings" data-link>Ayarlar</a>'dan silebilirsiniz. Bu, bildirimlerinizi, fotoğraflarınızı ve mesajlarınızı hemen siler.</li>
    </ul>
    <h2 id="safety">Güvenli teslim</h2>
    <ul>
      <li>Kalabalık bir yerde buluşun veya eşyayı resmi bir kayıp eşya masasına (resepsiyon, güvenlik, kütüphane masası) teslim edin.</li>
      <li>Bir eşyayı geri almak için asla ödeme yapmayın; "kanıt" olarak şifre veya tam kart numarası paylaşmayın.</li>
      <li>Bir şeyler yanlış görünüyorsa, bildirim veya talepteki <strong>Şikâyet et</strong> düğmesini kullanın. Yöneticiler her şikâyeti inceler.</li>
    </ul>`,
  },
  guide: {
    title: "Kullanıcı kılavuzu",
    lead: "Platformda yapabileceğiniz her şey, adım adım.",
    body: `
    <h2 style="margin-top:0">Başlarken</h2>
    <ol><li>Adınız, bir kullanıcı adı, e-posta ve şifreyle hesap oluşturun.</li><li><a href="/dashboard" data-link>Panelinizi</a> açın — bildirimleriniz, eşleşmeler, talepler ve bildirimler orada.</li><li>Üstteki dil düğmesinden dilinizi seçin (العربية, English, Türkçe).</li></ol>
    <h2>Eşya bildirmek</h2>
    <ol>
      <li><strong>Eşya bildir</strong>'e tıklayın ve kayıp veya bulunan seçin.</li>
      <li>En fazla 6 fotoğraf ekleyin (JPG, PNG veya WebP). İlk fotoğraftan sonra yapay zekâ kategori ve renk önerir — uygulamak için öneriye dokunun.</li>
      <li>Ad, kategori, açıklama ve tarihi doldurun. Marka ve renk isteğe bağlıdır ama eşleştirmeyi iyileştirir.</li>
      <li>Yeri belirlemek için haritaya tıklayın, <strong>Konumum</strong>'u kullanın veya bir yer arayın.</li>
      <li>Gizli ayrıntıları ekleyin; pahalı veya hassas eşyalar için <strong>Değerli</strong>'yi işaretleyin.</li>
      <li>Yayınlayın. Olası eşleşme bulunup bulunmadığını hemen görürsünüz.</li>
    </ol>
    <p>Bir bildirimi sayfasından düzenleyebilir, kapatabilir, yeniden açabilir veya silebilirsiniz. Eşyanız geri geldiğinde <strong>Geri aldım</strong> / <strong>İade edildi olarak işaretle</strong>'yi kullanın.</p>
    <h2>Arama</h2>
    <ul>
      <li><strong>Göz at</strong>: kelimelerle arayın, sonra tür, kategori, renk, tarih, yer ve "fotoğraflı" ile filtreleyin. En yeni, en eski, en alakalı veya tarihe göre sıralayın.</li>
      <li><strong>Fotoğrafla arama</strong>: bir fotoğraf yükleyin; sonuçlar görsel benzerliğe göre sıralanır. Yapay zekâ kategoriyi de tahmin eder — filtrelemek için dokunun.</li>
      <li><strong>Harita</strong>: yaklaşık alanları keşfedin, tür, kategori ve döneme göre filtreleyin ve önizleme için bir iğneye tıklayın.</li>
    </ul>
    <h2>Eşleşmeler</h2>
    <p><a href="/dashboard/matches" data-link>Önerilen eşleşmeler</a>'de her çifti puanı ve gerekçeleriyle görürsünüz. Eşyayı kaybettiyseniz sahiplik talebi göndermek için <strong>Benim olabilir</strong>, gizlemek için <strong>Benim değil</strong> deyin. Bulduysanız, doğru görünüp görünmediğini sahibine söyleyin.</p>
    <h2>İade talepleri</h2>
    <ul>
      <li>Durumlar: <strong>Beklemede</strong> → <strong>İnceleniyor</strong> → <strong>Onaylandı</strong> → <strong>İade edildi</strong> ya da <strong>Reddedildi</strong> / <strong>İptal edildi</strong>.</li>
      <li>Bulan kişi olarak cevapları gizli ayrıntılarınızla karşılaştırın, sonra onaylayın veya (kısa bir nedenle) reddedin.</li>
      <li>Onaydan sonra teslimi mesajlarla ayarlayın. Herhangi biriniz iadeyi onaylar.</li>
      <li>Talebiniz reddedildiyse ve yanlış olduğunu düşünüyorsanız bir yöneticiden incelemesini isteyin.</li>
    </ul>
    <h2>Bildirimler</h2>
    <p>Zil; yeni eşleşmeleri, talepleri, mesajları ve durum değişikliklerini gösterir. Neleri alacağınızı — ve e-posta da isteyip istemediğinizi — <a href="/dashboard/settings" data-link>Ayarlar</a>'dan seçin.</p>`,
  },
  admin: {
    title: "Yönetici kılavuzu",
    lead: "Denetim, anlaşmazlıklar, kullanıcılar ve denetim kaydı.",
    body: `
    <h2 style="margin-top:0">Erişim</h2>
    <p>Yöneticiler hesap menüsünde <strong>Yönetici paneli</strong>'ni görür. Yönetici yetkisini <a href="/admin/users" data-link>Kullanıcılar</a>'dan verin veya kaldırın. Platformda her zaman en az bir yönetici kalır.</p>
    <h2>Genel bakış</h2>
    <p>Üst satır dikkat gerektirenleri gösterir: inceleme bekleyen bildirimler, yönetici gerektiren talepler, açık kullanıcı şikâyetleri ve itiraz edilen eşleşmeler. Grafikler günlük ve kategoriye göre bildirimleri gösterir; son etkinlik denetim kaydından gelir.</p>
    <h2>Bildirimler</h2>
    <ul>
      <li>Bağlantı, telefon numarası veya e-posta içeren, hesabı askıya alınan veya birkaç kullanıcının şikâyet ettiği bildirimler otomatik olarak incelemeye alınır.</li>
      <li><a href="/admin/settings" data-link>Ayarlar</a>'da <em>her</em> yeni bildirim için onay zorunlu kılabilirsiniz.</li>
      <li><strong>Onayla</strong> bildirimi yayınlar ve eşleştirmeyi çalıştırır. <strong>Reddet/Kaldır</strong> bildiren kişiye gönderilen bir neden ister. <strong>Geri yükle</strong> kaldırmayı geri alır.</li>
    </ul>
    <h2>Talepler</h2>
    <ul>
      <li><strong>Dikkat gerektirenler</strong>, itiraz edilen talepleri (birden fazla talep eden veya itiraz edilen ret) ve değerli veya hassas eşya taleplerini listeler.</li>
      <li>Her iki tarafın gizli ayrıntılarını ve mesajlarını görmek için talebi açın. Onaylayabilir, reddedebilir, iade edildi olarak işaretleyebilir veya anlaşmazlığı kapatabilirsiniz. Gönderdiğiniz mesajlar "Yönetici" olarak etiketlenir.</li>
      <li>Bir eşya iade edildiğinde, ona ait diğer açık talepler otomatik kapanır.</li>
    </ul>
    <h2>Eşleşmeler</h2>
    <p>Kullanıcılar önerilen bir eşleşmeyi şüpheli olarak bildirebilir; o zaman <strong>İtiraz edildi</strong> olarak görünür. Öneri olarak tutun veya her iki kullanıcı için yok sayın.</p>
    <h2>Kullanıcılar ve şüpheli etkinlik</h2>
    <ul>
      <li>Kullanıcı tablosu bildirimleri, talepleri, reddedilen talepleri ve açık şikâyetleri gösterir — çok sayıda reddedilen talep bir uyarı işaretidir.</li>
      <li><strong>Askıya al</strong>, kullanıcının oturumunu bir sonraki isteğinde kapatır, girişi engeller ve aktif bildirimlerini incelemeye alır. Denetim kaydı için not zorunludur.</li>
    </ul>
    <h2>Kullanıcı şikâyetleri</h2>
    <p>İlanlar, kullanıcılar, talepler ve eşleşmeler hakkındaki şikâyetler. İşlem yaptıktan sonra çözüldü veya yok sayıldı olarak işaretleyin.</p>
    <h2>Denetim kaydı</h2>
    <p>Her önemli işlem kimin yaptığı, ne zaman, hedef ve ayrıntılarla kaydedilir: bildirim oluşturma ve silme, durum değişiklikleri, talep kararları, yönetici kararları, hesap değişiklikleri. Kayıtlar 2 yıl saklanır.</p>
    <h2>E-posta</h2>
    <p>E-posta göndermek için sunucuda <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> ve <code>SMTP_FROM</code> ayarlayın. Bunlar olmadan e-postalar Ayarlar'daki giden kutusuna kaydedilir.</p>`,
  },
};
