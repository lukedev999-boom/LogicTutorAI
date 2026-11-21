const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = read('partials/main-content.html');
const css = read('assets/css/responsive.css');
const mainJs = read('assets/js/main.js');

const FOLD_QUERY =
    '@media (min-width: 600px) and (max-width: 1024px) and (min-aspect-ratio: 3/4) and (max-aspect-ratio: 4/3)';

/** 取出以 query 開頭的媒體查詢區塊本文（以大括號配對）。 */
function mediaBlock(source, query) {
    // Prettier 可能把長查詢折行，比對時把空白視為任意空白
    const pattern = query
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\s+/g, '\\s+');
    const m = new RegExp(pattern).exec(source);
    assert.ok(m, `找不到媒體查詢：${query}`);
    const open = source.indexOf('{', m.index);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
    }
    throw new Error('媒體查詢大括號未配對');
}

/** 取出某個 class 容器（以 div 配對）內的 HTML。 */
function paneHtml(cls) {
    const m = new RegExp(`<div[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`).exec(html);
    assert.ok(m, `找不到 ${cls} 容器`);
    let depth = 1;
    const re = /<div\b|<\/div>/g;
    re.lastIndex = m.index + m[0].length;
    let t;
    while ((t = re.exec(html))) {
        depth += t[0] === '</div>' ? -1 : 1;
        if (depth === 0) return html.slice(m.index + m[0].length, t.index);
    }
    throw new Error(`${cls} 容器未閉合`);
}

const idPos = (s, id) => s.indexOf(`id="${id}"`);

test('題目窗格依序包含圖片、題幹、無翻譯提示', () => {
    const pane = paneHtml('fold-pane-question');
    const ids = ['questionImage', 'questionText', 'noTranslationHint'];
    const pos = ids.map((id) => idPos(pane, id));
    assert.ok(
        pos.every((p) => p >= 0),
        '題目窗格缺少必要 id',
    );
    assert.deepEqual(
        [...pos].sort((a, b) => a - b),
        pos,
    );
});

test('作答窗格包含選項、提交、簡答、結果、AI 解析', () => {
    const pane = paneHtml('fold-pane-answer');
    for (const id of [
        'optionsContainer',
        'submitBtnContainer',
        'shortAnswerSection',
        'resultMessage',
        'aiAnalysisSection',
    ]) {
        assert.ok(idPos(pane, id) >= 0, `作答窗格缺少 ${id}`);
    }
});

test('兩個窗格是 fold-body 的子層，題目窗格在前', () => {
    const body = paneHtml('fold-body');
    const q = body.indexOf('fold-pane-question');
    const a = body.indexOf('fold-pane-answer');
    assert.ok(q >= 0 && a > q);
});

test('預設 .fold-pane 為 display: contents 且不在媒體查詢內', () => {
    const idx = css.search(/^\.fold-pane\s*\{\s*display:\s*contents;/m);
    assert.ok(idx >= 0, '找不到預設 .fold-pane 規則');
    const before = css.slice(0, idx);
    const opens = (before.match(/@media[^{]*\{/g) || []).length;
    const depthClosed = (before.match(/\}\s*\n\}/g) || []).length;
    assert.equal(opens, depthClosed, '.fold-pane 預設規則落在媒體查詢內');
    assert.ok(idx < css.indexOf(FOLD_QUERY) || css.indexOf(FOLD_QUERY) === -1);
});

const fold = () => mediaBlock(css, FOLD_QUERY);
/** 手機與折疊機共用的精簡版面 */
const COMPACT_QUERY =
    '@media (max-width: 599px), (min-width: 600px) and (max-width: 1024px) and (min-aspect-ratio: 3/4) and (max-aspect-ratio: 4/3)';
const PHONE_QUERY = '@media (max-width: 599px)';
const compact = () => mediaBlock(css, COMPACT_QUERY);
const phone = () => mediaBlock(css, PHONE_QUERY + ' {');
/** 共用區塊在前、折疊機專屬在後；rule() 取第一個符合的規則 */
const all = () => compact() + '\n' + fold();
const rule = (block, selector) => {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`(?:^|[},\\s])${esc}\\s*\\{([^}]*)\\}`, 'm').exec(block);
    assert.ok(m, `折疊機區塊缺少規則：${selector}`);
    return m[1].replace(/\s+/g, ' ');
};

test('折疊機區塊啟用兩欄並讓窗格各自捲動', () => {
    const b = fold();
    assert.match(rule(b, '.fold-body'), /display: grid/);
    assert.match(rule(b, '.fold-body'), /grid-template-columns: 1fr 1fr/);
    assert.match(rule(compact(), '.fold-pane'), /display: block/);
    const pane = rule(b, '.fold-pane');
    assert.match(pane, /overflow-y: auto/);
    assert.match(pane, /min-height: 0/);
});

test('折疊機區塊固定視窗高度並精簡標題列與頁尾', () => {
    const b = all();
    assert.match(rule(b, '#app'), /height: 100dvh/);
    assert.match(rule(b, 'header'), /position: static/);
    assert.match(rule(b, 'footer'), /display: none/);
});

test('折疊機區塊處理導航列、答題卡鈕與題目頭部', () => {
    const b = all();
    assert.match(rule(b, '#foldNav'), /order: 3/);
    assert.match(rule(b, '#foldNav'), /padding-right: 64px/);
    assert.match(rule(b, '.stats-toggle-btn'), /width: 44px/);
    assert.match(rule(b, '.question-header-wrapper'), /display: contents/);
});

test('工具類別保護區塊仍在檔案最末，折疊機區塊在它之前', () => {
    const guard = css.indexOf('/* ==================== 工具類別保護');
    assert.ok(guard > css.indexOf(FOLD_QUERY));
    assert.equal(css.slice(guard).match(/@media/g)?.length ?? 0, 1);
});

test('解析面板在折疊機改為右側抽屜', () => {
    const panel = rule(fold(), '.floating-panel');
    for (const decl of [
        'top: 0 !important',
        'right: 0 !important',
        'bottom: 0 !important',
        'left: auto !important',
        'width: 50% !important',
        'height: 100% !important',
    ]) {
        assert.ok(panel.includes(decl), `缺少 ${decl}`);
    }
});

test('換題時呼叫 resetPaneScroll 把窗格捲回頂端', () => {
    assert.match(mainJs, /function resetPaneScroll\(\)/);
    const start = mainJs.indexOf('function renderQuestion');
    const end = mainJs.indexOf('\nfunction ', start + 10);
    assert.ok(mainJs.slice(start, end).includes('resetPaneScroll()'));
});

test('handleResize 在手機版會移除答題卡鈕的 hidden class', () => {
    const start = mainJs.indexOf('function handleResize');
    const end = mainJs.indexOf('\nfunction ', start + 10);
    const body = mainJs.slice(start, end === -1 ? undefined : end);
    assert.match(body, /statsToggleBtn\.classList\.remove\('hidden'\)/);
});

test('題庫未顯示時隱藏答題卡切換鈕', () => {
    assert.match(
        css,
        /body:has\(#quizContainer\.hidden\)\s+\.stats-toggle-btn\s*\{[^}]*display:\s*none\s*!important/,
    );
});

test('審查修正：#app 重設 min-height，避免 100vh 蓋過 100dvh', () => {
    assert.match(rule(all(), '#app'), /min-height: 0/);
});

test('審查修正：抽屜高度不受 80vh 限制', () => {
    assert.match(rule(fold(), '.floating-panel'), /max-height: 100% !important/);
});

test('審查修正：導航列與答題卡鈕保留 safe-area 底部間距', () => {
    const b = all();
    assert.match(rule(b, '#foldNav'), /safe-area-inset-bottom/);
    assert.match(rule(b, '.stats-toggle-btn'), /safe-area-inset-bottom/);
});

test('審查修正：只有換題才重置窗格捲動，切換翻譯或高亮不會', () => {
    const start = mainJs.indexOf('function renderQuestion');
    const end = mainJs.indexOf('\nfunction ', start + 10);
    const body = mainJs.slice(start, end);
    assert.match(body, /if \(restartTimer\) resetPaneScroll\(\)/);
});

test('審查修正：折疊機區塊內 header 不再 sticky、導航列順序固定、窗格不橫向捲動', () => {
    const b = all();
    assert.match(rule(b, 'header'), /position: static !important/);
    assert.match(rule(b, '#foldNav > *'), /order: 0/);
    assert.match(rule(fold(), '.fold-pane'), /overflow-x: hidden/);
    assert.match(rule(b, '.floating-panel-header'), /cursor: default/);
});

test('深度精簡：題目畫面隱藏最外層標題列，選單鈕移入卡片標題列', () => {
    const b = all();
    assert.match(b, /body:has\(#quizContainer:not\(\.hidden\)\) header\s*\{[^}]*display: none/);
    assert.match(rule(b, '.fold-menu-btn'), /display: flex/);
    assert.match(rule(b, '.mobile-menu-panel'), /display: block !important/);
    assert.match(css, /^\.fold-menu-btn\s*\{\s*display: none;/m);
    const right = paneHtml('question-header-right');
    assert.match(
        right,
        /class="fold-menu-btn[^"]*"[^>]*onclick="openMobileMenu\(\)"|onclick="openMobileMenu\(\)"[^>]*class="fold-menu-btn/,
    );
});

test('深度精簡：倒數計時併入卡片標題列，進度條改成底部細線', () => {
    const b = all();
    assert.match(rule(b, '#questionHeader'), /display: flex/);
    assert.match(rule(b, '#questionHeader'), /position: relative/);
    assert.match(rule(b, '#questionCard #timerBar'), /margin: 0 !important/);
    assert.match(rule(b, '#questionCard #timerBar'), /min-height: 0/);
    assert.match(rule(b, '.timer-label'), /display: none/);
    assert.match(rule(b, '.timer-track'), /position: absolute/);
    assert.match(html, /id="questionHeader"/);
    assert.match(html, /class="timer-label/);
    assert.match(html, /class="timer-track/);
});

test('深度精簡：導航列、卡片內距與選項間距縮小', () => {
    const b = all();
    assert.match(rule(b, '.fold-body'), /padding: 0.75rem !important/);
    assert.match(rule(b, '#foldNav button'), /min-height: 40px/);
    assert.match(rule(b, '.fold-pane .option-btn'), /padding: 0.75rem 1rem/);
});

test('手機（599px 以下）只留整頁捲軸：內層不捲動、導航列貼底', () => {
    const p = phone();
    assert.match(rule(p, '#app'), /height: auto/);
    assert.match(rule(p, '.fold-body'), /overflow: visible/);
    assert.match(p, /body:has\(#quizContainer:not\(\.hidden\)\) main\s*\{[^}]*overflow: visible/);
    assert.match(rule(p, '#foldNav'), /position: sticky/);
    assert.match(rule(p, '#foldNav'), /bottom: 0/);
    assert.match(mainJs, /window\.scrollTo\(0, 0\)/);
});

test('跳題輸入框聚焦時清空、失焦未輸入時填回題號', () => {
    const input = /<input[^>]*id="jumpInput"[^>]*>/.exec(html)[0];
    assert.match(input, /onfocus="this\.value = ''"/);
    assert.match(input, /onblur="restoreJumpInput\(\)"/);
    assert.match(mainJs, /function restoreJumpInput\(\)/);
});

test('手機（599px 以下）標題列可換行', () => {
    assert.match(rule(phone(), '#questionHeader'), /flex-wrap: wrap/);
    assert.match(rule(phone(), '.question-header-right'), /margin-left: auto/);
});

test('觸控裝置不做選項 hover 位移，標示外框改為內框避免被裁切', () => {
    const mainCss = read('assets/css/main.css');
    assert.match(
        mainCss,
        /@media \(hover: none\)\s*\{\s*\.option-btn:hover:not\(\.answered\)\s*\{[^}]*transform: none/,
    );
    assert.match(mainCss, /\.option-btn\.option-pending\s*\{[^}]*box-shadow: inset/);
});

test('手機精簡版面覆蓋舊規則：計時器橫排、題號靠左、導航列不換行', () => {
    const p = phone();
    assert.match(rule(p, '#questionCard #timerBar .flex'), /flex-direction: row/);
    assert.match(rule(all(), '.question-header-left'), /justify-content: flex-start/);
    assert.match(rule(p, '#foldNav .jump-controls'), /flex-wrap: nowrap/);
    assert.match(rule(p, '#foldNav button'), /white-space: nowrap/);
});
