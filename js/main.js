/*
 * Wires the toolbar, the topic box and the assistant together, then kicks
 * off the opening demo so the page is never empty.
 */
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);

    function currentTopic() {
        return $('topic-input').value.trim();
    }

    // Start a fresh build for whatever is in the topic box.
    function buildFromInput() {
        const input = $('topic-input');
        let plan;
        try {
            plan = Planner.plan(input.value);
        } catch (err) {
            // Empty topic: shake the box instead of building nothing.
            input.classList.remove('shake');
            void input.offsetWidth;
            input.classList.add('shake');
            input.focus();
            return;
        }
        input.value = plan.topic;
        Assistant.build(plan);
    }

    function selectedId() {
        const s = Deck.selected();
        return s ? s.id : null;
    }

    function wireToolbar() {
        $('btn-new').addEventListener('click', () => {
            const slide = Deck.addSlide('bullets', null, true);
            const title = document.querySelector(`#stage [data-id="${slide.id}"] [data-field="title"]`);
            if (title) title.focus();
        });
        $('btn-delete').addEventListener('click', () => {
            const id = selectedId();
            if (id == null) return;
            Deck.removeSlide(id);
            Assistant.notice('delete');
        });
        $('btn-up').addEventListener('click', () => {
            if (Deck.moveSlide(selectedId(), -1)) Assistant.notice('move');
        });
        $('btn-down').addEventListener('click', () => {
            if (Deck.moveSlide(selectedId(), 1)) Assistant.notice('move');
        });
        $('btn-layout').addEventListener('click', () => {
            const id = selectedId();
            if (id == null) return;
            Deck.cycleLayout(id, true);
            Assistant.notice('layout');
        });
        $('theme-group').addEventListener('click', (e) => {
            const swatch = e.target.closest('.swatch');
            if (!swatch) return;
            Deck.setTheme(swatch.dataset.theme, true);
            Assistant.notice('theme');
        });
        $('btn-present').addEventListener('click', () => Deck.present());
        $('btn-download').addEventListener('click', () => Deck.download(currentTopic() || 'sunum'));
    }

    function wireTopic() {
        $('topic-form').addEventListener('submit', (e) => {
            e.preventDefault();
            buildFromInput();
        });
        $('chips').addEventListener('click', (e) => {
            const chip = e.target.closest('[data-topic]');
            if (!chip) return;
            $('topic-input').value = chip.dataset.topic;
            buildFromInput();
        });
    }

    // Paint the swatches with their theme colours so they explain themselves.
    function paintSwatches() {
        document.querySelectorAll('#theme-group .swatch').forEach((b) => {
            const t = Themes.THEMES[b.dataset.theme];
            b.style.background = `linear-gradient(135deg, ${t.bg} 50%, ${t.accent} 50%)`;
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        Deck.init();
        Assistant.init();
        paintSwatches();
        wireToolbar();
        wireTopic();
        // Opening demo: the page starts building the prefilled topic on its own.
        setTimeout(buildFromInput, 600);
    });
})();
