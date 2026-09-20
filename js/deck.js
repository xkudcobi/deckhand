/*
 * Deck: the slide model plus everything that draws it.
 *
 * Both the human and the assistant go through the same functions here
 * (addSlide, setField, setTheme, ...). The `byUser` flag is what lets the
 * assistant stay polite: whatever a person touched gets marked as edited and
 * the assistant refuses to overwrite it afterwards.
 */
const Deck = (function () {
    'use strict';

    const LAYOUTS = ['title', 'bullets', 'two-col', 'step', 'quote'];
    const LAYOUT_LABELS = { title: 'başlık', bullets: 'madde', 'two-col': 'iki sütun', step: 'adım', quote: 'alıntı' };

    // Slide look and feel. Kept as a string so the exported single-file HTML
    // can embed exactly the same rules the editor uses.
    const SLIDE_CSS = `
.slide-box{container-type:inline-size;width:100%}
.slide{position:relative;box-sizing:border-box;width:100%;aspect-ratio:16/9;background:var(--bg);color:var(--ink);font-family:var(--font);padding:6% 7%;display:flex;flex-direction:column;justify-content:center;gap:.5em;font-size:2.6cqw;overflow:hidden;line-height:1.35}
.slide::after{content:'';position:absolute;left:7%;bottom:7%;width:10%;height:.22em;background:var(--accent);border-radius:1em}
.slide h1{font-size:2em;margin:0 0 .3em;font-weight:700;letter-spacing:-.01em}
.slide .subtitle{font-size:1.25em;color:var(--muted);margin:0}
.slide.layout-title{align-items:center;text-align:center}
.slide.layout-title h1{font-size:2.8em}
.slide.layout-title::after{left:45%}
.slide ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.45em}
.slide li{position:relative;padding-left:1.3em;font-size:1.15em}
.slide li::before{content:'';position:absolute;left:0;top:.5em;width:.5em;height:.5em;border-radius:.12em;background:var(--accent);transform:rotate(45deg)}
.slide .cols{display:grid;grid-template-columns:1fr 1fr;gap:2.5em}
.slide .col h3{margin:0 0 .5em;font-size:1.3em;color:var(--accent2);border-bottom:2px solid var(--accent2);padding-bottom:.2em}
.slide .col:last-child h3{color:var(--accent);border-color:var(--accent)}
.slide .col:last-child li::before{background:var(--accent2)}
.slide .step-num{width:2.2em;height:2.2em;border-radius:50%;background:var(--accent);color:var(--bg);display:flex;align-items:center;justify-content:center;font-size:1.6em;font-weight:700;margin-bottom:.3em}
.slide.layout-quote h1{font-size:1.1em;color:var(--muted);text-transform:uppercase;letter-spacing:.15em}
.slide blockquote{margin:0;padding-left:.8em;border-left:.25em solid var(--accent);font-size:1.7em;font-style:italic;line-height:1.3}
.slide [contenteditable]{outline:none;border-radius:.15em;transition:box-shadow .15s}
.slide [contenteditable]:focus{box-shadow:0 0 0 .12em var(--accent2)}
.slide [contenteditable]:empty::before{content:attr(data-ph);color:var(--muted);opacity:.7}
`;

    const state = { theme: 'gece', themeLocked: false, slides: [], selectedId: null };
    let uid = 0;
    let els = {};
    let presentIndex = 0;

    /* ---------- helpers ---------- */

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function getPath(obj, path) {
        return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
    }

    function setPath(obj, path, value) {
        const parts = path.split('.');
        const last = parts.pop();
        parts.reduce((o, k) => o[k], obj)[last] = value;
    }

    function blankSlide(layout) {
        return {
            id: ++uid,
            layout: LAYOUTS.includes(layout) ? layout : 'bullets',
            title: '',
            subtitle: '',
            bullets: [],
            left: { head: '', items: [] },
            right: { head: '', items: [] },
            number: 1,
            quote: '',
            edited: {},        // field path -> true once a person typed there
            layoutLocked: false
        };
    }

    function indexOf(id) {
        return state.slides.findIndex((s) => s.id === id);
    }

    function getSlide(id) {
        return state.slides.find((s) => s.id === id) || null;
    }

    function selected() {
        return getSlide(state.selectedId);
    }

    /* ---------- model operations ---------- */

    // Insert a slide after `afterId` (or after the selection, or at the end).
    function addSlide(layout, afterId, byUser) {
        const slide = blankSlide(layout);
        const anchor = afterId != null ? indexOf(afterId) : indexOf(state.selectedId);
        const at = anchor === -1 ? state.slides.length : anchor + 1;
        state.slides.splice(at, 0, slide);
        if (byUser || !stageHasFocus()) state.selectedId = slide.id;
        renderAll();
        return slide;
    }

    function removeSlide(id) {
        const i = indexOf(id);
        if (i === -1) return;
        state.slides.splice(i, 1);
        if (state.selectedId === id) {
            const next = state.slides[Math.min(i, state.slides.length - 1)];
            state.selectedId = next ? next.id : null;
        }
        renderAll();
    }

    function moveSlide(id, dir) {
        const i = indexOf(id);
        const j = i + dir;
        if (i === -1 || j < 0 || j >= state.slides.length) return false;
        [state.slides[i], state.slides[j]] = [state.slides[j], state.slides[i]];
        renderAll();
        return true;
    }

    function setLayout(id, layout, byUser) {
        const slide = getSlide(id);
        if (!slide || !LAYOUTS.includes(layout)) return;
        slide.layout = layout;
        if (byUser) slide.layoutLocked = true;
        renderAll();
    }

    function cycleLayout(id, byUser) {
        const slide = getSlide(id);
        if (!slide) return;
        setLayout(id, LAYOUTS[(LAYOUTS.indexOf(slide.layout) + 1) % LAYOUTS.length], byUser);
    }

    function setTheme(name, byUser) {
        if (!Themes.THEMES[name]) return;
        state.theme = name;
        if (byUser) state.themeLocked = true;
        applyTheme();
    }

    // Write a value into a slide field. Path examples: "title", "bullets",
    // "left.head", "right.items". Arrays are copied so callers can't alias.
    function setField(id, path, value, byUser) {
        const slide = getSlide(id);
        if (!slide) return false;
        setPath(slide, path, Array.isArray(value) ? value.slice() : value);
        if (byUser) slide.edited[path] = true;
        patchField(slide, path);
        return true;
    }

    function isEdited(id, path) {
        const slide = getSlide(id);
        return !slide || !!slide.edited[path];
    }

    function select(id) {
        if (!getSlide(id)) return;
        state.selectedId = id;
        renderAll();
    }

    function reset() {
        state.slides = [];
        state.selectedId = null;
        state.themeLocked = false;
        renderAll();
    }

    /* ---------- rendering ---------- */

    function stageHasFocus() {
        return els.stage.contains(document.activeElement) && document.activeElement !== els.stage;
    }

    // One slide as HTML. `editable` adds contenteditable + data-field hooks so
    // the same markup serves the editor, the presenter and the export.
    function slideHtml(slide, editable) {
        const ce = editable ? ' contenteditable="true"' : '';
        const field = (path, ph) => (editable ? ` data-field="${path}" data-ph="${ph}"` : '');
        const list = (path, items, ph) => {
            const lis = (items.length || !editable ? items : ['']).map((t) => `<li${ce}${editable ? ' data-item' : ''}>${escapeHtml(t)}</li>`).join('');
            return `<ul${field(path, ph)}>${lis}</ul>`;
        };
        let body = '';
        switch (slide.layout) {
            case 'title':
                body = `<h1${ce}${field('title', 'Başlık')}>${escapeHtml(slide.title)}</h1>` +
                    `<p class="subtitle"${ce}${field('subtitle', 'Alt başlık')}>${escapeHtml(slide.subtitle)}</p>`;
                break;
            case 'two-col':
                body = `<h1${ce}${field('title', 'Başlık')}>${escapeHtml(slide.title)}</h1><div class="cols">` +
                    `<div class="col"><h3${ce}${field('left.head', 'Sol')}>${escapeHtml(slide.left.head)}</h3>${list('left.items', slide.left.items, 'madde')}</div>` +
                    `<div class="col"><h3${ce}${field('right.head', 'Sağ')}>${escapeHtml(slide.right.head)}</h3>${list('right.items', slide.right.items, 'madde')}</div></div>`;
                break;
            case 'step':
                body = `<div class="step-num">${slide.number}</div><h1${ce}${field('title', 'Adım başlığı')}>${escapeHtml(slide.title)}</h1>` +
                    list('bullets', slide.bullets, 'Bir madde yaz');
                break;
            case 'quote':
                body = `<h1${ce}${field('title', 'Küçük başlık')}>${escapeHtml(slide.title)}</h1>` +
                    `<blockquote${ce}${field('quote', 'Akılda kalacak bir cümle')}>${escapeHtml(slide.quote)}</blockquote>`;
                break;
            default:
                body = `<h1${ce}${field('title', 'Başlık')}>${escapeHtml(slide.title)}</h1>` + list('bullets', slide.bullets, 'Bir madde yaz');
        }
        return `<div class="slide layout-${slide.layout}" data-id="${slide.id}">${body}</div>`;
    }

    function applyTheme() {
        els.stage.style.cssText = Themes.cssVars(state.theme);
        els.presentSlide.style.cssText = Themes.cssVars(state.theme);
        document.querySelectorAll('#theme-group .swatch').forEach((b) => b.classList.toggle('active', b.dataset.theme === state.theme));
        document.querySelectorAll('#slide-list .mini').forEach((m) => { m.style.cssText = Themes.cssVars(state.theme); });
    }

    function renderList() {
        els.list.innerHTML = state.slides.map((s, i) => `
            <div class="thumb${s.id === state.selectedId ? ' selected' : ''}" data-id="${s.id}">
                <span class="num">${i + 1}</span>
                <div class="mini" style="${Themes.cssVars(state.theme)}"><div class="mini-inner slide-box">${slideHtml(s, false)}</div></div>
            </div>`).join('');
        const sel = els.list.querySelector('.thumb.selected');
        if (sel) sel.scrollIntoView({ block: 'nearest' });
    }

    function renderStage() {
        const slide = selected();
        els.stage.innerHTML = slide ? slideHtml(slide, true) : '<div class="empty">Henüz slayt yok. Yukarıya bir konu yaz ya da "+ Yeni slayt" düğmesine bas.</div>';
        els.layoutName.textContent = slide ? LAYOUT_LABELS[slide.layout] : '—';
    }

    function renderAll() {
        // Step slides are numbered by their position, so moving one renumbers all.
        let n = 0;
        state.slides.forEach((s) => { if (s.layout === 'step') s.number = ++n; });
        renderList();
        renderStage();
        applyTheme();
    }

    // Update just one field on screen. Skips the element if the person is
    // typing inside it right now so the assistant never steals a caret.
    function patchField(slide, path) {
        const thumb = els.list.querySelector(`.thumb[data-id="${slide.id}"] .mini-inner`);
        if (thumb) thumb.innerHTML = slideHtml(slide, false);
        if (slide.id !== state.selectedId) return;
        const el = els.stage.querySelector(`[data-field="${path}"]`);
        if (!el || el.contains(document.activeElement)) return;
        const value = getPath(slide, path);
        if (Array.isArray(value)) {
            el.innerHTML = (value.length ? value : ['']).map((t) => `<li contenteditable="true" data-item>${escapeHtml(t)}</li>`).join('');
        } else {
            el.textContent = value;
        }
    }

    /* ---------- editing events (human input) ---------- */

    function readListField(ul) {
        return Array.from(ul.querySelectorAll('li')).map((li) => li.textContent.replace(/\n/g, ' ').trim()).filter((t, i, arr) => t || arr.length === 1);
    }

    function onStageInput(e) {
        const slide = selected();
        if (!slide) return;
        const li = e.target.closest('li[data-item]');
        const fieldEl = li ? li.closest('[data-field]') : e.target.closest('[data-field]');
        if (!fieldEl) return;
        const path = fieldEl.dataset.field;
        const value = li ? readListField(fieldEl) : fieldEl.textContent.replace(/\n/g, ' ');
        setPath(slide, path, value);
        slide.edited[path] = true;
        const thumb = els.list.querySelector(`.thumb[data-id="${slide.id}"] .mini-inner`);
        if (thumb) thumb.innerHTML = slideHtml(slide, false);
    }

    function onStageKeydown(e) {
        const li = e.target.closest('li[data-item]');
        if (e.key === 'Enter') {
            e.preventDefault();
            if (!li) { e.target.blur(); return; }
            // Enter inside a list creates a new bullet right below.
            const fresh = document.createElement('li');
            fresh.contentEditable = 'true';
            fresh.dataset.item = '';
            li.after(fresh);
            fresh.focus();
            onStageInput({ target: fresh });
        } else if (e.key === 'Backspace' && li && li.textContent === '' && li.parentNode.children.length > 1) {
            // Backspace on an empty bullet removes it and jumps to the previous one.
            e.preventDefault();
            const prev = li.previousElementSibling || li.nextElementSibling;
            const ul = li.parentNode;
            li.remove();
            placeCaretAtEnd(prev);
            onStageInput({ target: ul.querySelector('li') });
        }
    }

    function placeCaretAtEnd(el) {
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function onStagePaste(e) {
        // Keep pasted content plain so no foreign HTML sneaks into slides.
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\s+/g, ' ');
        document.execCommand('insertText', false, text);
    }

    /* ---------- presenting ---------- */

    function present() {
        if (!state.slides.length) return;
        presentIndex = Math.max(0, indexOf(state.selectedId));
        els.present.hidden = false;
        renderPresent();
        document.addEventListener('keydown', onPresentKey);
        if (els.present.requestFullscreen) els.present.requestFullscreen().catch(() => {});
    }

    function closePresent() {
        els.present.hidden = true;
        document.removeEventListener('keydown', onPresentKey);
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }

    function stepPresent(dir) {
        presentIndex = Math.min(state.slides.length - 1, Math.max(0, presentIndex + dir));
        renderPresent();
    }

    function renderPresent() {
        const slide = state.slides[presentIndex];
        if (!slide) { closePresent(); return; }
        els.presentSlide.innerHTML = slideHtml(slide, false);
        els.presentCount.textContent = `${presentIndex + 1} / ${state.slides.length}`;
    }

    function onPresentKey(e) {
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') stepPresent(1);
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') stepPresent(-1);
        else if (e.key === 'Escape') closePresent();
        else return;
        e.preventDefault();
    }

    /* ---------- export ---------- */

    // A standalone HTML file: theme variables, the shared slide CSS and a
    // few lines of script for arrow-key navigation. No external references.
    function exportHtml(title) {
        const slides = state.slides.map((s) => `<div class="slide-box">${slideHtml(s, false)}</div>`).join('\n');
        return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title || 'Sunum')}</title>
<style>
html,body{margin:0;height:100%;background:#111;${Themes.cssVars(state.theme)}}
body{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;font-family:sans-serif;color:#aaa}
.slide-box{display:none;width:min(100vw,177.7vh)}
.slide-box.on{display:block}
.nav{font-size:14px;user-select:none}
.nav button{background:#333;color:#eee;border:0;border-radius:6px;padding:4px 10px;margin:0 6px;cursor:pointer}
${SLIDE_CSS}
</style></head><body>
${slides}
<div class="nav"><button id="p">‹</button><span id="c"></span><button id="n">›</button></div>
<script>
(function(){var b=document.querySelectorAll('.slide-box'),i=0,c=document.getElementById('c');
function show(k){i=Math.max(0,Math.min(b.length-1,k));b.forEach(function(x,j){x.classList.toggle('on',j===i)});c.textContent=(i+1)+' / '+b.length}
document.getElementById('p').onclick=function(){show(i-1)};document.getElementById('n').onclick=function(){show(i+1)};
document.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key===' ')show(i+1);else if(e.key==='ArrowLeft')show(i-1)});
document.addEventListener('click',function(e){if(e.target.closest('.slide'))show(i+1)});show(0)})();
<\/script></body></html>`;
    }

    function download(title) {
        if (!state.slides.length) return;
        const safe = (title || 'sunum').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'sunum';
        const blob = new Blob([exportHtml(title)], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safe}.html`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /* ---------- wiring ---------- */

    function init() {
        els = {
            stage: document.getElementById('stage'),
            list: document.getElementById('slide-list'),
            layoutName: document.getElementById('layout-name'),
            present: document.getElementById('present'),
            presentSlide: document.getElementById('present-slide'),
            presentCount: document.getElementById('present-count')
        };
        const style = document.createElement('style');
        style.textContent = SLIDE_CSS;
        document.head.appendChild(style);

        els.stage.addEventListener('input', onStageInput);
        els.stage.addEventListener('keydown', onStageKeydown);
        els.stage.addEventListener('paste', onStagePaste);
        els.list.addEventListener('click', (e) => {
            const thumb = e.target.closest('.thumb');
            if (thumb) select(Number(thumb.dataset.id));
        });
        document.getElementById('present-prev').addEventListener('click', () => stepPresent(-1));
        document.getElementById('present-next').addEventListener('click', () => stepPresent(1));
        document.getElementById('present-close').addEventListener('click', closePresent);
        els.presentSlide.addEventListener('click', () => stepPresent(1));
        renderAll();
    }

    return {
        LAYOUTS, LAYOUT_LABELS, state,
        init, addSlide, removeSlide, moveSlide, setLayout, cycleLayout, setTheme,
        setField, isEdited, select, reset, getSlide, selected, stageHasFocus,
        present, download, exportHtml
    };
})();
