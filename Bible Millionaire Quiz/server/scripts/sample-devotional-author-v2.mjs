import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LogosEngine } from '../infrastructure/ai/LogosEngine.js';
import { validateUnifiedDevotional } from '../domains/content/devotional/devotional.js';
import {
    AUTHOR_ROTATION,
    DEVOTIONAL_PROMPT_VERSION,
    getProfileByName
} from '../domains/content/devotional/prompts/authorProfiles.js';
import { MEDITATION_STYLES } from '../domains/content/devotional/prompts/styles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputArgument = process.argv.slice(2).find(argument => !argument.startsWith('--'));
const reportPath = outputArgument
    ? path.resolve(outputArgument)
    : path.resolve(__dirname, '../../../reports/靈修作者文風V2免費樣稿.json');
const resumeReport = process.argv.includes('--resume') && existsSync(reportPath)
    ? JSON.parse(readFileSync(reportPath, 'utf8'))
    : null;

const scripture = '忽然起了暴風，波浪打入船內，甚至船要滿了水。耶穌在船尾上，枕著枕頭睡覺。門徒叫醒了他，說：「夫子！我們喪命，你不顧嗎？」耶穌醒了，斥責風，向海說：「住了吧！靜了吧！」風就止住，大大地平靜了。耶穌對他們說：「為甚麼膽怯？你們還沒有信心嗎？」';
const candidate = {
    index: 1,
    reference: '馬可福音 4:37-40',
    CUV_TRAD: scripture,
    CNV_TRAD: '無資料',
    TCV_TRAD: '無資料'
};

const normalize = value => String(value || '').replace(/[\s\p{P}\p{S}]+/gu, '');
const forbiddenOpenings = ['深呼吸一下', '有一個人', '清晨的微光'];
const fabricatedExperiencePatterns = [
    /我曾(?:經)?/, /我的(?:家人|孩子|丈夫|妻子|病情|創傷)/,
    /我在教會(?:服事|工作)/, /我(?:生病|住院|服事|受傷|失去)/
];

const results = [];
const recentOpenings = [];
const passedAllChecks = sample => sample && Object.values(sample.checks || {}).every(Boolean);

for (let index = 0; index < 7; index += 1) {
    const author = getProfileByName(AUTHOR_ROTATION[index]);
    const style = MEDITATION_STYLES[author.styleId];
    const date = new Date(Date.UTC(2026, 7, 16 + index)).toISOString().slice(0, 10);
    const previousSample = resumeReport?.results?.find(sample => sample.styleId === author.styleId);
    if (passedAllChecks(previousSample)) {
        results.push(previousSample);
        recentOpenings.push(String(previousSample.content?.meditation || '').replace(/\s+/g, ' ').trim().slice(0, 50));
        continue;
    }
    const context = {
        date,
        holidayContext: '無特別節期',
        author_name: author.name,
        author_voice: author.authorVoice,
        author_profile_version: 'v2',
        prompt_version: DEVOTIONAL_PROMPT_VERSION,
        style_name: style.name,
        style_prompt: style.prompt,
        recent_openings: recentOpenings,
        candidates: [candidate]
    };

    const response = await LogosEngine.askBrain('unified_devotional', context, {
        priority: false,
        freeOnly: true,
        retry: false,
        model: 'gemini-3.1-flash-lite'
    });

    const checks = {
        jsonComplete: false,
        scriptureSupported: false,
        noFixedPhrase: false,
        openingUnique: false,
        noFabricatedPersonalExperience: false
    };

    try {
        validateUnifiedDevotional(response, 1);
        checks.jsonComplete = true;
    } catch {
        // 完整錯誤會保存在 response，樣稿不會進入正式資料表。
    }

    const responseScripture = normalize(response?.scripture);
    checks.scriptureSupported = responseScripture.length > 0 && normalize(scripture).includes(responseScripture);
    checks.noFixedPhrase = forbiddenOpenings.every(phrase => !JSON.stringify(response || {}).includes(phrase));
    const opening = String(response?.meditation || '').replace(/\s+/g, ' ').trim().slice(0, 50);
    const normalizedOpening = normalize(opening).slice(0, 18);
    checks.openingUnique = normalizedOpening.length >= 12
        && recentOpenings.every(item => normalize(item).slice(0, 12) !== normalizedOpening.slice(0, 12));
    checks.noFabricatedPersonalExperience = fabricatedExperiencePatterns.every(pattern => !pattern.test(response?.meditation || ''));

    recentOpenings.push(opening);
    results.push({
        informalSample: true,
        date,
        author: author.name,
        styleId: author.styleId,
        styleName: author.styleName,
        model: 'gemini-3.1-flash-lite',
        checks,
        content: response
    });
}

const report = {
    generatedAt: new Date().toISOString(),
    purpose: '靈修作者文風 V2 免費金鑰非正式樣稿；不寫入 daily_devotionals。',
    sampleCount: results.length,
    allAutomatedChecksPassed: results.every(passedAllChecks),
    results
};

mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, sampleCount: report.sampleCount, allAutomatedChecksPassed: report.allAutomatedChecksPassed }, null, 2));
