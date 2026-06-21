const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dataRepoGitHub = require('./dataRepoGitHub');

const CHUNK_SIZE = 100;
const METADATA_PATH = 'support/meta/metadata.json';
const LOCAL_SUPPORT_DIR = path.join(__dirname, '../../data/support');
const LOCAL_METADATA_FILE = path.join(LOCAL_SUPPORT_DIR, 'meta/metadata.json');
const LOCAL_CHUNKS_DIR = path.join(LOCAL_SUPPORT_DIR, 'chunks');
const EMPTY_METADATA = { total_items: 0, files: [], last_updated: null };

function getChunkPath(chunkFile) {
    return `support/chunks/${chunkFile}`;
}

function getLocalChunkPath(chunkFile) {
    return path.join(LOCAL_CHUNKS_DIR, chunkFile);
}

function ensureLocalDirs() {
    fs.mkdirSync(path.dirname(LOCAL_METADATA_FILE), { recursive: true });
    fs.mkdirSync(LOCAL_CHUNKS_DIR, { recursive: true });
}

function useRemoteStore() {
    return dataRepoGitHub.isConfigured();
}

function isConflictError(error) {
    return error.status === 409;
}

function readLocalMetadata() {
    if (!fs.existsSync(LOCAL_METADATA_FILE)) {
        return { ...EMPTY_METADATA };
    }

    try {
        return JSON.parse(fs.readFileSync(LOCAL_METADATA_FILE, 'utf8'));
    } catch (error) {
        return { ...EMPTY_METADATA };
    }
}

function writeLocalMetadata(metadata) {
    ensureLocalDirs();
    fs.writeFileSync(LOCAL_METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf8');
}

function readLocalChunk(chunkFile) {
    const filePath = getLocalChunkPath(chunkFile);
    if (!fs.existsSync(filePath)) {
        return [];
    }

    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return Array.isArray(data) ? data : [];
    } catch (error) {
        return [];
    }
}

function writeLocalChunk(chunkFile, chunkData) {
    ensureLocalDirs();
    fs.writeFileSync(getLocalChunkPath(chunkFile), JSON.stringify(chunkData, null, 2), 'utf8');
}

async function loadMetadata() {
    if (useRemoteStore()) {
        const result = await dataRepoGitHub.readJsonFile(METADATA_PATH, { ...EMPTY_METADATA });
        return {
            data: result.data,
            sha: result.sha,
        };
    }

    return {
        data: readLocalMetadata(),
        sha: null,
    };
}

async function loadChunk(chunkFile) {
    if (useRemoteStore()) {
        const result = await dataRepoGitHub.readJsonFile(getChunkPath(chunkFile), []);
        const data = Array.isArray(result.data) ? result.data : [];
        return {
            data,
            sha: result.sha,
        };
    }

    return {
        data: readLocalChunk(chunkFile),
        sha: null,
    };
}

async function saveMetadata(metadata, commitMessage = 'Update feedback metadata') {
    if (useRemoteStore()) {
        const current = await dataRepoGitHub.readJsonFile(METADATA_PATH, { ...EMPTY_METADATA });
        await dataRepoGitHub.writeJsonFile(METADATA_PATH, metadata, commitMessage, current.sha);
        return;
    }

    writeLocalMetadata(metadata);
}

async function saveChunk(chunkFile, chunkData, sha = null, commitMessage = 'Update feedback chunk') {
    if (useRemoteStore()) {
        await dataRepoGitHub.writeJsonFile(getChunkPath(chunkFile), chunkData, commitMessage, sha);
        return;
    }

    writeLocalChunk(chunkFile, chunkData);
}

function getNextChunkFileName(metadata) {
    return `chunk_${metadata.files.length + 1}.json`;
}

async function findFeedbackById(feedbackId, metadata) {
    const filesToCheck = [...metadata.files];

    if (metadata.files.length > 0) {
        filesToCheck.push(getNextChunkFileName(metadata));
    } else {
        filesToCheck.push('chunk_1.json');
    }

    const uniqueFiles = [...new Set(filesToCheck)];

    for (const chunkFile of uniqueFiles) {
        const chunk = await loadChunk(chunkFile);
        const found = chunk.data.find(item => item.id === feedbackId);
        if (found) {
            return { item: found, chunkFile };
        }
    }

    return null;
}

async function ensureMetadataContainsChunk(metadata, chunkFile) {
    const nextFiles = metadata.files.includes(chunkFile)
        ? [...metadata.files]
        : [...metadata.files, chunkFile];

    let totalItems = 0;
    for (const file of nextFiles) {
        const chunk = await loadChunk(file);
        totalItems += chunk.data.length;
    }

    const nextMetadata = {
        ...metadata,
        files: nextFiles,
        total_items: totalItems,
        last_updated: new Date().toISOString(),
    };

    const needsSync = !metadata.files.includes(chunkFile)
        || metadata.total_items !== totalItems;

    if (!needsSync) {
        return metadata;
    }

    await saveMetadata(nextMetadata, `Sync feedback metadata for ${chunkFile}`);
    return nextMetadata;
}

async function appendFeedback(item, maxAttempts = 3) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const metadataResult = await loadMetadata();
            let metadata = { ...metadataResult.data };

            const existing = await findFeedbackById(item.id, metadata);
            if (existing) {
                await ensureMetadataContainsChunk(metadata, existing.chunkFile);
                return existing.item;
            }

            let chunkFile = metadata.files.length > 0
                ? metadata.files[metadata.files.length - 1]
                : 'chunk_1.json';
            let chunkResult = await loadChunk(chunkFile);
            let chunkData = [...chunkResult.data];
            let chunkSha = chunkResult.sha;
            let isNewChunkFile = metadata.files.length === 0;

            if (chunkData.length >= CHUNK_SIZE) {
                chunkFile = getNextChunkFileName(metadata);
                chunkData = [];
                chunkSha = null;
                isNewChunkFile = true;
            }

            chunkData.push(item);

            await saveChunk(
                chunkFile,
                chunkData,
                chunkSha,
                `Add feedback ${item.id}`,
            );

            const nextMetadata = {
                ...metadata,
                total_items: (metadata.total_items || 0) + 1,
                last_updated: new Date().toISOString(),
            };

            if (isNewChunkFile || !metadata.files.includes(chunkFile)) {
                nextMetadata.files = metadata.files.includes(chunkFile)
                    ? [...metadata.files]
                    : [...metadata.files, chunkFile];
            }

            await saveMetadata(nextMetadata, `Add feedback ${item.id}`);
            return item;
        } catch (error) {
            lastError = error;
            if (!isConflictError(error) || attempt === maxAttempts) {
                throw error;
            }
        }
    }

    throw lastError;
}

function generateFeedbackId() {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = crypto.randomUUID().split('-')[0];
    return `fb_${datePart}_${randomPart}`;
}

module.exports = {
    CHUNK_SIZE,
    METADATA_PATH,
    useRemoteStore,
    loadMetadata,
    loadChunk,
    appendFeedback,
    generateFeedbackId,
};
