const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('點選作答：第一次點選只標示，同一選項再點才送出', () => {
    const { resolveOptionTap } = require('../assets/js/ui-prefs');
    assert.equal(resolveOptionTap(null, 'A'), 'select');
    assert.equal(resolveOptionTap('A', 'B'), 'select');
    assert.equal(resolveOptionTap('A', 'A'), 'submit');
});

test('題目字級只接受 small／medium／large，其餘回到 medium', () => {
    const { normalizeFontSize } = require('../assets/js/ui-prefs');
    assert.equal(normalizeFontSize('small'), 'small');
    assert.equal(normalizeFontSize('large'), 'large');
    assert.equal(normalizeFontSize(null), 'medium');
    assert.equal(normalizeFontSize('huge'), 'medium');
});

test('選項全部夠短且為偶數個時才排成兩欄', () => {
    const { shouldUseCompactOptions } = require('../assets/js/ui-prefs');
    const opt = (text) => ({ letter: 'A', text });
    const short = ['Database assessment', 'Host-based assessment', 'Credentialed', 'Distributed'];
    assert.equal(shouldUseCompactOptions(short.map(opt)), true);
    assert.equal(shouldUseCompactOptions(short.slice(0, 3).map(opt)), false);
    assert.equal(shouldUseCompactOptions([...short.slice(0, 3), 'x'.repeat(33)].map(opt)), false);
    assert.equal(shouldUseCompactOptions(['a\nb', 'c', 'd', 'e'].map(opt)), false);
    assert.equal(shouldUseCompactOptions([]), false);
    // 兩欄寬度有限，單一選項最多 24 字
    assert.equal(shouldUseCompactOptions(['x'.repeat(24), 'b', 'c', 'd'].map(opt)), true);
    assert.equal(shouldUseCompactOptions(['x'.repeat(25), 'b', 'c', 'd'].map(opt)), false);
    // 中文翻譯放在全形括號內，不計入長度
    assert.equal(
        shouldUseCompactOptions(
            ['Nmap（網路掃描工具，常用於偵測主機與開放埠口）', 'b', 'c', 'd'].map(opt),
        ),
        true,
    );
});

test('main.js 改用點選作答，不再依賴雙擊', () => {
    const mainJs = read('assets/js/main.js');
    assert.doesNotMatch(mainJs, /ondblclick/);
    assert.match(mainJs, /resolveOptionTap\(/);
    assert.match(mainJs, /shouldUseCompactOptions\(/);
    assert.doesNotMatch(read('partials/main-content.html'), /雙擊/);
});

test('ui-prefs.js 在 main.js 之前載入', () => {
    const tpl = read('index-template.html');
    const a = tpl.indexOf('assets/js/ui-prefs.js');
    assert.ok(a > 0 && a < tpl.indexOf('assets/js/main.js'));
});

test('進階設定提供字級切換，選單提供全螢幕', () => {
    const dialogs = read('partials/dialogs.html');
    for (const size of ['small', 'medium', 'large']) {
        assert.match(dialogs, new RegExp(`setQuizFontSize\\('${size}'\\)`));
    }
    assert.match(read('partials/mobile-menu.html'), /toggleFullscreen\(\)/);
});

test('CSS 提供待確認樣式、字級與兩欄選項', () => {
    const css = read('assets/css/main.css') + read('assets/css/responsive.css');
    assert.match(css, /\.option-btn\.option-pending/);
    assert.match(css, /\[data-quiz-font='small'\] #questionText/);
    assert.match(css, /\[data-quiz-font='large'\] #questionText/);
    assert.match(css, /#optionsContainer\.options-compact\s*\{[^}]*grid-template-columns: 1fr 1fr/);
});

test('兩欄排列時隱藏與字母圓圈重複的「A.」前綴', () => {
    assert.match(read('assets/js/main.js'), /class="option-letter-prefix"/);
    assert.match(
        read('assets/css/responsive.css'),
        /#optionsContainer\.options-compact \.option-letter-prefix\s*\{[^}]*display: none/,
    );
});
