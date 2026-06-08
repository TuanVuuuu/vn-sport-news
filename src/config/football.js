const VNEXPRESS_FOOTBALL_BASE_URL = 'https://gw.vnexpress.net/football';

const DEFAULT_LEAGUE_ID = 1;

const ROUND_LABELS = {
    'Group Stage': 'Vòng đấu bảng',
    'Round of 32': 'Vòng 1/16',
    'Round of 16': 'Vòng 1/8',
    'Quarter-finals': 'Tứ kết',
    'Semi-finals': 'Bán kết',
    '3rd Place Final': 'Tranh hạng 3',
    Final: 'Chung kết',
};

const WEEKDAY_LABELS = [
    'Chủ nhật',
    'Thứ 2',
    'Thứ 3',
    'Thứ 4',
    'Thứ 5',
    'Thứ 6',
    'Thứ 7',
];

module.exports = {
    VNEXPRESS_FOOTBALL_BASE_URL,
    DEFAULT_LEAGUE_ID,
    ROUND_LABELS,
    WEEKDAY_LABELS,
};
