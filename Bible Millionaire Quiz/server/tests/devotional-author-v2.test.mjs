import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

import { LogosEngineService } from '../infrastructure/ai/LogosEngine.js';
import {
    AUTHOR_PROFILES,
    AUTHOR_ROTATION,
    getProfileByName,
    getRotationIndex,
    resolveAuthorProfileVersion,
    selectAuthorProfile
} from '../domains/content/devotional/prompts/authorProfiles.js';

const dateFrom = (dateKey, offset) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    const value = new Date(Date.UTC(year, month - 1, day + offset));
    return value.toISOString().slice(0, 10);
};

const activeAuthors = AUTHOR_PROFILES.map((profile, index) => ({
    id: index + 100,
    name: profile.name,
    styleId: profile.styleId
}));

test('21 位作者以七種風格交錯輪替，連續 42 天每個循環各出現一次', () => {
    assert.equal(AUTHOR_PROFILES.length, 21);
    assert.equal(new Set(AUTHOR_PROFILES.map(profile => profile.name)).size, 21);
    assert.equal(new Set(AUTHOR_PROFILES.map(profile => profile.styleId)).size, 7);

    for (let cycle = 0; cycle < 2; cycle += 1) {
        const names = [];
        for (let day = 0; day < 21; day += 1) {
            const dateKey = dateFrom('2026-01-05', cycle * 21 + day);
            names.push(AUTHOR_ROTATION[getRotationIndex(dateKey)]);
        }
        assert.deepEqual(new Set(names), new Set(AUTHOR_ROTATION));
    }

    for (let day = 0; day < 41; day += 1) {
        const firstName = AUTHOR_ROTATION[getRotationIndex(dateFrom('2026-01-05', day))];
        const secondName = AUTHOR_ROTATION[getRotationIndex(dateFrom('2026-01-05', day + 1))];
        assert.notEqual(getProfileByName(firstName).styleId, getProfileByName(secondName).styleId);
    }
});

test('輪替在跨年與閏日仍逐日連續', () => {
    for (const [before, after] of [
        ['2026-12-31', '2027-01-01'],
        ['2028-02-28', '2028-02-29'],
        ['2028-02-29', '2028-03-01']
    ]) {
        assert.equal(getRotationIndex(after), (getRotationIndex(before) + 1) % 21);
    }
});

test('V2 作者選擇保留資料庫作者 ID，作者停用時按輪替順序找下一位', () => {
    const selected = selectAuthorProfile('2026-01-05', activeAuthors);
    assert.equal(selected.name, '林以恩');
    assert.equal(selected.id, 100);
    assert.equal(selected.rotationPosition, 1);
    assert.match(selected.authorVoice, /不得虛構作者本人的家庭/);

    const withoutFirst = activeAuthors.filter(author => author.name !== '林以恩');
    const fallback = selectAuthorProfile('2026-01-05', withoutFirst);
    assert.equal(fallback.name, '陳雨晴');
    assert.equal(fallback.scheduledRotationIndex, 0);
});

test('V2 從指定台灣日期啟用且可用環境旗標切回 V1', () => {
    const v2 = { DEVOTIONAL_AUTHOR_PROFILE_VERSION: 'v2', DEVOTIONAL_AUTHOR_V2_START_DATE: '2026-08-16' };
    assert.equal(resolveAuthorProfileVersion('2026-08-15', v2), 'v1');
    assert.equal(resolveAuthorProfileVersion('2026-08-16', v2), 'v2');
    assert.equal(resolveAuthorProfileVersion('2026-08-17', { ...v2, DEVOTIONAL_AUTHOR_PROFILE_VERSION: 'v1' }), 'v1');
});

test('正式 unified prompt 只包含今日作者卡，不載入其餘 20 位作者', () => {
    const engine = new LogosEngineService();
    const today = selectAuthorProfile('2026-01-05', activeAuthors);
    const instruction = engine._buildSystemInstruction('unified_devotional', {
        date: '2026-08-16',
        holidayContext: '無特別節期',
        author_name: today.name,
        author_voice: today.authorVoice,
        author_profile_version: 'v2',
        prompt_version: 'unified_devotional_v2',
        style_name: today.styleName,
        style_prompt: '依今日作者卡完成文章。',
        recent_openings: ['第一篇文章開頭'],
        candidates: [{ index: 1, reference: '約翰福音 1', CUV_TRAD: '太初有道。' }]
    });

    assert.match(instruction, /林以恩/);
    for (const name of AUTHOR_ROTATION.filter(name => name !== '林以恩')) {
        assert.equal(instruction.includes(name), false, `不應注入其他作者：${name}`);
    }
    assert.equal(instruction.includes('## AUTHOR PERSONAS'), false);
    for (const oldExample of ['深呼吸一下', '有一個人', '清晨的微光']) {
        assert.equal(instruction.includes(oldExample), false);
    }
    assert.match(instruction, /最近七篇前 50 字/);
});

test('正式生成停用 LogosEngine 額外重試並保存 V2 追蹤 metadata', () => {
    const source = readFileSync(new URL('../domains/content/devotional/devotional.js', import.meta.url), 'utf8');
    assert.match(source, /askBrain\('unified_devotional'[\s\S]*?retry:\s*false/);
    for (const key of [
        'authorProfileVersion', 'stylePromptVersion', 'promptVersion', 'rotationIndex',
        'model', 'authorType', 'disclosureVersion'
    ]) assert.match(source, new RegExp(`${key}:`));
});

test('桌機與手機共用透明說明文案，且只有 human metadata 可以隱藏', () => {
    const readSourceOrBuild = (sourceUrl, buildAssetsUrl) => {
        if (existsSync(sourceUrl)) return readFileSync(sourceUrl, 'utf8');
        return readdirSync(buildAssetsUrl)
            .filter(file => file.endsWith('.js'))
            .map(file => readFileSync(new URL(file, buildAssetsUrl), 'utf8'))
            .join('\n');
    };
    const desktopSourceUrl = new URL('../../src/features/devotion/components/DevotionCard.jsx', import.meta.url);
    const mobileSourceUrl = new URL('../../mobile-app/src/components/devotion/DevotionArticle.jsx', import.meta.url);
    const desktop = readSourceOrBuild(desktopSourceUrl, new URL('../public/assets/', import.meta.url));
    const mobile = readSourceOrBuild(mobileSourceUrl, new URL('../public-mobile/assets/', import.meta.url));
    const disclosure = '本文由本站虛擬作者透過 AI 輔助撰寫，僅供個人靈修與反思參考。';
    const detail = '內容可能有疏漏，不取代聖經原文、教會牧養或任何專業建議。';

    assert.match(desktop, /metadata\?\.authorType !== 'human'/);
    assert.ok(desktop.includes(disclosure));
    assert.ok(desktop.includes(detail));
    assert.match(desktop, /<details/);
    assert.match(desktop, /虛擬作者/);

    // 手機版直接使用同一個 DevotionCard，透明標示與 human 例外
    // 應由共用元件驗證，不要求 wrapper 重複保存相同文案。
    assert.match(mobile, /import DevotionCard from ['"]\.\.\/\.\.\/\.\.\/\.\.\/src\/features\/devotion\/components\/DevotionCard['"]/);
    assert.match(mobile, /<DevotionCard\b/);
});
