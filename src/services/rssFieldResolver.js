/**
 * Trích xuất giá trị từ node RSS đã parse bằng xml2js, theo cấu hình provider.
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function toText(value) {
    if (value == null) return '';
    if (Array.isArray(value)) return toText(value[0]);
    if (typeof value === 'object') return '';
    return String(value).trim();
}

/**
 * @param {object} node
 * @param {string} fieldPath
 * @returns {string}
 */
function getNodeValue(node, fieldPath) {
    if (!node) return '';

    if (fieldPath === 'description.img') {
        const description = toText(node.description);
        const match = /<img[^>]+src="([^">]+)"/i.exec(description);
        return match ? match[1].trim() : '';
    }

    if (fieldPath === 'enclosure.url') {
        const enclosure = node.enclosure?.[0]?.$;
        return enclosure?.url ? String(enclosure.url).trim() : '';
    }

    if (fieldPath.includes('.')) {
        const [root, ...rest] = fieldPath.split('.');
        const rootValue = node[root];
        if (!rootValue) return '';

        if (root === 'image' && rest[0] === 'url') {
            return toText(rootValue[0]?.url);
        }

        return toText(rootValue);
    }

    return toText(node[fieldPath]);
}

/**
 * @param {object} node
 * @param {string[]} fields
 * @returns {string}
 */
function resolveFirstField(node, fields = []) {
    for (const field of fields) {
        const value = getNodeValue(node, field);
        if (value) return value;
    }
    return '';
}

/**
 * @param {object} provider
 * @param {object} channel
 * @param {object} [item]
 * @returns {string}
 */
function resolveSource(provider, channel, item) {
    const { scope, fields, fallbackFields = [] } = provider.source;
    const primaryNode = scope === 'item' ? item : channel;
    const fallbackNode = scope === 'item' ? channel : null;

    const value = resolveFirstField(primaryNode, fields);
    if (value) return value;

    if (fallbackNode) {
        return resolveFirstField(fallbackNode, fallbackFields);
    }

    return resolveFirstField(primaryNode, fallbackFields);
}

/**
 * @param {object} item
 * @param {object} thumbnailConfig
 * @returns {string|null}
 */
function resolveThumbnail(item, thumbnailConfig) {
    const url = resolveFirstField(item, thumbnailConfig.fields);
    if (!url) return null;

    return applyThumbnailTransforms(url, thumbnailConfig.transforms);
}

/**
 * @param {string} url
 * @param {Array<{ hostIncludes?: string, pattern: RegExp, replacement: string }>} transforms
 * @returns {string}
 */
function applyThumbnailTransforms(url, transforms = []) {
    return transforms.reduce((current, rule) => {
        if (rule.hostIncludes && !current.includes(rule.hostIncludes)) {
            return current;
        }
        return current.replace(rule.pattern, rule.replacement);
    }, url);
}

/**
 * @param {object} channel
 * @returns {object}
 */
function resolveChannelInfo(channel) {
    return {
        title: toText(channel.title),
        description: toText(channel.description),
        generator: toText(channel.generator),
        copyright: toText(channel.copyright),
        logo_url: getNodeValue(channel, 'image.url'),
        link: toText(channel.link),
        last_updated: toText(channel.pubDate),
    };
}

module.exports = {
    getNodeValue,
    resolveSource,
    resolveThumbnail,
    resolveChannelInfo,
    toText,
};
