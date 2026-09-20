# Deckhand

Türkçe: [README.tr.md](README.tr.md)

Type one line — "coffee or tea?", "how to bake sourdough" — and a small assistant on the page builds a slide deck in front of you, pressing the same toolbar buttons you can press, typing into the same fields you can type into, and leaving short notes like "let me put this here". You can jump in at any moment; it works around your changes instead of over them.

Everything happens in the browser. No account, no server, no language model, no internet. Open `index.html` and it starts building a sample deck on its own.

## What it looks like

- **Top:** one text box for the topic and a handful of example chips.
- **Toolbar:** new slide, delete, move up/down, change layout, five colour themes, present, download. Both you and the assistant use exactly these buttons.
- **Left:** live thumbnails of every slide.
- **Middle:** the current slide. Click any text and edit it in place; Enter adds a bullet, Backspace on an empty bullet removes it.
- **Right:** the assistant. Its eyes follow its own cursor, and its notes appear as speech bubbles. "Pause" freezes it mid-word; "Speed" runs it at 1×, 2× or 4×.

## How it decides what to build

The assistant is rule-based; there is no model behind it. `js/planner.js` looks at the topic and fits it into one of four fixed templates:

| Template | Triggered by | Slides |
| --- | --- | --- |
| Comparison | "A vs B", "A mı yoksa B mi", "A veya B", "A ile B arasındaki fark" | title, A, B, side-by-side table, "which one when", conclusion |
| Step by step | "nasıl", "adım", "rehber", "tarif", "kurulum"… | title, before you start, three numbered steps, common mistakes, closing line |
| Summary | "kısaca", "özet", "ana hatlar"… | title, three sentences, pros / watch-outs, one-liner |
| Introduction | anything else | title, what is it, why it matters, key terms, closing line |

Titles and bullets come from small phrase pools chosen by a hash of the topic, so the same topic always produces the same deck while different topics get different phrasing. For comparisons the question particle ("mı / mi / mu / mü") is picked with vowel harmony. Marker words like "nasıl yapılır" are stripped before the topic is dropped into sentences. The template also picks the colour theme.

## Working alongside the assistant

Every field on a slide remembers whether a person has typed in it. Before the assistant types anywhere — and again before every single character — it checks that flag:

- Edit a title while it is still typing it: it stops with "you took over, I'll step back" and leaves your text.
- Pick a theme swatch: the theme is locked and the assistant no longer changes it.
- Change a slide's layout: that slide's layout is locked.
- Move or delete slides: the assistant tracks slides by id, so it keeps adding after its own last slide no matter where you dragged things.
- If your caret is inside a slide when the assistant needs a new one, it adds the slide in the background instead of switching the editor away from you.

## Presenting and sharing

- **Present** opens a full-screen view. Arrow keys, Space and clicking move between slides; Esc leaves.
- **Download** saves a single self-contained `.html` file: the slides, the theme, the same CSS the editor uses and a few lines of navigation script. It opens anywhere with no dependencies.

## Running it

Open `index.html` in a modern browser. That's it.

The planner can also be exercised without a browser:

```
node demo/check.js
```

It prints the deck it would build for a few topics and fails if a rule misfires. The GitHub Actions workflow runs the same script.

## Files

```
index.html        page structure
style.css         app chrome (toolbar, thumbnails, assistant panel)
js/planner.js     topic -> template -> slide plan (also loadable from Node)
js/themes.js      the five colour themes
js/deck.js        slide model, rendering, editing, present mode, HTML export
js/assistant.js   cursor, button presses, typing, notes, the edited-field checks
js/main.js        wiring and the opening demo
demo/check.js     planner demo and sanity checks
```

## Limits

The content is deliberately generic: the assistant knows nothing about your topic beyond its words, so the bullets are scaffolding for you to rewrite, not facts. Templates and phrase pools are Turkish; adding another language means translating `POOLS` and the detection regexes in `js/planner.js`.

## License

MIT — see [LICENSE](LICENSE).

---

AI-assisted tools (Claude) were used while developing this project.
