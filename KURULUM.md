# Dilim — Kurulum rehberi (kod bilmene gerek yok)

Dilim; görsel, PDF, ses ve video dosyalarını çark arayüzüyle dönüştüren, video/ses kesen, bağlantıdan medya indiren ve yaptıklarını kütüphanede tutan bir Windows uygulamasıdır.

Windows için .exe dosyasını GitHub senin yerine **otomatik** üretir. Yapman gerekenler:

## 1) GitHub'a yükle (bir kez)
1. github.com'da giriş yap → sağ üstte **+** → **New repository**.
2. Ad: `dilim` → **Create repository**.
3. Bu zip'i bilgisayarında bir klasöre çıkar.
4. Depo sayfasında **uploading an existing file** (ya da *Add file → Upload files*) bağlantısına tıkla.
5. Çıkardığın klasörün **içindeki her şeyi** (package.json, main.js, `.github` klasörü dahil) pencereye sürükle-bırak. Klasörün kendisini değil, içindekileri.
6. Aşağıda **Commit changes** düğmesine bas.

> Kontrol: Depoda `.github/workflows/build.yml` dosyası görünmeli. Görünmüyorsa `.github` klasörü yüklenmemiştir; onu ayrıca sürükle.

## 2) .exe'yi al
1. Depoda üstteki **Actions** sekmesine gir. "Windows uygulamasını derle" çalışmaya başlamış olacak (5–10 dakika sürer). Başlamadıysa soldan seç → **Run workflow**.
2. Yeşil tik çıkınca o çalışmaya tıkla → en altta **Artifacts** → **Dilim-Windows** → indir.
3. İnen zip'in içinde:
   - `Dilim-Kurulum-0.1.0.exe` → normal kurulum (Başlat menüsü + masaüstü kısayolu)
   - `Dilim-Tasinabilir-0.1.0.zip` → kurulum gerektirmeyen sürüm (klasörü çıkar, Dilim.exe'ye çift tıkla)

## 3) İlk açılışta Windows uyarısı
Uygulama dijital imzasız olduğu için Windows "PC'nizi korudu" diyebilir. **Ek bilgi → Yine de çalıştır** de. (İmza ücretli bir sertifika gerektirir.)

## Nasıl kullanılır
- Dosyaları pencereye **sürükle-bırak** ya da **Ctrl+O**. Çark açılır; istediğin dilime tıkla.
- **Kes** dilimi (ses/video): Başlangıç ve bitiş tutamaçlarını sürükle, **Boşluk** oynatır, **I** / **O** başlangıç ve bitişi o ana alır.
- **İndir** ekranı: bağlantıyı yapıştır (kopyaladıysan Ctrl+V yeter). İlk seferde "Aracı kur" düğmesine bas.
- Yaptığın her şey **Kütüphane**'de listelenir; oradan açabilir, klasörde gösterebilirsin.
- Dönüştürülen dosyalar varsayılan olarak kaynak dosyanın yanına kaydedilir (Ayarlar'dan değişir). Var olan dosyanın üstüne asla yazılmaz.

## Bir şey ters giderse
Actions'ta kırmızı ✗ görürsen o çalışmayı aç, hata satırlarını kopyalayıp bana yapıştır; düzeltip yeni zip veririm.

## Desteklenenler
- Görsel: JPG, PNG, WEBP, BMP, GIF, TIFF, ICO ↔ birbirine, ayrıca PDF'e (tek tek ya da tek PDF'te birleştirerek)
- PDF → PNG / JPG / WEBP (her sayfa ayrı dosya)
- Ses: MP3, WAV, FLAC, OGG, M4A, OPUS (+ WMA, AAC girişi)
- Video: MP4, WEBM, GIF'e çevirme; sesi MP3/M4A/WAV olarak çıkarma
- Kesme: ses ve video (hassas ya da hızlı-kayıpsız mod)

Yalnızca indirme hakkına sahip olduğun içerikleri indir; sitelerin kullanım koşulları geçerlidir.
