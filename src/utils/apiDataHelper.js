const { fetchJson } = require('./remoteDataReader');
const {
    CHUNK_SIZE,
    formatArticle,
    matchesSearchFilters,
    paginateSearchResults,
    getCreateAt,
} = require('./fileHelper');

const EMPTY_METADATA = { total_articles: 0, files: [], channel: null };

async function loadMetadata(categoryId) {
    const data = await fetchJson(`${categoryId}/meta/metadata.json`);
    if (!data || typeof data !== 'object') {
        return { ...EMPTY_METADATA };
    }
    return data;
}

async function loadChunk(categoryId, chunkFile) {
    const data = await fetchJson(`${categoryId}/chunks/${chunkFile}`);
    return Array.isArray(data) ? data : [];
}

async function loadAllItems(categoryId, metadata) {
    let items = [];

    for (const file of metadata.files || []) {
        const chunkData = await loadChunk(categoryId, file);
        items = items.concat(chunkData);
    }

    return items;
}

async function getPaginatedItems(categoryId, metadata, page, limit) {
    const totalItems = metadata.total_articles || 0;
    const totalPages = Math.ceil(totalItems / limit) || 0;

    const startIndex = (page - 1) * limit;
    let endIndex = page * limit - 1;

    if (startIndex >= totalItems) {
        return {
            data: [],
            pagination: { current_page: page, total_pages: totalPages, total_items: totalItems, has_next: false },
        };
    }
    if (endIndex >= totalItems) endIndex = totalItems - 1;

    const fileStartIdx = totalItems - 1 - endIndex;
    const fileEndIdx = totalItems - 1 - startIndex;

    const startChunk = Math.floor(fileStartIdx / CHUNK_SIZE);
    const endChunk = Math.floor(fileEndIdx / CHUNK_SIZE);

    let collectedItems = [];
    for (let i = startChunk; i <= endChunk; i++) {
        if (i >= 0 && i < metadata.files.length) {
            const chunkData = await loadChunk(categoryId, metadata.files[i]);
            collectedItems = collectedItems.concat(chunkData);
        }
    }

    const offset = startChunk * CHUNK_SIZE;
    let finalData = collectedItems.slice(fileStartIdx - offset, fileEndIdx - offset + 1);
    finalData.reverse();
    finalData = finalData.map(item => formatArticle(item, categoryId, metadata));

    return {
        data: finalData,
        pagination: {
            current_page: page,
            total_pages: totalPages,
            total_items: totalItems,
            has_next: page < totalPages,
        },
    };
}

async function searchItems(categoryId, metadata, filters, page, size) {
    const allItems = await loadAllItems(categoryId, metadata);
    const filteredItems = allItems
        .filter(item => matchesSearchFilters(item, filters))
        .sort((a, b) => new Date(getCreateAt(b)) - new Date(getCreateAt(a)))
        .map(item => formatArticle(item, categoryId, metadata));

    return paginateSearchResults(filteredItems, page, size);
}

async function searchItemsAllCategories(categoryList, filters, page, size) {
    const uniqueItems = new Map();

    for (const category of categoryList) {
        const metadata = await loadMetadata(category.id);
        if (!metadata || metadata.total_articles === 0) {
            continue;
        }

        const allItems = await loadAllItems(category.id, metadata);
        for (const item of allItems) {
            if (!matchesSearchFilters(item, filters)) {
                continue;
            }

            const formatted = formatArticle(item, category.id, metadata);
            const existing = uniqueItems.get(item.id);
            if (!existing || new Date(getCreateAt(formatted)) > new Date(getCreateAt(existing))) {
                uniqueItems.set(item.id, formatted);
            }
        }
    }

    const filteredItems = Array.from(uniqueItems.values())
        .sort((a, b) => new Date(getCreateAt(b)) - new Date(getCreateAt(a)));

    return paginateSearchResults(filteredItems, page, size);
}

async function loadSearchSuggestions() {
    const data = await fetchJson('search_suggestions.json');
    if (!data || typeof data !== 'object') {
        return { source_url: null, last_updated: null, keywords: [] };
    }

    return {
        source_url: data.source_url || null,
        last_updated: data.last_updated || null,
        keywords: Array.isArray(data.keywords) ? data.keywords : [],
    };
}

module.exports = {
    loadMetadata,
    getPaginatedItems,
    searchItems,
    searchItemsAllCategories,
    loadSearchSuggestions,
};
