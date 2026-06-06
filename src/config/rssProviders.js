/**
 * Cấu hình parser theo từng nguồn RSS.
 *
 * Thêm nguồn mới: khai báo object provider ở đây, gán provider id vào category.
 * Không cần sửa parseService hay thêm if/else.
 *
 * source.scope:
 *   - 'channel': lấy source từ metadata channel (vd. VnExpress → generator)
 *   - 'item':    lấy source từ từng item (vd. dc:creator)
 *
 * source.fields / fallbackFields:
 *   Danh sách field thử lần lượt. Hỗ trợ:
 *   - field đơn: 'generator', 'dc:creator', 'copyright', 'title'
 *   - nested:    'enclosure.url', 'image.url'
 *   - đặc biệt:   'description.img' (trích src từ thẻ img trong description)
 *
 * thumbnail.transforms:
 *   Chuỗi biến đổi URL sau khi trích xuất (theo host/pattern).
 */
const rssProviders = {
    vnexpress: {
        id: 'vnexpress',
        name: 'VnExpress',
        source: {
            scope: 'channel',
            fields: ['generator'],
            fallbackFields: ['copyright', 'title'],
        },
        thumbnail: {
            fields: ['enclosure.url', 'description.img'],
            transforms: [],
        },
    },
    thethao247: {
        id: 'thethao247',
        name: 'Thể Thao 247',
        source: {
            scope: 'channel',
            fields: ['copyright'],
            fallbackFields: ['title'],
        },
        thumbnail: {
            fields: ['enclosure.url', 'description.img'],
            transforms: [
                {
                    hostIncludes: 'cdn-img.thethao247.vn',
                    pattern: /resize_\d+x\d+/i,
                    replacement: 'resize_760x460',
                },
            ],
        },
    },
};

const DEFAULT_PROVIDER_ID = 'vnexpress';

/**
 * @param {string} [providerId]
 * @returns {object}
 */
function getRssProvider(providerId) {
    const id = providerId || DEFAULT_PROVIDER_ID;
    const provider = rssProviders[id];

    if (!provider) {
        throw new Error(`RSS provider "${id}" chưa được cấu hình.`);
    }

    return provider;
}

module.exports = {
    rssProviders,
    DEFAULT_PROVIDER_ID,
    getRssProvider,
};
