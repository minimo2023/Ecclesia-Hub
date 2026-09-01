import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildSchedule,
    databaseDateKey,
    distributeReferences,
    taiwanDateKey
} from '../domains/content/bible/ReadingPlanService.js';
import {
    normalizeReadingPlanVerses,
    readingSecondsForVerses
} from '../../src/features/reading-plans/readingPlanSessionUtils.js';

test('PostgreSQL DATE values normalize consistently from strings and Date objects', () => {
    assert.equal(databaseDateKey('2026-08-15'), '2026-08-15');
    assert.equal(databaseDateKey(new Date('2026-08-15T00:00:00.000Z')), '2026-08-15');
});

test('Taipei date key does not use the server UTC calendar day', () => {
    assert.equal(taiwanDateKey(new Date('2026-08-15T16:30:00.000Z')), '2026-08-16');
});

test('daily, weekday and weekend plans honor the selected weekdays', () => {
    const daily = buildSchedule({ targetBooks: ['猶大書'], durationDays: 7, readingDays: ['0', '1', '2', '3', '4', '5', '6'], startDate: '2026-08-17' });
    const weekdays = buildSchedule({ targetBooks: ['雅各書'], durationDays: 7, readingDays: ['1', '2', '3', '4', '5'], startDate: '2026-08-17' });
    const weekends = buildSchedule({ targetBooks: ['雅各書'], durationDays: 14, readingDays: ['0', '6'], startDate: '2026-08-17' });

    assert.equal(daily.summary.totalChapters, 1);
    assert.equal(weekdays.summary.actualReadingDays, 5);
    assert.ok(weekdays.schedule.every(item => !['0', '6'].includes(String(new Date(`${item.assignedDate}T00:00:00Z`).getUTCDay()))));
    assert.ok(weekends.schedule.every(item => ['0', '6'].includes(String(new Date(`${item.assignedDate}T00:00:00Z`).getUTCDay()))));
});

test('high reading load is reported but schedule creation remains allowed', () => {
    const result = buildSchedule({ targetBooks: ['詩篇'], durationDays: 7, readingDays: ['0', '6'], startDate: '2026-08-17' });
    assert.equal(result.summary.highLoad, true);
    assert.ok(result.summary.maxChaptersPerDay > 10);
    assert.equal(result.schedule.flatMap(item => item.scriptureReferences).length, 150);
});

test('distribution preserves canonical chapter order and every chapter exactly once', () => {
    const references = Array.from({ length: 11 }, (_, index) => ({ book: '創世記', chapter: index + 1 }));
    const schedule = distributeReferences(references, ['2026-08-17', '2026-08-18', '2026-08-19']);
    assert.deepEqual(schedule.flatMap(item => item.scriptureReferences), references);
    assert.deepEqual(schedule.map(item => item.scriptureReferences.length), [4, 4, 3]);
});

test('reading-plan reader preserves merged verse labels and counts their covered verses', () => {
    const verses = normalizeReadingPlanVerses([
        { verse: 1, verseStart: 1, verseEnd: 2, verseLabel: '1–2', coveredVerses: [1, 2], text: '合併節' },
        { verse: 3, text: '第三節' }
    ]);
    assert.equal(verses[0].verseLabel, '1–2');
    assert.deepEqual(verses[0].coveredVerses, [1, 2]);
    assert.equal(readingSecondsForVerses(verses), 3);
});

test('reading-plan route returns passage identity needed by the shared scripture explorer', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(
        new URL('../domains/content/bible/reading_plans.routes.js', import.meta.url),
        'utf8'
    ));
    assert.match(source, /chapterTitle:[\s\S]*?book,[\s\S]*?chapter,[\s\S]*?references:/);
    assert.match(source, /fetch-local[\s\S]*?presentBibleChapterVerses\(result\.rows \|\| result\)/);
});
