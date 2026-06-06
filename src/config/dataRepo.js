/**
 * Cấu hình repo lưu trữ dữ liệu JSON.
 * Code repo (vn-sport-news) không commit thư mục data/.
 */
module.exports = {
    owner: process.env.DATA_REPO_OWNER || 'TuanVuuuu',
    repo: process.env.DATA_REPO_NAME || 'vn-sport-news-data',
    branch: process.env.DATA_REPO_BRANCH || 'main',
    get url() {
        return `https://github.com/${this.owner}/${this.repo}.git`;
    },
    get rawBaseUrl() {
        return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}`;
    },
};
