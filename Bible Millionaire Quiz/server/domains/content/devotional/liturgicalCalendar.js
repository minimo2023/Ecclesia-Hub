/**
 * 教會年曆計算模組
 * 自動計算當日的教會節期和是否為主日
 */

/**
 * 計算復活節日期（使用 Meeus/Jones/Butcher 演算法）
 * @param {number} year - 年份
 * @returns {Date} - 復活節日期
 */
function calculateEaster(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;

    return new Date(year, month - 1, day);
}

/**
 * 判斷是否為主日（星期日）
 * @param {Date} date - 日期
 * @returns {boolean} - 是否為主日
 */
function isSunday(date) {
    return date.getDay() === 0;
}

/**
 * 計算兩個日期之間的天數差
 * @param {Date} date1
 * @param {Date} date2
 * @returns {number} - 天數差
 */
function daysBetween(date1, date2) {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round((date2 - date1) / oneDay);
}

/**
 * 計算當日的教會節期
 * @param {Date} date - 日期（預設為今天）
 * @returns {Object} - { season: 節期英文名, seasonChinese: 節期中文名, theme: 神學意象 }
 */
function getLiturgicalSeason(date = new Date()) {
    const year = date.getFullYear();
    const easter = calculateEaster(year);

    // 計算各節期的關鍵日期
    const ashWednesday = new Date(easter);
    ashWednesday.setDate(easter.getDate() - 46); // 復活節前 46 天

    const palmSunday = new Date(easter);
    palmSunday.setDate(easter.getDate() - 7); // 復活節前 7 天（棕枝主日）

    const pentecost = new Date(easter);
    pentecost.setDate(easter.getDate() + 49); // 復活節後 49 天（聖靈降臨節）

    // 計算將臨期第一主日（復活節前約 4 週的主日，但實際是 11/27 - 12/3 之間的主日）
    const christmas = new Date(year, 11, 25); // 12/25
    let adventStart = new Date(year, 10, 27); // 11/27 開始尋找
    while (adventStart.getDay() !== 0) {
        adventStart.setDate(adventStart.getDate() + 1);
    }

    const epiphany = new Date(year, 0, 6); // 1/6 主顯節
    const christmasEnd = new Date(year, 0, 5); // 1/5 聖誕期結束

    // 判斷當前節期
    const daysSinceEaster = daysBetween(easter, date);

    // 將臨期 (Advent): 聖誕節前 4 個主日
    if (date >= adventStart && date < christmas) {
        return {
            season: 'Advent',
            seasonChinese: '將臨期',
            theme: '等候、盼望、黑暗中的光、基督再來'
        };
    }

    // 聖誕期 (Christmastide): 12/25 - 1/5
    if ((date >= christmas && date.getMonth() === 11) ||
        (date <= christmasEnd && date.getMonth() === 0)) {
        return {
            season: 'Christmastide',
            seasonChinese: '聖誕期',
            theme: '道成肉身、臨在、新生王'
        };
    }

    // 主顯期 (Epiphany): 1/6 - 大齋期前
    if (date >= epiphany && date < ashWednesday) {
        return {
            season: 'Epiphany',
            seasonChinese: '主顯期',
            theme: '顯現、光照、外邦人歸信'
        };
    }

    // 大齋期 (Lent): 聖灰星期三 - 棕枝主日前
    if (date >= ashWednesday && date < palmSunday) {
        return {
            season: 'Lent',
            seasonChinese: '大齋期',
            theme: '悔改、預備、禁食、曠野試探'
        };
    }

    // 聖週 (Holy Week): 棕枝主日 - 復活節前
    if (date >= palmSunday && date < easter) {
        return {
            season: 'Holy Week',
            seasonChinese: '聖週',
            theme: '受苦、捨己、十架'
        };
    }

    // 復活期 (Eastertide): 復活節 - 聖靈降臨節前
    if (daysSinceEaster >= 0 && daysSinceEaster < 49) {
        return {
            season: 'Eastertide',
            seasonChinese: '復活期',
            theme: '復活、更新、新生命、戰勝死亡'
        };
    }

    // 聖靈降臨日 (Pentecost): 復活節後第 50 天
    if (daysSinceEaster === 49) {
        return {
            season: 'Pentecost',
            seasonChinese: '聖靈降臨日',
            theme: '聖靈降臨、差遣、教會建立'
        };
    }

    // 常年期 (Ordinary Time): 其他時間
    return {
        season: 'Ordinary Time',
        seasonChinese: '常年期',
        theme: '日常門徒生活、教導、成長'
    };
}

/**
 * 獲取當日的完整教會年曆資訊
 * @param {Date} date - 日期（預設為今天）
 * @returns {Object} - { season, seasonChinese, theme, isSunday }
 */
function getTodayLiturgicalInfo(date = new Date()) {
    const seasonInfo = getLiturgicalSeason(date);
    const sunday = isSunday(date);

    return {
        ...seasonInfo,
        isSunday: sunday,
        isSundayChinese: sunday ? '是' : '否'
    };
}

module.exports = {
    getLiturgicalSeason,
    getTodayLiturgicalInfo
};
