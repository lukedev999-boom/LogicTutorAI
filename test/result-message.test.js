const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainJs = fs.readFileSync(path.join(__dirname, '../assets/js/main.js'), 'utf8');

/** 取出指定函式本體（到下一個頂層 function 為止）。 */
function fnBody(name) {
    const start = mainJs.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `找不到 ${name}`);
    const end = mainJs.indexOf('\nfunction ', start + 10);
    return mainJs.slice(start, end === -1 ? undefined : end);
}

test('答對／答錯結果訊息不顯示來源，來源只留在題目解析', () => {
    assert.doesNotMatch(fnBody('showAnswerResult'), /renderSourceSection/);
});

test('題目解析面板仍附上來源', () => {
    assert.match(fnBody('openExplanationPanel'), /renderSourceSection\(q\)/);
});
