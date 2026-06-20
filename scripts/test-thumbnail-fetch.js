#!/usr/bin/env node
/* eslint-disable no-console */
const { fetchImageBuffer, computeBlurhashFromUrl } = require('../src/services/thumbnailBlurhashService');

const url = process.argv[2];
const referer = process.argv[3] || null;

if (!url) {
    console.error('Usage: node scripts/test-thumbnail-fetch.js <image-url> [page-referer]');
    process.exit(1);
}

async function main() {
    console.log('url:', url);
    console.log('referer:', referer || '(none)');
    console.log('proxy:', process.env.BLURHASH_FETCH_PROXY_URL || '(none)');

    try {
        const buffer = await fetchImageBuffer(url, { pageReferer: referer });
        console.log('fetch: OK bytes=', buffer.length);
    } catch (error) {
        console.error('fetch: FAIL', error.response?.status || error.message);
        process.exitCode = 1;
    }

    const hash = await computeBlurhashFromUrl(url, { pageReferer: referer });
    console.log('blurhash:', hash || '(null)');
}

main().catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
});
