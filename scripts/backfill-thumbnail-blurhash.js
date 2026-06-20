#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const { attachThumbnailBlurhash } = require('../src/services/thumbnailBlurhashService');
const categories = require('../src/config/categories');

const ROOT_DIR = path.join(__dirname, '..');
const DEFAULT_DATA_DIR = path.join(ROOT_DIR, 'data');

function parseArgs(argv) {
    const args = new Map();
    for (let i = 2; i < argv.length; i++) {
        const token = argv[i];
        if (!token.startsWith('--')) continue;

        const [key, inlineValue] = token.split('=');
        if (inlineValue !== undefined) {
            args.set(key, inlineValue);
            continue;
        }

        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
            args.set(key, 'true');
        } else {
            args.set(key, next);
            i += 1;
        }
    }
    return args;
}

function listChunkFiles(categoryDir) {
    const chunksDir = path.join(categoryDir, 'chunks');
    if (!fs.existsSync(chunksDir)) return [];
    return fs.readdirSync(chunksDir)
        .filter(name => /^chunk_\d+\.json$/.test(name))
        .sort((a, b) => {
            const ai = parseInt(a.match(/^chunk_(\d+)\.json$/)?.[1] || '0', 10);
            const bi = parseInt(b.match(/^chunk_(\d+)\.json$/)?.[1] || '0', 10);
            return ai - bi;
        })
        .map(name => path.join(chunksDir, name));
}

function readJsonArray(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
}

function writeJsonArray(filePath, value) {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function getKnownCategoryIds() {
    return new Set(categories.map(c => c.id));
}

function resolveTargetCategories(input) {
    const known = getKnownCategoryIds();
    if (!input || input === 'all') {
        return Array.from(known);
    }

    const ids = input
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    const result = [];
    for (const id of ids) {
        if (known.has(id)) {
            result.push(id);
        } else {
            console.warn(`[WARN] Bỏ qua category không tồn tại: ${id}`);
        }
    }
    return result;
}

async function backfillChunk(chunkPath, { concurrency }) {
    const items = readJsonArray(chunkPath);
    if (items.length === 0) {
        return { changed: false, total: 0, filled: 0 };
    }

    const beforeFilled = items.filter(item => item?.thumbnail_blurhash).length;
    const candidates = items.filter(item => item && typeof item === 'object' && !item.thumbnail_blurhash && item.thumbnail_url);

    if (candidates.length === 0) {
        return { changed: false, total: items.length, filled: beforeFilled };
    }

    await attachThumbnailBlurhash(items, { concurrency });
    const afterFilled = items.filter(item => item?.thumbnail_blurhash).length;

    const changed = afterFilled !== beforeFilled;
    if (changed) {
        writeJsonArray(chunkPath, items);
    }

    return {
        changed,
        total: items.length,
        filled: afterFilled,
        newlyFilled: afterFilled - beforeFilled,
    };
}

async function main() {
    const args = parseArgs(process.argv);
    const dataDir = args.get('--dataDir') || DEFAULT_DATA_DIR;
    const categoriesArg = args.get('--categories') || 'all';
    const concurrency = Math.max(1, parseInt(args.get('--concurrency') || '6', 10));
    const dryRun = args.get('--dryRun') === 'true';

    if (!fs.existsSync(dataDir)) {
        console.error(`[ERROR] Không tìm thấy thư mục data: ${dataDir}`);
        console.error('Gợi ý: chạy `npm run setup:data` để clone data repo vào ./data');
        process.exit(1);
    }

    const targetCategories = resolveTargetCategories(categoriesArg);
    console.log(`==> Backfill thumbnail_blurhash`);
    console.log(`- dataDir: ${dataDir}`);
    console.log(`- categories: ${targetCategories.join(', ')}`);
    console.log(`- concurrency: ${concurrency}`);
    console.log(`- dryRun: ${dryRun}`);

    let changedFiles = 0;
    let totalItems = 0;
    let totalFilled = 0;
    let totalNewlyFilled = 0;

    for (const categoryId of targetCategories) {
        const categoryDir = path.join(dataDir, categoryId);
        const chunkFiles = listChunkFiles(categoryDir);
        if (chunkFiles.length === 0) {
            console.log(`\n[${categoryId}] Không có chunk files. Bỏ qua.`);
            continue;
        }

        console.log(`\n[${categoryId}] ${chunkFiles.length} chunk files`);

        for (const chunkPath of chunkFiles) {
            if (dryRun) {
                const items = readJsonArray(chunkPath);
                const filled = items.filter(item => item?.thumbnail_blurhash).length;
                const missing = items.filter(item => item && typeof item === 'object' && !item.thumbnail_blurhash && item.thumbnail_url).length;
                console.log(`- ${path.basename(chunkPath)}: total=${items.length} filled=${filled} missing=${missing}`);
                totalItems += items.length;
                totalFilled += filled;
                totalNewlyFilled += missing;
                continue;
            }

            const result = await backfillChunk(chunkPath, { concurrency });
            totalItems += result.total;
            totalFilled += result.filled;
            totalNewlyFilled += result.newlyFilled || 0;

            const tag = result.changed ? 'UPDATED' : 'OK';
            console.log(`- ${path.basename(chunkPath)}: ${tag} total=${result.total} filled=${result.filled} +${result.newlyFilled || 0}`);
            if (result.changed) changedFiles += 1;
        }
    }

    console.log(`\n==> Summary`);
    console.log(`- total_items: ${totalItems}`);
    console.log(`- filled_now: ${totalFilled}`);
    console.log(`- newly_filled: ${totalNewlyFilled}`);
    if (!dryRun) {
        console.log(`- changed_files: ${changedFiles}`);
    }
}

main().catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
});

