/** 匯出單份 Markdown 題庫與題目引用的圖片。 */
const fs = require('node:fs/promises');
const { openAsBlob } = require('node:fs');
const path = require('node:path');
const { BlobReader, BlobWriter, ZipWriter } = require('@zip.js/zip.js');
const { parseQuestions } = require('../assets/js/question-bank');
const {
    zipImagePath,
    BANK_FILE_LIMIT,
    BANK_MARKDOWN_LIMIT,
    BANK_IMAGE_LIMIT,
    BANK_IMAGE_TYPES,
} = require('../assets/js/bank-files');

function withinRoot(root, file) {
    const relative = path.relative(root, file);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep)) {
        throw new Error('檔案須位於題庫根目錄內：' + file);
    }
    return relative.split(path.sep).join('/');
}

async function exportBank(source, output, root) {
    if (!source || !output || !/\.md$/i.test(source) || !/\.zip$/i.test(output)) {
        throw new Error('用法：node tools/export-bank.js <題庫.md> <輸出.zip> [題庫根目錄]');
    }

    const sourceFile = await fs.realpath(source);
    const base = await fs.realpath(root || path.dirname(sourceFile));
    const markdownPath = withinRoot(base, sourceFile);
    const markdown = await openAsBlob(sourceFile);
    if (markdown.size > BANK_MARKDOWN_LIMIT) throw new Error('Markdown 題庫超過 10 MiB');
    const questions = parseQuestions(await markdown.text(), (image) =>
        zipImagePath(markdownPath, image),
    );
    if (!questions.length) throw new Error('找不到可解析的題目');

    const zipWriter = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false });
    await zipWriter.add(markdownPath, new BlobReader(markdown));
    const added = new Set();
    for (const question of questions) {
        for (const image of question.imagePaths) {
            if (added.has(image)) continue;
            const imageFile = await fs.realpath(path.join(base, image)).catch(() => {
                throw new Error(`第 ${question.number} 題缺少圖片：${image}`);
            });
            withinRoot(base, imageFile);
            if (!Object.hasOwn(BANK_IMAGE_TYPES, image.split('.').pop().toLowerCase())) {
                throw new Error('ZIP 圖片格式不支援：' + image);
            }
            const blob = await openAsBlob(imageFile);
            if (blob.size > BANK_IMAGE_LIMIT) throw new Error('ZIP 圖片超過 24 MiB：' + image);
            if (added.size >= 9999) throw new Error('ZIP 題庫檔案數超過上限');
            await zipWriter.add(image, new BlobReader(blob));
            added.add(image);
        }
    }
    const archive = await zipWriter.close();
    if (archive.size > BANK_FILE_LIMIT) throw new Error('題庫檔案超過 100 MiB');
    await fs.writeFile(output, Buffer.from(await archive.arrayBuffer()), { flag: 'wx' });
    console.log(`已匯出 ${questions.length} 題、${added.size} 張圖片至 ${output}`);
}

exportBank(...process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
