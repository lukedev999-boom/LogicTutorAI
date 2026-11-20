/**
 * 介面偏好的純邏輯：點選作答、題目字級、選項排列。
 * 不碰 DOM，方便以 node --test 直接驗證；瀏覽器端以全域函式供 main.js 使用。
 */

const QUIZ_FONT_SIZES = ['small', 'medium', 'large'];

/** 兩欄排列時，單一選項（不含中文翻譯）的最大字數 */
const COMPACT_OPTION_MAX_LENGTH = 24;

/**
 * 點選作答：第一次點選只標示，同一選項再點一次才送出，保留防誤觸。
 * @param {string|null} pendingLetter - 目前標示中的選項
 * @param {string} tappedLetter - 這次點選的選項
 * @returns {'select'|'submit'}
 */
function resolveOptionTap(pendingLetter, tappedLetter) {
    return pendingLetter === tappedLetter ? 'submit' : 'select';
}

/**
 * @param {unknown} value - 儲存的字級
 * @returns {'small'|'medium'|'large'}
 */
function normalizeFontSize(value) {
    return QUIZ_FONT_SIZES.includes(value) ? value : 'medium';
}

/**
 * 選項全部夠短、沒有換行且為偶數個時，才排成兩欄。
 * 中文翻譯放在全形括號內，預設不顯示，因此不計入長度。
 * @param {{letter: string, text: string}[]} options
 * @returns {boolean}
 */
function shouldUseCompactOptions(options) {
    if (!Array.isArray(options) || options.length === 0 || options.length % 2 !== 0) {
        return false;
    }
    return options.every((opt) => {
        const text = String(opt.text ?? '');
        if (/\n/.test(text)) return false;
        return text.replace(/（.+?）/g, '').trim().length <= COMPACT_OPTION_MAX_LENGTH;
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { resolveOptionTap, normalizeFontSize, shouldUseCompactOptions };
}
