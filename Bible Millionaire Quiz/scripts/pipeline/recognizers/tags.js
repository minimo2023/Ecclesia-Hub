/**
 * 主題標籤識別器
 * 從檔名、分類推斷主題標籤
 */

import crypto from 'crypto';

// 主題關鍵字對照表
const TOPIC_KEYWORDS = {
    // 信仰基礎
    '福音': { tag: '福音', type: 'topic' },
    '救恩': { tag: '救恩', type: 'topic' },
    '信仰': { tag: '信仰', type: 'topic' },
    '受洗': { tag: '洗禮', type: 'topic' },
    '洗禮': { tag: '洗禮', type: 'topic' },

    // 靈命成長
    '禱告': { tag: '禱告', type: 'topic' },
    '靈修': { tag: '靈修', type: 'topic' },
    '讀經': { tag: '讀經', type: 'topic' },
    '查經': { tag: '查經', type: 'topic' },
    '門徒': { tag: '門徒訓練', type: 'topic' },
    '成長': { tag: '靈命成長', type: 'topic' },

    // 教會生活
    '教會': { tag: '教會', type: 'topic' },
    '事奉': { tag: '事奉', type: 'topic' },
    '團契': { tag: '團契', type: 'topic' },
    '小組': { tag: '小組', type: 'topic' },
    '牧養': { tag: '牧養', type: 'topic' },

    // 神學主題
    '神學': { tag: '神學', type: 'topic' },
    '教義': { tag: '教義', type: 'topic' },
    '異端': { tag: '異端', type: 'topic' },
    '護教': { tag: '護教', type: 'topic' },
    '預言': { tag: '預言', type: 'topic' },
    '末世': { tag: '末世', type: 'topic' },
    '聖靈': { tag: '聖靈', type: 'topic' },

    // 生活應用
    '婚姻': { tag: '婚姻', type: 'life' },
    '家庭': { tag: '家庭', type: 'life' },
    '親子': { tag: '親子', type: 'life' },
    '工作': { tag: '職場', type: 'life' },
    '職場': { tag: '職場', type: 'life' },
    '苦難': { tag: '苦難', type: 'life' },
    '醫治': { tag: '醫治', type: 'life' },

    // 人物
    '耶穌': { tag: '耶穌', type: 'person' },
    '保羅': { tag: '保羅', type: 'person' },
    '摩西': { tag: '摩西', type: 'person' },
    '大衛': { tag: '大衛', type: 'person' },
    '亞伯拉罕': { tag: '亞伯拉罕', type: 'person' },
    '彼得': { tag: '彼得', type: 'person' },

    // 書卷類型
    '導論': { tag: '導論', type: 'genre' },
    '註解': { tag: '註解', type: 'genre' },
    '註釋': { tag: '註釋', type: 'genre' },
    '研經': { tag: '研經', type: 'genre' },
    '講義': { tag: '講義', type: 'genre' },
    '綱要': { tag: '綱要', type: 'genre' }
};

/**
 * 從文字中識別主題標籤
 */
export function recognizeTags(text) {
    const tags = new Map();

    for (const [keyword, info] of Object.entries(TOPIC_KEYWORDS)) {
        if (text.includes(keyword)) {
            if (!tags.has(info.tag)) {
                tags.set(info.tag, {
                    id: `tag_${crypto.randomUUID().substring(0, 8)}`,
                    name: info.tag,
                    type: info.type,
                    confidence: 0.8  // 關鍵字匹配
                });
            }
        }
    }

    return Array.from(tags.values());
}

/**
 * 從分類推斷標籤
 */
export function tagsFromCategory(categoryId) {
    const categoryTags = {
        '1A': ['福音', '入門'],
        '1B': ['異端', '護教'],
        '1C': ['信仰', '要道'],
        '1D': ['見證'],
        '2A': ['生活', '實踐'],
        '2B': ['靈命成長'],
        '2C': ['培訓'],
        '2D': ['靈修'],
        '2E': ['傳記'],
        '2F': ['聖經人物'],
        '2G': ['輔導', '關懷'],
        '3A': ['研經方法'],
        '3B': ['專題'],
        '3C': ['歷史', '背景'],
        '3D': ['神學'],
        '4C': ['舊約', '專卷'],
        '4D': ['新約', '專卷']
    };

    return (categoryTags[categoryId] || []).map(name => ({
        id: `cat_${categoryId}_${name}`,
        name,
        type: 'category',
        confidence: 1.0
    }));
}

export const name = 'tags';
