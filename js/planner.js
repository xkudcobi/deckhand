/*
 * Rule-based slide planner.
 *
 * Takes a single line of text (the topic), decides which of four fixed
 * templates fits it best and produces a full slide plan: layouts, titles,
 * bullets and a theme name. Everything is deterministic: the same topic
 * always yields the same deck. No network, no models, just string rules.
 *
 * The file works both in the browser (exposes window.Planner) and in
 * Node (module.exports) so the demo script can exercise it directly.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.Planner = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Template ids and their human labels (used in assistant notes).
    const TEMPLATES = {
        intro: 'tanıtım',
        compare: 'karşılaştırma',
        steps: 'adım adım',
        summary: 'özet'
    };

    // Every template has a preferred pair of themes; the topic hash picks one
    // of the two so the same template does not always look identical.
    const THEME_CHOICES = {
        intro: ['gece', 'seker'],
        compare: ['ikili', 'kagit'],
        steps: ['orman', 'kagit'],
        summary: ['kagit', 'gece']
    };

    // Small Turkish stop-word list used when extracting key terms.
    const STOP_WORDS = new Set([
        've', 'ile', 'için', 'mi', 'mı', 'mu', 'mü', 'yoksa', 'veya', 'ya', 'da',
        'de', 'bir', 'bu', 'şu', 'nasıl', 'nedir', 'neden', 'kısaca', 'özet',
        'özeti', 'hakkında', 'üzerine', 'vs', 'versus', 'olarak', 'gibi',
        'yapılır', 'rehberi', 'rehber', 'kılavuzu', 'adım', 'çok', 'en'
    ]);

    /* ---------- tiny helpers ---------- */

    // FNV-1a hash so the plan is stable for a given topic.
    function hash(str) {
        let h = 2166136261;
        for (const ch of str) {
            h ^= ch.codePointAt(0);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    // Take `n` items from a pool, starting at a seed-dependent offset.
    function pick(pool, seed, n) {
        const out = [];
        const start = (seed >>> 0) % pool.length; // >>> guards against negative seeds from >> shifts
        for (let i = 0; i < Math.min(n, pool.length); i++) {
            out.push(pool[(start + i) % pool.length]);
        }
        return out;
    }

    // Replace {t}, {k} style placeholders inside a phrase.
    function fill(phrase, vars) {
        return phrase.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m));
    }

    function capitalize(str) {
        return str ? str.charAt(0).toLocaleUpperCase('tr') + str.slice(1) : str;
    }

    // Normalise the raw input: collapse spaces, strip trailing punctuation.
    function cleanTopic(raw) {
        return capitalize(String(raw || '')
            .replace(/\s+/g, ' ')
            .replace(/[\s.?!…]+$/g, '')
            .trim());
    }

    // Turkish question particle with vowel harmony: "kahve" -> "mi", "çay" -> "mı".
    function questionParticle(word) {
        const vowels = word.toLocaleLowerCase('tr').match(/[aeıioöuü]/g);
        const last = vowels ? vowels[vowels.length - 1] : 'e';
        if ('aı'.includes(last)) return 'mı';
        if ('ou'.includes(last)) return 'mu';
        if ('öü'.includes(last)) return 'mü';
        return 'mi';
    }

    // Key terms: words that are not stop words and are long enough to matter.
    function keywords(topic) {
        return topic
            .split(/[^\p{L}\p{N}]+/u)
            .filter((w) => w.length > 3 && !STOP_WORDS.has(w.toLocaleLowerCase('tr')))
            .slice(0, 4)
            .map(capitalize);
    }

    /* ---------- template detection ---------- */

    // Try to split the topic into two sides. Returns {a, b} or null.
    function splitComparison(topic) {
        const patterns = [
            /^(.+?)\s+(?:vs\.?|versus)\s+(.+)$/i,
            /^(.+?)\s+m[ıiuü]\s+yoksa\s+(.+?)\s+m[ıiuü]$/i,
            /^(.+?)\s+m[ıiuü]\s*,?\s+(.+?)\s+m[ıiuü]$/i,
            /^(.+?)\s+ile\s+(.+?)\s+(?:arasındaki\s+fark\w*|karşılaştırma\w*|farkı|farkları)$/i,
            /^(.+?)\s+(?:veya|ya da)\s+(.+)$/i
        ];
        for (const re of patterns) {
            const m = topic.match(re);
            if (m && m[1].trim() && m[2].trim()) {
                return { a: capitalize(m[1].trim()), b: capitalize(m[2].trim()) };
            }
        }
        return null;
    }

    function detectTemplate(topic) {
        if (splitComparison(topic)) return 'compare';
        if (/(nasıl|adım|rehber|kılavuz|yapılır|başlangıç|kurulum|tarif|öğren)/i.test(topic)) return 'steps';
        if (/(özet|kısaca|özetle|ana hatlar)/i.test(topic)) return 'summary';
        return 'intro';
    }

    // The words that made us pick a template ("nasıl yapılır", "kısaca") read
    // badly inside sentences, so strip them for the phrase placeholders.
    function coreTopic(topic, template) {
        const noise = {
            steps: /\s*(nasıl yapılır|nasıl|adım adım|rehberi|rehber|kılavuzu|kılavuz|tarifi|tarif|kurulumu|kurulum)\s*/gi,
            summary: /\s*(kısaca|özeti|özetle|özet|ana hatlarıyla|ana hatlar)\s*/gi
        };
        const re = noise[template];
        const core = re ? topic.replace(re, ' ').replace(/\s+/g, ' ').trim() : topic;
        return capitalize(core || topic);
    }

    /* ---------- phrase pools (Turkish, the topic never takes a suffix) ---------- */

    const POOLS = {
        whatIs: [
            'Tek cümleyle: {t}, ilk bakışta göründüğünden daha geniş bir konu.',
            'Temelinde birkaç basit fikir var; gerisi bu fikirlerin bileşimi.',
            'Günlük hayatta sandığımızdan daha sık karşımıza çıkıyor.',
            'Yeni bir şey değil, ama son yıllarda çok daha görünür hale geldi.',
            'Herkes için farklı bir anlam taşıyor; biz en yaygın olanına bakacağız.'
        ],
        why: [
            'Zaman ve para gibi kıt kaynakları doğrudan etkiliyor.',
            'Küçük bir bilgi farkı, sonuçta büyük fark yaratıyor.',
            'Bir kez anlaşıldığında etrafımızdaki pek çok şeyi açıklıyor.',
            'Konuşulmadığında yanlış anlaşılmalar birikiyor.',
            'Doğru sorular sormak, doğru cevaplar kadar değerli.'
        ],
        keyword: [
            '{k} — konuyu anlamanın ilk anahtarı.',
            '{k} — en çok karıştırılan kısım.',
            '{k} — pratikte en sık ihtiyaç duyulan parça.',
            '{k} — genellikle geç fark edilen ama vazgeçilmez detay.'
        ],
        keywordFallback: [
            'Birkaç temel terim öğrenmek, konunun büyük kısmını açıyor.',
            'Örnekler kurallardan daha çok şey öğretiyor.',
            'Kaynaklar bol; iyi bir başlangıç noktası seçmek yeterli.'
        ],
        sideA: [
            'Güçlü yanı: sadelik ve öngörülebilirlik.',
            'Öğrenmesi hızlı, ustalaşması zaman istiyor.',
            'Etrafında kalabalık bir topluluk ve bol örnek var.',
            'Küçük işlerde parlıyor, büyüdükçe dikkat istiyor.',
            'Sınırları belli; sürpriz az.'
        ],
        sideB: [
            'Güçlü yanı: esneklik ve geniş kullanım alanı.',
            'İlk adımı zor, sonrası akıcı.',
            'Daha genç, daha hızlı değişiyor.',
            'Büyük işlerde rahat, küçük işlerde biraz fazla gelebilir.',
            'Seçenek çok; karar vermek zaman alıyor.'
        ],
        criteria: [
            ['Öğrenme eğrisi', 'yumuşak', 'dik ama kısa'],
            ['Esneklik', 'sınırlı ama yeterli', 'geniş'],
            ['Maliyet', 'düşük', 'değişken'],
            ['Alışkanlık', 'klasik', 'yeni nesil'],
            ['Ritim', 'sakin', 'hızlı']
        ],
        before: [
            'Hedefi tek cümleyle yaz: ne bitince "oldu" diyeceksin?',
            'Gerekenleri önceden hazırla; yarıda durmak motivasyonu bozar.',
            'Kısa bir zaman ayır; ilk deneme mükemmel olmak zorunda değil.',
            'Bir örnek bul ve onu izleyerek başla.'
        ],
        step1: [
            'En küçük çalışan parçayla başla.',
            'Ne yapacağını değil, ilk on dakikada ne yapacağını planla.',
            'Elindekileri sırala; eksik olanı sonraya bırak.'
        ],
        step2: [
            'Sırayı bozmadan ilerle; atlanan adım sonra iki kat pahalı.',
            'Her adımdan sonra kısa bir kontrol yap.',
            'Takıldığın yeri not al, devam et; sonra geri dön.'
        ],
        step3: [
            'Sonucu baştaki hedefle karşılaştır.',
            'Bir başkasına göster; taze göz farkı görür.',
            'Bir sonraki sefer için tek bir iyileştirme seç.'
        ],
        mistakes: [
            'Hepsini bir kerede yapmaya çalışmak.',
            'Kontrol adımını atlamak.',
            'İlk sonucu son sonuç sanmak.',
            'Araçlara, işin kendisinden çok zaman harcamak.'
        ],
        summaryThree: [
            '{t}, öğrenmesi kolay ama derinleştikçe zenginleşen bir konu.',
            'En önemli üç nokta: temel kavramlar, doğru örnekler, düzenli pratik.',
            'Bir sonraki adım: bugün küçük bir deneme yapmak.',
            'Anlamak için ezberlemek değil, bağlantı kurmak gerekiyor.'
        ],
        pros: [
            'Başlangıç eşiği düşük.',
            'Kaynak ve örnek bol.',
            'Sonuçlar hızlı görülüyor.',
            'Merak eden herkes için erişilebilir.'
        ],
        cons: [
            'Ayrıntılarda kaybolmak kolay.',
            'Yanlış kaynak, yanlış alışkanlık demek.',
            'Düzenli pratik olmadan unutulur.',
            'İlk heyecan geçince süreklilik ister.'
        ],
        closing: [
            '{t} için tek cümle: küçük başla, düzenli ilerle, merak etmeyi bırakma.',
            '{t} konusunda en iyi başlangıç zamanı: bugün, küçük bir adımla.',
            'Unutma: {t} hakkında bilmek başka, denemek başka.'
        ]
    };

    /* ---------- slide builders ---------- */

    function bullets(title, items, extra) {
        return Object.assign({ layout: 'bullets', title, bullets: items }, extra || {});
    }

    function buildIntro(t, seed) {
        const keys = keywords(t);
        const keyItems = keys.length >= 2
            ? keys.map((k, i) => fill(POOLS.keyword[(seed + i) % POOLS.keyword.length], { k }))
            : pick(POOLS.keywordFallback, seed, 3);
        return [
            { layout: 'title', title: t, subtitle: pick(['Kısa ve net bir tanıtım', 'Beş dakikada genel bakış', 'Başlangıç için bilmen gerekenler'], seed, 1)[0] },
            bullets(`${t} nedir?`, pick(POOLS.whatIs, seed, 3).map((p) => fill(p, { t }))),
            bullets('Neden önemli?', pick(POOLS.why, seed >> 3, 3)),
            bullets('Anahtar kavramlar', keyItems),
            { layout: 'quote', title: 'Akılda kalsın', quote: fill(pick(POOLS.closing, seed, 1)[0], { t }) }
        ];
    }

    function buildCompare(t, seed, sides) {
        const { a, b } = sides;
        const rows = pick(POOLS.criteria, seed, 3);
        return [
            { layout: 'title', title: `${a} ${questionParticle(a)}, ${b} ${questionParticle(b)}?`, subtitle: 'Yan yana, dürüst bir karşılaştırma' },
            bullets(a, pick(POOLS.sideA, hash(a), 3)),
            bullets(b, pick(POOLS.sideB, hash(b), 3)),
            {
                layout: 'two-col',
                title: 'Yan yana',
                left: { head: a, items: rows.map((r) => `${r[0]}: ${r[1]}`) },
                right: { head: b, items: rows.map((r) => `${r[0]}: ${r[2]}`) }
            },
            bullets('Hangisi ne zaman?', [
                `Hız ve sadelik öncelikliyse: ${a}.`,
                `Esneklik ve çeşitlilik öncelikliyse: ${b}.`,
                'Kararsızsan: bir gün birini, ertesi gün diğerini dene.'
            ]),
            { layout: 'quote', title: 'Sonuç', quote: `Doğru cevap yok; ${a} ile ${b}, farklı sorulara verilmiş iki cevap.` }
        ];
    }

    // `topic` is the full line for the title slide, `t` the core phrase for sentences.
    function buildSteps(topic, seed, sides, t) {
        return [
            { layout: 'title', title: topic, subtitle: 'Adım adım, kaybolmadan' },
            bullets('Başlamadan önce', pick(POOLS.before, seed, 3)),
            bullets('Hazırlık', pick(POOLS.step1, seed, 2), { layout: 'step', number: 1 }),
            bullets('Uygulama', pick(POOLS.step2, seed >> 2, 2), { layout: 'step', number: 2 }),
            bullets('Kontrol', pick(POOLS.step3, seed >> 4, 2), { layout: 'step', number: 3 }),
            bullets('Sık yapılan hatalar', pick(POOLS.mistakes, seed, 3)),
            { layout: 'quote', title: 'Bitirirken', quote: fill(POOLS.closing[1], { t }) }
        ];
    }

    function buildSummary(topic, seed, sides, t) {
        return [
            { layout: 'title', title: topic, subtitle: 'Özet: en önemli noktalar' },
            bullets('Üç cümleyle', pick(POOLS.summaryThree, seed, 3).map((p) => fill(p, { t }))),
            {
                layout: 'two-col',
                title: 'Artıları ve dikkat edilecekler',
                left: { head: 'Artıları', items: pick(POOLS.pros, seed, 3) },
                right: { head: 'Dikkat', items: pick(POOLS.cons, seed >> 1, 3) }
            },
            { layout: 'quote', title: 'Tek cümle', quote: fill(pick(POOLS.closing, seed >> 2, 1)[0], { t }) }
        ];
    }

    /* ---------- public entry point ---------- */

    // Returns { topic, template, templateLabel, theme, slides, sides }.
    function plan(rawTopic) {
        const topic = cleanTopic(rawTopic);
        if (!topic) throw new Error('Konu boş olamaz.');
        const template = detectTemplate(topic);
        const seed = hash(topic);
        const sides = template === 'compare' ? splitComparison(topic) : null;
        const builders = { intro: buildIntro, compare: buildCompare, steps: buildSteps, summary: buildSummary };
        const slides = builders[template](topic, seed, sides, coreTopic(topic, template));
        const themes = THEME_CHOICES[template];
        return {
            topic,
            template,
            templateLabel: TEMPLATES[template],
            theme: themes[seed % themes.length],
            slides,
            sides
        };
    }

    return { plan, detectTemplate, splitComparison, cleanTopic, coreTopic, questionParticle, keywords, TEMPLATES };
});
