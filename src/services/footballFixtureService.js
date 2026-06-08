const axios = require('axios');
const {
    VNEXPRESS_FOOTBALL_BASE_URL,
    DEFAULT_LEAGUE_ID,
    ROUND_LABELS,
    WEEKDAY_LABELS,
} = require('../config/football');

const CACHE_TTL_MS = parseInt(process.env.FOOTBALL_CACHE_TTL_MS, 10) || 5 * 60 * 1000;
const cache = new Map();

function getCached(key) {
    const entry = cache.get(key);
    if (!entry || Date.now() - entry.at >= CACHE_TTL_MS) {
        return null;
    }

    return entry.data;
}

function setCached(key, data) {
    cache.set(key, { data, at: Date.now() });
}

async function fetchVnExpressFootball(path, leagueId) {
    const cacheKey = `${path}:${leagueId}`;
    const cached = getCached(cacheKey);
    if (cached) {
        return cached;
    }

    const response = await axios.get(`${VNEXPRESS_FOOTBALL_BASE_URL}/${path}`, {
        params: { league_id: leagueId },
        timeout: 15000,
        responseType: 'json',
    });

    if (response.data?.code !== 200) {
        throw new Error(`VnExpress football API trả code ${response.data?.code ?? 'unknown'}.`);
    }

    const leagueBucket = response.data?.data?.[String(leagueId)];
    const payload = leagueBucket?.data ?? [];
    setCached(cacheKey, payload);
    return payload;
}

function mapTeam(team) {
    return {
        id: team.team_id,
        name: team.team_name,
        name_full: team.team_name_full,
        logo: team.logo,
    };
}

function getRoundLabel(round) {
    if (!round) {
        return null;
    }

    const prefix = Object.keys(ROUND_LABELS).find(key => round.startsWith(key));
    return prefix ? ROUND_LABELS[prefix] : round;
}

function getGroupLabel(group) {
    if (!group) {
        return null;
    }

    const match = group.match(/Group\s+([A-Z])/i);
    return match ? `Bảng ${match[1]}` : group;
}

function formatKickoffTime(eventDate) {
    const date = new Date(eventDate);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function formatDateKey(eventDate) {
    const date = new Date(eventDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateLabel(eventDate) {
    const date = new Date(eventDate);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    return `Ngày ${day}/${month}`;
}

function formatWeekdayLabel(eventDate) {
    const date = new Date(eventDate);
    return WEEKDAY_LABELS[date.getDay()];
}

function buildTeamGroupMap(standings) {
    const teamGroupMap = new Map();

    standings.forEach((item) => {
        teamGroupMap.set(item.team_id, {
            group: item.group,
            group_id: item.group_id,
            group_label: getGroupLabel(item.group),
        });
    });

    return teamGroupMap;
}

function transformFixture(match, teamGroupMap) {
    const homeGroup = teamGroupMap.get(match.home_team.team_id);
    const awayGroup = teamGroupMap.get(match.away_team.team_id);
    const groupInfo = homeGroup || awayGroup || null;

    return {
        fixture_id: match.fixture_id,
        kickoff_at: match.event_date,
        kickoff_timestamp: match.event_timestamp,
        kickoff_time: formatKickoffTime(match.event_date),
        home_team: mapTeam(match.home_team),
        away_team: mapTeam(match.away_team),
        score: {
            home: match.goals_home_team,
            away: match.goals_away_team,
        },
        status: match.status,
        status_short: match.status_short,
        round: match.round,
        round_int: match.round_int,
        round_label: getRoundLabel(match.round),
        group: groupInfo?.group ?? null,
        group_id: groupInfo?.group_id ?? null,
        group_label: groupInfo?.group_label ?? null,
        venue: match.venue,
        league: {
            id: match.league_id,
            name: match.league?.name ?? null,
            logo: match.league?.logo ?? null,
            country: match.league?.country ?? null,
        },
    };
}

function buildTeams(fixtures) {
    const teams = new Map();

    fixtures.forEach((match) => {
        [match.home_team, match.away_team].forEach((team) => {
            if (!teams.has(team.id)) {
                teams.set(team.id, team);
            }
        });
    });

    return [...teams.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

function groupFixturesByDate(fixtures) {
    const groups = new Map();

    fixtures.forEach((fixture) => {
        const dateKey = formatDateKey(fixture.kickoff_at);
        if (!groups.has(dateKey)) {
            groups.set(dateKey, {
                date: dateKey,
                date_label: formatDateLabel(fixture.kickoff_at),
                weekday_label: formatWeekdayLabel(fixture.kickoff_at),
                matches: [],
            });
        }

        groups.get(dateKey).matches.push(fixture);
    });

    return [...groups.values()]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((group) => ({
            ...group,
            matches: group.matches.sort((a, b) => a.kickoff_timestamp - b.kickoff_timestamp),
        }));
}

function filterFixtures(fixtures, { date, teamId }) {
    let filtered = fixtures;

    if (date) {
        filtered = filtered.filter(fixture => formatDateKey(fixture.kickoff_at) === date);
    }

    if (teamId) {
        filtered = filtered.filter(fixture => (
            fixture.home_team.id === teamId || fixture.away_team.id === teamId
        ));
    }

    return filtered;
}

function buildLeagueInfo(fixtures) {
    const firstMatch = fixtures[0];
    if (!firstMatch) {
        return null;
    }

    return {
        id: firstMatch.league.id,
        name: firstMatch.league.name,
        logo: firstMatch.league.logo,
        country: firstMatch.league.country,
    };
}

/**
 * Lấy lịch thi đấu từ VnExpress, transform cho mobile app.
 * @param {{ leagueId?: number, date?: string, teamId?: number }} options
 */
async function getFixturesForApi(options = {}) {
    const leagueId = Number(options.leagueId) || DEFAULT_LEAGUE_ID;
    const teamId = options.teamId ? Number(options.teamId) : null;

    const [rawFixtures, standings] = await Promise.all([
        fetchVnExpressFootball('fixture', leagueId),
        fetchVnExpressFootball('standing', leagueId),
    ]);

    const teamGroupMap = buildTeamGroupMap(standings);
    const fixtures = rawFixtures.map(match => transformFixture(match, teamGroupMap));
    const filteredFixtures = filterFixtures(fixtures, {
        date: options.date || null,
        teamId: Number.isNaN(teamId) ? null : teamId,
    });

    const schedule = groupFixturesByDate(filteredFixtures);
    const allTeams = buildTeams(fixtures);
    const availableDates = [...new Set(fixtures.map(fixture => formatDateKey(fixture.kickoff_at)))]
        .sort((a, b) => a.localeCompare(b));

    return {
        league: buildLeagueInfo(fixtures),
        timezone: 'GMT+7',
        timezone_note: 'Giờ thi đấu: GMT+7 Hanoi, Bangkok, Jakarta',
        dates: availableDates,
        teams: allTeams,
        total_matches: filteredFixtures.length,
        schedule,
    };
}

module.exports = {
    getFixturesForApi,
    clearCache: () => cache.clear(),
};
