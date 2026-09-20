/*
 * Colour themes. Each theme is a small set of CSS custom properties that the
 * stage, the presenter overlay and the exported HTML all share.
 */
const Themes = (function () {
    'use strict';

    const THEMES = {
        gece: { label: 'Gece', bg: '#14213d', ink: '#f5f2ea', accent: '#fca311', accent2: '#8ecae6', muted: 'rgba(245,242,234,0.65)', font: 'Georgia, "Times New Roman", serif' },
        kagit: { label: 'Kağıt', bg: '#f6f1e7', ink: '#2b2b2b', accent: '#c0392b', accent2: '#2a6f97', muted: 'rgba(43,43,43,0.6)', font: '"Segoe UI", Helvetica, Arial, sans-serif' },
        orman: { label: 'Orman', bg: '#1b4332', ink: '#d8f3dc', accent: '#95d5b2', accent2: '#ffd166', muted: 'rgba(216,243,220,0.65)', font: '"Segoe UI", Helvetica, Arial, sans-serif' },
        ikili: { label: 'İkili', bg: '#0b3c49', ink: '#f4f4f4', accent: '#ff6b6b', accent2: '#4ecdc4', muted: 'rgba(244,244,244,0.65)', font: '"Trebuchet MS", Helvetica, Arial, sans-serif' },
        seker: { label: 'Şeker', bg: '#fff0f6', ink: '#4a1942', accent: '#ff4d8d', accent2: '#7b2cbf', muted: 'rgba(74,25,66,0.6)', font: '"Segoe UI", Helvetica, Arial, sans-serif' }
    };

    // Build a CSS declaration block for a theme, e.g. "--bg:#14213d;--ink:...".
    function cssVars(name) {
        const t = THEMES[name] || THEMES.gece;
        return `--bg:${t.bg};--ink:${t.ink};--accent:${t.accent};--accent2:${t.accent2};--muted:${t.muted};--font:${t.font};`;
    }

    return { THEMES, cssVars, names: Object.keys(THEMES) };
})();
