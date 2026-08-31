export const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

export function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return '早安';
    if (hour < 18) return '午安';
    return '晚安';
}

export function buildWeek(checkins = []) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDay = new Date(today);
    firstDay.setDate(today.getDate() - today.getDay());

    return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(firstDay);
        date.setDate(firstDay.getDate() + index);
        const dateString = getLocalDateString(date);

        const checkin = checkins.find(c => c.date === dateString);
        const active = checkin ? (checkin.read_at && checkin.wrote_note_at) : false;

        return {
            day: dayNames[index],
            date: date.getDate(),
            active,
            future: date > today,
            isToday: dateString === getLocalDateString(today),
        };
    });
}

export function calculateStreak(checkins = []) {
    if (!checkins.length) return 0;

    const validDates = new Set(
        checkins
            .filter(c => c.read_at && c.wrote_note_at)
            .map(c => c.date)
    );
    
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    let streak = 0;
    while (validDates.has(getLocalDateString(cursor))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
}

export function isFallbackDevotionalTitle(title, author) {
    if (!title || typeof title !== 'string') return true;
    const trimmed = title.trim();
    if (!trimmed) return true;
    if (trimmed === '今日靈修') return true;
    if (trimmed.includes('的今日靈修')) return true;
    return Boolean(author && trimmed === `${author} 的今日靈修`);
}

export function deriveDevotionalTitle(data, reference) {
    const candidates = [
        data.topic,
        data.mainTheme,
        data.main_theme,
        data.theme,
        data.summaryTitle,
        data.title,
    ].filter(Boolean);

    const meaningful = candidates.find((candidate) => !isFallbackDevotionalTitle(candidate, data.author));
    if (meaningful) return meaningful;

    const cleanReference = String(reference || '')
        .replace(/\s*\([^)]*\)\s*/g, '')
        .replace(/\s+\d+(:\d+(-\d+)?)?$/, '')
        .trim();

    return cleanReference ? `${cleanReference}默想` : '今日靈修';
}

export function deriveDevotionalSummary(data, reference) {
    const candidates = [
        data.summary,
        data.mainTheme,
        data.main_theme,
        data.topic,
        data.understanding,
        data.meditation,
        data.closingWord,
    ].filter(Boolean);

    const meaningful = candidates.find((candidate) => !isFallbackDevotionalTitle(candidate, data.author));
    if (meaningful) return meaningful;

    return data.scripture
        ? `${data.scripture} (${reference})`
        : '安靜讀一段經文，讓今天從神的話開始。';
}
