/*
 * The visible assistant.
 *
 * Takes a plan from Planner and performs it slowly enough to watch: moves a
 * fake cursor to the real toolbar buttons, presses them, clicks into slide
 * fields and types character by character (with the occasional typo it then
 * fixes). It never bypasses Deck's edited-flags, so anything a person has
 * touched is left alone.
 */
const Assistant = (function () {
    'use strict';

    let els = {};
    let token = 0;          // bumped on every new build; old runs notice and stop
    let paused = false;
    let speed = 1;
    let busy = false;

    const TEMPLATE_NOTES = {
        intro: 'Bu bir tanıtım konusu; nedir, neden önemli, anahtar kavramlar diye gideceğim.',
        compare: 'İki şey karşılaştırılıyor. Önce ayrı ayrı, sonra yan yana koyacağım.',
        steps: 'Bu bir "nasıl yapılır" konusu; adım adım şablonu kullanıyorum.',
        summary: 'Kısa bir özet istenmiş; az slayt, net cümleler.'
    };

    const THEME_NOTES = {
        gece: 'Koyu lacivert üstüne sıcak bir vurgu iyi durur.',
        kagit: 'Kağıt gibi açık bir zemin; sade ve okunaklı.',
        orman: 'Adım adım işler için sakin bir yeşil seçiyorum.',
        ikili: 'Karşılaştırma için iki zıt renkli bir tema.',
        seker: 'Biraz renk: pembe ve mor.'
    };

    /* ---------- speech + avatar ---------- */

    function say(text) {
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.textContent = text;
        els.log.appendChild(bubble);
        // Keep the log short; old thoughts are not interesting.
        while (els.log.children.length > 8) els.log.firstChild.remove();
        els.log.scrollTop = els.log.scrollHeight;
        els.avatar.classList.add('talking');
        clearTimeout(say.timer);
        say.timer = setTimeout(() => els.avatar.classList.remove('talking'), 900);
    }

    // Pupils glance toward where the cursor is heading.
    function lookAt(x, y) {
        const r = els.avatar.getBoundingClientRect();
        const dx = x - (r.left + r.width / 2);
        const dy = y - (r.top + r.height / 2);
        const len = Math.hypot(dx, dy) || 1;
        const px = (dx / len) * 4;
        const py = (dy / len) * 4;
        els.avatar.querySelectorAll('.pupil').forEach((p) => { p.style.transform = `translate(${px}px, ${py}px)`; });
    }

    /* ---------- timing ---------- */

    // Sleep that respects pause and speed. Resolves immediately when the run
    // has been superseded; the caller then throws via check().
    function wait(ms, tk) {
        return new Promise((resolve) => {
            const tick = () => {
                if (tk !== token) return resolve();
                if (paused) return setTimeout(tick, 120);
                setTimeout(resolve, ms / speed);
            };
            tick();
        });
    }

    function check(tk) {
        if (tk !== token) throw new Error('superseded');
    }

    /* ---------- cursor + pressing ---------- */

    async function moveTo(target, tk) {
        const r = target.getBoundingClientRect();
        const x = r.left + Math.min(r.width / 2, 60) + window.scrollX;
        const y = r.top + r.height / 2 + window.scrollY;
        els.cursor.style.transform = `translate(${x}px, ${y}px)`;
        lookAt(x, y);
        await wait(380, tk);
        check(tk);
    }

    // Visually press a toolbar button, then run the precise action. The button
    // is real, the click animation is real; only the handler is targeted so a
    // human changing the selection mid-way cannot redirect the assistant.
    async function press(button, action, tk) {
        await moveTo(button, tk);
        button.classList.add('pressed');
        els.cursor.classList.add('down');
        await wait(140, tk);
        button.classList.remove('pressed');
        els.cursor.classList.remove('down');
        check(tk);
        const result = action();
        await wait(220, tk);
        check(tk);
        return result;
    }

    // Put the cursor on a slide field if that slide is on the stage.
    async function focusField(slideId, path, tk) {
        if (Deck.state.selectedId !== slideId) return;
        const el = els.stage.querySelector(`[data-field="${path}"]`);
        if (el) await moveTo(el, tk);
    }

    /* ---------- typing ---------- */

    // Character delay with a little jitter so it doesn't feel mechanical.
    function charDelay(ch) {
        if (ch === ' ') return 55;
        if ('.,;:!?'.includes(ch)) return 160;
        return 32 + ((ch.charCodeAt(0) * 7) % 30);
    }

    // Type `text` into a plain field. Returns false if the field was taken
    // over by the person before we finished.
    async function typeText(slideId, path, text, tk, opts) {
        if (Deck.isEdited(slideId, path)) {
            say('Burayı sen değiştirmişsin, dokunmuyorum.');
            return false;
        }
        await focusField(slideId, path, tk);
        const typoAt = opts && opts.typo && text.length > 12 ? 3 + (text.length * 7) % (text.length - 6) : -1;
        let current = '';
        for (let i = 0; i < text.length; i++) {
            check(tk);
            if (Deck.isEdited(slideId, path)) {
                say('Sen devraldın, ben çekiliyorum.');
                return false;
            }
            if (i === typoAt) {
                // Hit a neighbouring key, notice, and backspace it away.
                const wrong = String.fromCharCode(text.charCodeAt(i) + 1);
                Deck.setField(slideId, path, current + wrong, false);
                await wait(260, tk);
                Deck.setField(slideId, path, current, false);
                await wait(140, tk);
            }
            current += text[i];
            Deck.setField(slideId, path, current, false);
            await wait(charDelay(text[i]), tk);
        }
        return true;
    }

    // Delete `count` characters from the end of a field, one by one.
    async function backspace(slideId, path, count, tk) {
        const slide = Deck.getSlide(slideId);
        if (!slide) return;
        let current = path.split('.').reduce((o, k) => o[k], slide);
        for (let i = 0; i < count; i++) {
            check(tk);
            if (Deck.isEdited(slideId, path)) return;
            current = current.slice(0, -1);
            Deck.setField(slideId, path, current, false);
            await wait(45, tk);
        }
    }

    // Type a list of bullets, one bullet at a time.
    async function typeList(slideId, path, items, tk) {
        if (Deck.isEdited(slideId, path)) {
            say('Maddeleri sen yazmışsın, ellemiyorum.');
            return false;
        }
        await focusField(slideId, path, tk);
        const done = [];
        for (const item of items) {
            let current = '';
            for (const ch of item) {
                check(tk);
                if (Deck.isEdited(slideId, path)) {
                    say('Sen devraldın, ben çekiliyorum.');
                    return false;
                }
                current += ch;
                Deck.setField(slideId, path, done.concat(current), false);
                await wait(charDelay(ch), tk);
            }
            done.push(item);
            await wait(180, tk);
        }
        return true;
    }

    /* ---------- the build script ---------- */

    function slideNote(spec, index) {
        if (spec.layout === 'two-col') return 'İkisini yan yana koyunca fark daha iyi görünüyor.';
        if (spec.layout === 'step') return `${spec.number}. adım.`;
        if (spec.layout === 'quote') return 'Sona akılda kalacak tek bir cümle.';
        if (index === 1) return 'Bunu buraya koyayım.';
        if (index === 2) return 'Başlıkları kısa tutuyorum.';
        return null;
    }

    async function buildSlide(spec, index, lastId, tk) {
        const note = slideNote(spec, index);
        if (note) say(note);

        // Create the slide: politely in the background if the person is typing.
        let slide;
        if (Deck.stageHasFocus()) {
            say('Sen yazarken araya girmeyeyim; yeni slaydı arkada ekliyorum.');
            slide = Deck.addSlide('bullets', lastId, false);
        } else {
            slide = await press(els.btnNew, () => Deck.addSlide('bullets', lastId, false), tk);
        }

        // Cycle the layout button until it shows the wanted layout.
        let guard = 0;
        while (slide.layout !== spec.layout && !slide.layoutLocked && guard++ < Deck.LAYOUTS.length) {
            await press(els.btnLayout, () => Deck.cycleLayout(slide.id, false), tk);
        }

        // Fill the fields that exist for this layout.
        switch (spec.layout) {
            case 'title':
                await typeText(slide.id, 'title', spec.title, tk, { typo: true });
                await typeText(slide.id, 'subtitle', spec.subtitle, tk);
                break;
            case 'two-col':
                await typeText(slide.id, 'title', spec.title, tk);
                await typeText(slide.id, 'left.head', spec.left.head, tk);
                await typeList(slide.id, 'left.items', spec.left.items, tk);
                await typeText(slide.id, 'right.head', spec.right.head, tk);
                await typeList(slide.id, 'right.items', spec.right.items, tk);
                break;
            case 'quote':
                await typeText(slide.id, 'title', spec.title, tk);
                await typeText(slide.id, 'quote', spec.quote, tk, { typo: true });
                break;
            default: {
                // On the second slide, overshoot the title and trim it back: a
                // small visible "second thought".
                const revise = index === 1;
                const ok = await typeText(slide.id, 'title', spec.title + (revise ? ' hakkında' : ''), tk, { typo: index > 1 });
                if (ok && revise) {
                    await wait(400, tk);
                    say('Hmm, fazla uzun oldu; kısaltayım.');
                    await backspace(slide.id, 'title', ' hakkında'.length, tk);
                }
                await typeList(slide.id, 'bullets', spec.bullets, tk);
            }
        }
        return slide.id;
    }

    async function build(plan) {
        const tk = ++token;
        busy = true;
        paused = false;
        els.btnPause.textContent = 'Duraklat';
        Deck.reset();
        els.log.innerHTML = '';
        try {
            say(`Konuyu okudum: "${plan.topic}".`);
            await wait(700, tk);
            say(TEMPLATE_NOTES[plan.template]);
            await wait(900, tk);

            if (Deck.state.themeLocked) {
                say('Temayı sen seçmişsin, ona dokunmuyorum.');
            } else {
                say(THEME_NOTES[plan.theme]);
                const swatch = els.themeGroup.querySelector(`[data-theme="${plan.theme}"]`);
                await press(swatch, () => Deck.setTheme(plan.theme, false), tk);
            }

            let lastId = null;
            for (let i = 0; i < plan.slides.length; i++) {
                check(tk);
                lastId = await buildSlide(plan.slides[i], i, lastId, tk);
                await wait(500, tk);
            }
            say('Hazır. İstediğin yeri düzelt; ben artık karışmam.');
            await moveTo(els.avatar, tk);
        } catch (err) {
            if (err.message !== 'superseded') throw err;
        } finally {
            if (tk === token) busy = false;
        }
    }

    /* ---------- reactions to the person's actions ---------- */

    function notice(kind) {
        if (!busy) return;
        const lines = {
            theme: 'Tema senin; ben artık değiştirmem.',
            move: 'Sırayı değiştirdin, tamam; ben kendi slaytlarımı ekliyorum.',
            delete: 'Sildin; o slayda geri dönmem.',
            layout: 'Düzeni sen seçtin; o slaytta düzeni bir daha çevirmem.'
        };
        if (lines[kind]) say(lines[kind]);
    }

    /* ---------- controls ---------- */

    function togglePause() {
        paused = !paused;
        els.btnPause.textContent = paused ? 'Devam et' : 'Duraklat';
        if (!busy) return;
        say(paused ? 'Duruyorum; hazır olunca "Devam et" de.' : 'Devam ediyorum.');
    }

    function cycleSpeed() {
        speed = speed >= 4 ? 1 : speed * 2;
        els.btnSpeed.textContent = `Hız: ${speed}x`;
    }

    function init() {
        els = {
            log: document.getElementById('log'),
            avatar: document.getElementById('avatar'),
            cursor: document.getElementById('cursor'),
            stage: document.getElementById('stage'),
            btnNew: document.getElementById('btn-new'),
            btnLayout: document.getElementById('btn-layout'),
            btnPause: document.getElementById('btn-pause'),
            btnSpeed: document.getElementById('btn-speed'),
            themeGroup: document.getElementById('theme-group')
        };
        els.btnPause.addEventListener('click', togglePause);
        els.btnSpeed.addEventListener('click', cycleSpeed);
        // Park the cursor by the avatar until there is work to do.
        const r = els.avatar.getBoundingClientRect();
        els.cursor.style.transform = `translate(${r.left + r.width / 2}px, ${r.top + r.height + 8}px)`;
    }

    return { init, build, say, notice, isBusy: () => busy };
})();
