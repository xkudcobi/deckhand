# Deckhand

> **Taslak proje.** Sunum yapısı, görünür asistan ve düzenleme akışı çalışıyor; ama slayt *içeriği* şimdilik genel geçer: dil modeli yok, planlayıcı her şablonu küçük bir hazır cümle havuzundan dolduruyor. İskelet bekleyin, içerik değil. Plan: kaynak olarak kendi notlarınızı yapıştırmak ve isterseniz kendi API anahtarınızla gerçek içerik üretmek.

In English: [README.md](README.md)

Tek satır yaz — "kahve mi çay mı", "ekşi mayalı ekmek nasıl yapılır" — sayfadaki küçük asistan slaytları gözünün önünde kursun: senin bastığın araç çubuğu düğmelerine o da basar, senin yazdığın kutulara o da yazar, arada "bunu buraya koyayım" gibi kısa notlar bırakır. İstediğin an araya girersin; asistan senin değişikliklerinin üstüne yazmaz, etrafından dolaşır.

Her şey tarayıcıda olur. Hesap yok, sunucu yok, dil modeli yok, internet yok. `index.html` dosyasını aç, örnek bir sunum kendiliğinden kurulmaya başlar.

## Ekranda ne var

- **Üstte:** konu kutusu ve birkaç örnek konu.
- **Araç çubuğu:** yeni slayt, sil, yukarı/aşağı taşı, düzen değiştir, beş renk teması, sun, indir. Sen de asistan da tam olarak bu düğmeleri kullanırsınız.
- **Solda:** her slaydın canlı küçük hali.
- **Ortada:** seçili slayt. Bir metne tıkla ve yerinde düzelt; Enter yeni madde açar, boş maddede Backspace maddeyi siler.
- **Sağda:** asistan. Gözleri kendi imlecini takip eder, notları konuşma balonu olarak düşer. "Duraklat" onu kelimenin ortasında dondurur; "Hız" 1×, 2×, 4× arasında geçiş yapar.

## Neyi nasıl kuruyor

Asistan kural tabanlıdır; arkasında model yoktur. `js/planner.js` konuya bakar ve onu dört sabit şablondan birine oturtur:

| Şablon | Ne zaman | Slaytlar |
| --- | --- | --- |
| Karşılaştırma | "A vs B", "A mı yoksa B mi", "A veya B", "A ile B arasındaki fark" | başlık, A, B, yan yana tablo, "hangisi ne zaman", sonuç |
| Adım adım | "nasıl", "adım", "rehber", "tarif", "kurulum"… | başlık, başlamadan önce, üç numaralı adım, sık yapılan hatalar, kapanış cümlesi |
| Özet | "kısaca", "özet", "ana hatlar"… | başlık, üç cümle, artılar / dikkat edilecekler, tek cümle |
| Tanıtım | geri kalan her şey | başlık, nedir, neden önemli, anahtar kavramlar, kapanış cümlesi |

Başlıklar ve maddeler küçük cümle havuzlarından, konunun hash değerine göre seçilir: aynı konu her seferinde aynı sunumu verir, farklı konular farklı cümleler alır. Karşılaştırmalarda soru eki ("mı / mi / mu / mü") ünlü uyumuna göre seçilir. "Nasıl yapılır" gibi şablonu belli eden kelimeler, konu cümle içine girmeden önce temizlenir. Renk temasını da şablon belirler.

## Asistanla birlikte çalışmak

Bir slayttaki her alan, içine bir insanın yazıp yazmadığını hatırlar. Asistan bir yere yazmadan önce — ve her karakterden önce yeniden — bu işarete bakar:

- Asistan bir başlığı yazarken sen aynı başlığı düzeltirsen "sen devraldın, ben çekiliyorum" der ve senin metnini bırakır.
- Bir tema seçersen tema kilitlenir; asistan bir daha değiştirmez.
- Bir slaydın düzenini değiştirirsen o slaydın düzeni kilitlenir.
- Slaytları taşır ya da silersen asistan slaytları kimliğiyle takip ettiği için kendi son slaydının arkasına eklemeye devam eder.
- Asistan yeni slayt açacağı sırada imlecin bir slaydın içindeyse, editörü senden çalmak yerine slaydı arkada ekler.

## Sunmak ve paylaşmak

- **Sun** tam ekran görünüm açar. Ok tuşları, boşluk ve tıklama slaytlar arasında gezdirir; Esc çıkar.
- **İndir** tek parça bir `.html` dosyası kaydeder: slaytlar, tema, editörün kullandığı aynı CSS ve birkaç satırlık gezinme kodu. Bağımlılık yok, her yerde açılır.

## Çalıştırma

`index.html` dosyasını güncel bir tarayıcıda aç. Bu kadar.

Planlayıcı tarayıcı olmadan da denenebilir:

```
node demo/check.js
```

Birkaç konu için kuracağı sunumu yazdırır ve bir kural yanlış çalışırsa hata verir. GitHub Actions iş akışı da aynı betiği çalıştırır.

## Dosyalar

```
index.html        sayfa iskeleti
style.css         uygulama arayüzü (araç çubuğu, küçük resimler, asistan paneli)
js/planner.js     konu -> şablon -> slayt planı (Node'dan da yüklenebilir)
js/themes.js      beş renk teması
js/deck.js        slayt modeli, çizim, düzenleme, sunum modu, HTML dışa aktarma
js/assistant.js   imleç, düğme basma, yazma, notlar, "düzenlendi" kontrolleri
js/main.js        bağlantılar ve açılış gösterisi
demo/check.js     planlayıcı demosu ve sağlamlık kontrolleri
```

## Sınırlar

İçerik bilerek geneldir: asistan konu hakkında kelimelerinden fazlasını bilmez, bu yüzden maddeler senin yeniden yazman için bir iskelettir, bilgi değil. Şablonlar ve cümle havuzları Türkçedir; başka bir dil eklemek `js/planner.js` içindeki `POOLS` ve tespit regex'lerini çevirmek demektir.

## Lisans

MIT — bkz. [LICENSE](LICENSE).

---

Bu projenin geliştirilmesinde AI destekli araçlardan (Claude) yararlanıldı.
