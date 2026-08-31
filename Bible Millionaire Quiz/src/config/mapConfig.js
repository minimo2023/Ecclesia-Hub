/**
 * 地圖配置檔案 - 統一管理所有地圖相關設定
 * 維護者可在此調整地圖行為，無需修改元件程式碼
 */

export const MAP_CONFIG = {
    // 預設中心點（耶路撒冷）
    defaultCenter: [31.7683, 35.2137],

    // 預設縮放等級
    defaultZoom: 8,

    // 最小/最大縮放等級
    minZoom: 6,
    maxZoom: 15,

    // 地圖圖層配置
    layers: {
        modern: {
            name: '現代地圖',
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors'
        },
        biblical: {
            name: '聖經時代',
            // 未來可替換為自訂聖經地圖圖層
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors',
            opacity: 0.7
        }
    },

    // 標記圖示配置
    markerIcons: {
        city: {
            iconUrl: '/markers/city.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        },
        temple: {
            iconUrl: '/markers/temple.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        },
        mountain: {
            iconUrl: '/markers/mountain.png',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        }
    },

    // 動畫配置
    animation: {
        journeySpeed: 1000, // 每段路線的動畫時間（毫秒）
        markerBounce: true,
        autoPlay: false
    },

    // 效能設定
    performance: {
        clusterMarkers: true, // 大量標記時啟用聚類
        clusterMaxZoom: 12,
        lazyLoadImages: true
    }
};

/**
 * 距離計算配置
 */
export const DISTANCE_CONFIG = {
    // 古代步行速度（公里/天）
    walkingSpeedPerDay: 30,

    // 騎駱駝速度（公里/天）
    camelSpeedPerDay: 50,

    // 單位轉換
    units: {
        metric: 'km',
        imperial: 'miles'
    }
};

/**
 * API 快取配置
 */
export const CACHE_CONFIG = {
    // 經文快取時間（毫秒）
    scriptureCache: 1000 * 60 * 60, // 1 小時

    // 原文字典快取時間
    lexiconCache: 1000 * 60 * 60 * 24, // 24 小時

    // 地點資料快取
    locationCache: 1000 * 60 * 60 * 24 * 7, // 7 天

    // 最大快取項目數
    maxCacheItems: 100
};
