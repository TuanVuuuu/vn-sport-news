/**
 * Cấu hình thông báo push (FCM).
 *
 * - Mặc định tối đa 3 thông báo/ngày/thiết bị, rải sáng-trưa-tối (ICT).
 * - Có thể override qua biến môi trường hoặc preference từng thiết bị.
 */
const DEFAULT_MAX_PER_DAY = 3;

const TIME_SLOTS = [
    { id: 'morning', label: 'Sáng', startHour: 6, endHour: 11 },
    { id: 'noon', label: 'Trưa', startHour: 11, endHour: 17 },
    { id: 'evening', label: 'Tối', startHour: 17, endHour: 22 },
];

/**
 * Chọn khung giờ được phép gửi theo số lần/ngày.
 * maxPerDay=1 → tối; 2 → sáng+tối; 3 → sáng+trưa+tối.
 */
function getAllowedSlotIds(maxPerDay) {
    const count = Math.max(1, Math.min(maxPerDay, TIME_SLOTS.length));

    if (count === 1) {
        return ['evening'];
    }

    if (count === 2) {
        return ['morning', 'evening'];
    }

    return TIME_SLOTS.map(slot => slot.id);
}

module.exports = {
    enabled: process.env.FCM_ENABLED === 'true',
    timezone: 'Asia/Ho_Chi_Minh',
    timezoneOffsetMinutes: 7 * 60,
    topics: {
        featured: 'sn-featured',
    },
    notifiableCategories: ['featured'],
    limits: {
        maxPerDay: parseInt(process.env.FCM_MAX_PER_DAY, 10) || DEFAULT_MAX_PER_DAY,
        maxArticlesPerNotification: parseInt(process.env.FCM_MAX_ARTICLES_PER_NOTIFICATION, 10) || 5,
    },
    defaults: {
        enabled: true,
        maxPerDay: DEFAULT_MAX_PER_DAY,
        categories: ['featured'],
    },
    timeSlots: TIME_SLOTS,
    getAllowedSlotIds,
};
