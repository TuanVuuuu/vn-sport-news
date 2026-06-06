const axios = require('axios');
const dataRepo = require('../config/dataRepo');

const GITHUB_API = 'https://api.github.com';

function getToken() {
    return process.env.DATA_REPO_TOKEN || null;
}

function getAuthHeaders() {
    const token = getToken();
    if (!token) {
        return null;
    }

    return {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };
}

function getContentsUrl(relativePath) {
    const normalizedPath = String(relativePath || '').replace(/^\/+/, '');
    return `${GITHUB_API}/repos/${dataRepo.owner}/${dataRepo.repo}/contents/${normalizedPath}`;
}

/**
 * Đọc file JSON từ repo data qua GitHub Contents API.
 * @returns {Promise<{ data: any, sha: string|null }>}
 */
async function readJsonFile(relativePath, fallback) {
    const headers = getAuthHeaders();
    if (!headers) {
        throw new Error('Thiếu DATA_REPO_TOKEN để đọc repo data.');
    }

    try {
        const response = await axios.get(getContentsUrl(relativePath), {
            headers,
            params: { ref: dataRepo.branch },
            timeout: 15000,
        });

        const content = Buffer.from(response.data.content, 'base64').toString('utf8');
        return {
            data: JSON.parse(content),
            sha: response.data.sha,
        };
    } catch (error) {
        if (error.response?.status === 404) {
            return { data: fallback, sha: null };
        }

        const message = error.response?.data?.message || error.message;
        throw new Error(`Không đọc được ${relativePath} từ GitHub: ${message}`);
    }
}

/**
 * Ghi file JSON lên repo data qua GitHub Contents API.
 */
async function writeJsonFile(relativePath, data, commitMessage, sha = null) {
    const headers = getAuthHeaders();
    if (!headers) {
        throw new Error('Thiếu DATA_REPO_TOKEN để ghi repo data.');
    }

    const content = Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64');
    const body = {
        message: commitMessage,
        content,
        branch: dataRepo.branch,
    };

    if (sha) {
        body.sha = sha;
    }

    try {
        const response = await axios.put(getContentsUrl(relativePath), body, {
            headers,
            timeout: 15000,
        });

        return response.data.content?.sha || null;
    } catch (error) {
        const message = error.response?.data?.message || error.message;
        const status = error.response?.status;
        const err = new Error(`Không ghi được ${relativePath} lên GitHub: ${message}`);
        err.status = status;
        throw err;
    }
}

/**
 * Ghi JSON với retry khi conflict SHA (409).
 */
async function writeJsonFileWithRetry(relativePath, data, commitMessage, maxAttempts = 3) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const current = await readJsonFile(relativePath, data);
            const nextSha = await writeJsonFile(
                relativePath,
                data,
                commitMessage,
                current.sha,
            );
            return nextSha;
        } catch (error) {
            lastError = error;
            if (error.status !== 409 || attempt === maxAttempts) {
                throw error;
            }
        }
    }

    throw lastError;
}

function isConfigured() {
    return Boolean(getToken());
}

module.exports = {
    readJsonFile,
    writeJsonFile,
    writeJsonFileWithRetry,
    isConfigured,
};
