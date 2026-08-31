export const BIBLE_GROUPS = [
    {
        label: '舊約',
        books: [
            ['創世記', 50], ['出埃及記', 40], ['利未記', 27], ['民數記', 36], ['申命記', 34],
            ['約書亞記', 24], ['士師記', 21], ['路得記', 4], ['撒母耳記上', 31], ['撒母耳記下', 24],
            ['列王紀上', 22], ['列王紀下', 25], ['歷代志上', 29], ['歷代志下', 36], ['以斯拉記', 10],
            ['尼希米記', 13], ['以斯帖記', 10], ['約伯記', 42], ['詩篇', 150], ['箴言', 31],
            ['傳道書', 12], ['雅歌', 8], ['以賽亞書', 66], ['耶利米書', 52], ['耶利米哀歌', 5],
            ['以西結書', 48], ['但以理書', 12], ['何西阿書', 14], ['約珥書', 3], ['阿摩司書', 9],
            ['俄巴底亞書', 1], ['約拿書', 4], ['彌迦書', 7], ['那鴻書', 3], ['哈巴谷書', 3],
            ['西番雅書', 3], ['哈該書', 2], ['撒迦利亞書', 14], ['瑪拉基書', 4]
        ]
    },
    {
        label: '新約',
        books: [
            ['馬太福音', 28], ['馬可福音', 16], ['路加福音', 24], ['約翰福音', 21], ['使徒行傳', 28],
            ['羅馬書', 16], ['哥林多前書', 16], ['哥林多後書', 13], ['加拉太書', 6], ['以弗所書', 6],
            ['腓立比書', 4], ['歌羅西書', 4], ['帖撒羅尼迦前書', 5], ['帖撒羅尼迦後書', 3], ['提摩太前書', 6],
            ['提摩太後書', 4], ['提多書', 3], ['腓利門書', 1], ['希伯來書', 13], ['雅各書', 5],
            ['彼得前書', 5], ['彼得後書', 3], ['約翰一書', 5], ['約翰二書', 1], ['約翰三書', 1],
            ['猶大書', 1], ['啟示錄', 22]
        ]
    }
];

export const CHAPTER_COUNTS = Object.fromEntries(BIBLE_GROUPS.flatMap(group => group.books));

export const VERSIONS = [
    { id: 'CUV_TRAD', name: '和合本' },
    { id: 'CNV_TRAD', name: '新譯本' },
    { id: 'TCV2019_TRAD', name: '現代中文譯本 2019' },
    { id: 'LCC_TRAD', name: '呂振中譯本' }
];

export const UNIFIED_EXPLORER_ENABLED = import.meta.env.VITE_SCRIPTURE_EXPLORER_UNIFIED_ENABLED !== 'false';

export const FEATURES = [
    ...(UNIFIED_EXPLORER_ENABLED ? [{
        id: 'explore', href: 'explore.html', icon: '📖', title: '經文探索', status: '整合試用',
        description: '在同一頁閱讀、搜尋、聆聽，或錄下自己的朗讀；經文只需選擇一次。'
    }] : []),
    {
        id: 'read', href: 'read.html', icon: '🔊', title: '經文朗讀', status: '可試用',
        description: '選擇經文後由裝置朗讀，不使用外部 AI 或付費 API。'
    },
    {
        id: 'record', href: 'record.html', icon: '🎙️', title: '我的朗讀', status: '可試用',
        description: '錄下自己的讀經聲音，先在裝置預聽與下載，不會自動上傳。'
    },
    {
        id: 'search', href: 'search.html', icon: '⌕', title: '經文搜尋', status: '可試用',
        description: '直接搜尋正式經文庫，不呼叫 AI，也不消耗智匯點數。'
    },
    {
        id: 'order', href: 'order.html', icon: '↕', title: '經文排序挑戰', status: '可試用',
        description: '將打亂的連續經節排回原本順序；只使用正式經文，不呼叫 AI。'
    },
    {
        id: 'records', href: 'records.html', icon: '▤', title: '我的記錄', status: '待啟用',
        description: '未來集中管理標記、筆記、書籤與私人朗讀記錄。'
    },
    {
        id: 'share', href: 'share.html', icon: '↗', title: '經文分享', status: '待啟用',
        description: '未來產生不公開列出的分享連結，預設只分享使用者明確選擇的內容。'
    },
    {
        id: 'groups', href: 'groups.html', icon: '◉', title: '共讀小組', status: '待啟用',
        description: '採邀請制的小組互動，不建立公開動態牆，也不混入遊戲。'
    },
    {
        id: 'churches', href: 'churches.html', icon: '⌖', title: '附近教會', status: '待串接',
        description: '使用者同意後才定位，資料由華人教會機構名錄提供。'
    }
];
