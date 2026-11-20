/** 本機題庫檔案、ZIP 索引與 IndexedDB。 */
const BANK_FILE_LIMIT = 100 * 1024 * 1024;
const BANK_MARKDOWN_LIMIT = 10 * 1024 * 1024;
const BANK_IMAGE_LIMIT = 24 * 1024 * 1024;
const BANK_IMAGE_TYPES = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
};

function zipImagePath(markdownPath, rawPath) {
    const pathname = rawPath.trim().split(/[?#]/)[0].replace(/\\/g, '/');
    const decoded = decodeURIComponent(pathname);
    if (!decoded || /^(?:\/|[a-z][a-z0-9+.-]*:)/i.test(decoded) || decoded.includes('\\')) {
        throw new Error('ZIP 題庫圖片須使用相對路徑：' + rawPath);
    }

    const parts = markdownPath.split('/').slice(0, -1);
    for (const part of decoded.split('/')) {
        if (part === '..') {
            if (!parts.length) throw new Error('圖片路徑超出 ZIP：' + rawPath);
            parts.pop();
        } else if (part && part !== '.') {
            parts.push(part);
        }
    }
    return parts.join('/');
}

async function readZipBank(file) {
    const reader = new zip.ZipReader(new zip.BlobReader(file), {
        useWebWorkers: false,
        useCompressionStream: false,
        checkSignature: true,
    });
    try {
        const index = new Map();
        let entryCount = 0;
        for await (const entry of reader.getEntriesGenerator()) {
            if (++entryCount > 10000) throw new Error('ZIP 題庫檔案數超過上限');
            if (entry.directory || /(^|\/)__MACOSX(?:\/|$)/.test(entry.filename)) continue;
            if (index.has(entry.filename)) throw new Error('ZIP 內有重複路徑：' + entry.filename);
            index.set(entry.filename, entry);
        }
        const documents = [...index.values()].filter((entry) => /\.md$/i.test(entry.filename));
        if (documents.length !== 1) throw new Error('ZIP 內須有一份 Markdown 題庫');
        const [documentEntry] = documents;
        if (documentEntry.uncompressedSize > BANK_MARKDOWN_LIMIT) {
            throw new Error('Markdown 題庫超過 10 MiB');
        }
        const markdown = await documentEntry.getData(new zip.TextWriter());
        const parsed = parseQuestions(markdown, (path) => {
            const resolved = zipImagePath(documentEntry.filename, path);
            const entry = index.get(resolved);
            if (!entry) throw new Error('ZIP 缺少圖片：' + resolved);
            if (entry.encrypted) throw new Error('ZIP 圖片不可加密：' + resolved);
            if (!Object.hasOwn(BANK_IMAGE_TYPES, resolved.split('.').pop().toLowerCase())) {
                throw new Error('ZIP 圖片格式不支援：' + resolved);
            }
            if (entry.uncompressedSize > BANK_IMAGE_LIMIT) {
                throw new Error('ZIP 圖片超過 24 MiB：' + resolved);
            }
            return resolved;
        });

        return {
            parsed,
            async readImage(path, signal) {
                const type = BANK_IMAGE_TYPES[path.split('.').pop().toLowerCase()];
                return index.get(path).getData(new zip.BlobWriter(type), { signal });
            },
            close: () => reader.close(),
        };
    } catch (error) {
        await reader.close();
        throw error;
    }
}

async function readBankFiles(files) {
    if (!files.length || files.some((file) => !/\.(md|zip)$/i.test(file.name))) {
        throw new Error('請選擇 Markdown 或 ZIP 題庫');
    }
    if (files.reduce((size, file) => size + file.size, 0) > BANK_FILE_LIMIT) {
        throw new Error('題庫檔案超過 100 MiB');
    }
    if (files.some((file) => /\.zip$/i.test(file.name))) {
        if (files.length !== 1) throw new Error('一次只能載入一個 ZIP 題庫');
        return readZipBank(files[0]);
    }
    if (files.reduce((size, file) => size + file.size, 0) > BANK_MARKDOWN_LIMIT) {
        throw new Error('Markdown 題庫超過 10 MiB');
    }
    const documents = await Promise.all(files.map((file) => file.text()));
    return { parsed: parseQuestions(documents.join('\n\n---\n\n')) };
}

async function accessSavedBank(mode, operation) {
    const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('logictutorai-bank', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('banks');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction('banks', mode);
            const request = operation(tx.objectStore('banks'));
            tx.oncomplete = () => resolve(request.result);
            tx.onabort = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

const savedBank = {
    read: () => accessSavedBank('readonly', (store) => store.get('active')),
    write: (files) => accessSavedBank('readwrite', (store) => store.put(files, 'active')),
    clear: () => accessSavedBank('readwrite', (store) => store.delete('active')),
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        zipImagePath,
        BANK_FILE_LIMIT,
        BANK_MARKDOWN_LIMIT,
        BANK_IMAGE_LIMIT,
        BANK_IMAGE_TYPES,
    };
}
