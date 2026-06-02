const cheerio = require('cheerio');
const { searchSuggestionSources } = require('../config/searchSuggestions');
const { fetchPage } = require('./pageService');
const {
    PARENT_NAV_EXCLUDED,
    SUBFOLDER_NAV_EXCLUDED,
    normalizeKeyword,
    normalizeLink,
    isExternalLink,
    filterKeywordsWithResults,
    loadSearchSuggestions,
    saveSearchSuggestions,
} = require('../utils/searchSuggestionHelper');

/**
 * Parse từ khóa sub-nav bên cạnh mục Thể thao trên trang VnExpress.
 * @param {string} html
 * @returns {Array<{ keyword: string, link: string }>}
 */
function parseSportsKeywords(html) {
    const $ = cheerio.load(html);
    const seen = new Set();
    const keywords = [];

    function addKeyword(keyword, href, excludedSet) {
        const normalizedHref = normalizeLink(href);
        const key = normalizeKeyword(keyword);

        if (!key || seen.has(key)) return;
        if (isExternalLink(normalizedHref)) return;
        if (excludedSet.has(key)) return;

        seen.add(key);
        keywords.push({
            keyword: keyword.trim(),
            link: normalizedHref,
        });
    }

    $('nav.nav-folder ul.ul-nav-folder.parent li a').each((_, element) => {
        const anchor = $(element);
        addKeyword(anchor.attr('title') || anchor.text(), anchor.attr('href'), PARENT_NAV_EXCLUDED);
    });

    $('nav.nav-folder ul.ul-nav-folder.ul-subfolder li a').each((_, element) => {
        const anchor = $(element);
        addKeyword(anchor.attr('title') || anchor.text(), anchor.attr('href'), SUBFOLDER_NAV_EXCLUDED);
    });

    return keywords;
}

/**
 * Crawl và lưu từ khóa gợi ý từ các nguồn cấu hình.
 */
async function crawlSearchSuggestions() {
    const source = searchSuggestionSources[0];
    console.log(`\n[Gợi ý search] Đang crawl từ "${source.name}" (${source.url})`);

    const html = await fetchPage(source.url);
    const parsedKeywords = parseSportsKeywords(html);

    if (parsedKeywords.length === 0) {
        const existing = loadSearchSuggestions();
        console.log('[Gợi ý search] Không parse được từ khóa nào. Giữ nguyên dữ liệu cũ.');
        return existing;
    }

    const validateCategory = source.validateCategory || 'all';
    console.log(`[Gợi ý search] Đang kiểm tra ${parsedKeywords.length} từ khóa (category: ${validateCategory})`);

    const keywords = filterKeywordsWithResults(parsedKeywords, validateCategory);

    if (keywords.length === 0) {
        const existing = loadSearchSuggestions();
        console.log('[Gợi ý search] Không có từ khóa nào pass validate. Giữ nguyên dữ liệu cũ.');
        return existing;
    }

    const saved = saveSearchSuggestions({
        source_url: source.url,
        keywords,
    });

    console.log(`[Gợi ý search] Đã cập nhật ${keywords.length}/${parsedKeywords.length} từ khóa.`);
    return saved;
}

module.exports = {
    parseSportsKeywords,
    crawlSearchSuggestions,
};
