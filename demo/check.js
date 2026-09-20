/*
 * Demo + sanity check for the planner, runnable without a browser:
 *
 *     node demo/check.js
 *
 * Prints the deck it would build for a few topics and exits non-zero if
 * any rule misfires (wrong template, empty field, non-deterministic output).
 */
'use strict';

const Planner = require('../js/planner.js');

// topic -> expected template and slide count
const CASES = [
    ['Kahve mi yoksa çay mı?', 'compare', 6],
    ['Python vs JavaScript', 'compare', 6],
    ['Kediler veya köpekler', 'compare', 6],
    ['Ekşi mayalı ekmek nasıl yapılır', 'steps', 7],
    ['Bisiklet tamiri rehberi', 'steps', 7],
    ['Elektrikli araçlar kısaca', 'summary', 4],
    ['Uzay turizmi', 'intro', 5],
    ['   kahve   ile   güne başlamak.  ', 'intro', 5]
];

let failures = 0;

function expect(condition, message) {
    if (!condition) {
        failures++;
        console.error('  FAIL:', message);
    }
}

// Every field the assistant would type must be non-empty text.
function checkSlide(slide, where) {
    expect(slide.title && slide.title.trim(), `${where}: empty title`);
    if (slide.layout === 'title') expect(slide.subtitle, `${where}: empty subtitle`);
    if (slide.layout === 'bullets' || slide.layout === 'step') {
        expect(slide.bullets.length >= 2, `${where}: too few bullets`);
        slide.bullets.forEach((b) => expect(b.trim(), `${where}: empty bullet`));
    }
    if (slide.layout === 'two-col') {
        expect(slide.left.head && slide.right.head, `${where}: missing column heads`);
        expect(slide.left.items.length === slide.right.items.length, `${where}: uneven columns`);
    }
    if (slide.layout === 'quote') expect(slide.quote, `${where}: empty quote`);
    if (slide.layout === 'step') expect(Number.isInteger(slide.number), `${where}: step without number`);
}

for (const [topic, template, count] of CASES) {
    const plan = Planner.plan(topic);
    console.log(`\n"${topic}" -> ${plan.templateLabel} (${plan.slides.length} slides, theme: ${plan.theme})`);
    expect(plan.template === template, `template ${plan.template}, expected ${template}`);
    expect(plan.slides.length === count, `${plan.slides.length} slides, expected ${count}`);
    expect(JSON.stringify(Planner.plan(topic)) === JSON.stringify(plan), 'plan is not deterministic');
    plan.slides.forEach((s, i) => {
        checkSlide(s, `slide ${i + 1}`);
        console.log(`  ${i + 1}. [${s.layout}] ${s.title}`);
    });
}

// Edge cases that should not throw or should throw cleanly.
console.log('\nEdge cases');
expect(Planner.cleanTopic('  merhaba   dünya?! ') === 'Merhaba dünya', 'cleanTopic normalisation');
expect(Planner.questionParticle('kahve') === 'mi' && Planner.questionParticle('çay') === 'mı' && Planner.questionParticle('okul') === 'mu' && Planner.questionParticle('gül') === 'mü', 'vowel harmony');
expect(Planner.coreTopic('Ekmek nasıl yapılır', 'steps') === 'Ekmek', 'coreTopic strips marker words');
expect(Planner.splitComparison('Sadece kahve') === null, 'no false comparison');
let threw = false;
try { Planner.plan('   '); } catch (e) { threw = true; }
expect(threw, 'empty topic should throw');
expect(Planner.plan('a vs b').slides.length === 6, 'tiny comparison still builds');
expect(Planner.plan('x'.repeat(200)).slides.length === 5, 'long topic still builds');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
