const { fetchJson } = require('./remoteDataReader');

const REMOTE_CONFIG_PATH = 'config/remote-config.json';
const DEFAULT_CONFIG = { reviewing: false };
const REVIEW_HIDDEN_CATEGORY_IDS = new Set(['world-cup', 'sports', 'vietnam-football']);
const REVIEW_SEARCH_SUGGESTIONS = ['trump', 'covid-19', 'luật sư AI'];

async function loadRemoteConfig() {
    const data = await fetchJson(REMOTE_CONFIG_PATH);
    return { ...DEFAULT_CONFIG, ...(data || {}) };
}

async function isReviewing() {
    const config = await loadRemoteConfig();
    return config.reviewing === true;
}

function filterCategoriesForReview(categoryList, reviewing) {
    if (!reviewing) {
        return categoryList;
    }

    return categoryList.filter(category => !REVIEW_HIDDEN_CATEGORY_IDS.has(category.id));
}

function isCategoryHiddenDuringReview(categoryId, reviewing) {
    return reviewing && REVIEW_HIDDEN_CATEGORY_IDS.has(categoryId);
}

module.exports = {
    REMOTE_CONFIG_PATH,
    REVIEW_HIDDEN_CATEGORY_IDS,
    REVIEW_SEARCH_SUGGESTIONS,
    loadRemoteConfig,
    isReviewing,
    filterCategoriesForReview,
    isCategoryHiddenDuringReview,
};
