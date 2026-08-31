-- Expedition Mode Configuration Table
-- Stores all adjustable settings for the Bible Expedition mode

CREATE TABLE IF NOT EXISTS expedition_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,  -- JSON formatted value
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default configuration
INSERT OR IGNORE INTO expedition_config (key, value, description) VALUES
-- Stages
('stages', '[
    {"id":"peaceful","name":"平安平原","milestone":70,"bgColor":"#a7f3d0","countdown":7,"protection":"full","reward":1},
    {"id":"wilderness","name":"曠野行軍","milestone":210,"bgColor":"#fef08a","countdown":7,"protection":"partial","reward":2},
    {"id":"valley","name":"死蔭幽谷","milestone":500,"bgColor":"#581c87","countdown":7,"protection":"none","reward":5},
    {"id":"summit","name":"至聖之巔","milestone":999999,"bgColor":"#0a0a0a","countdown":5,"protection":"none","reward":10}
]', '遠征階段設定'),

-- Shop items
('shop_items', '[
    {"id":"healthPotion","name":"補血藥水","shopPrice":30,"fieldPrice":50,"effect":"heal_1","description":"恢復 1 ❤️"},
    {"id":"shield","name":"真理之盾","shopPrice":50,"fieldPrice":80,"effect":"passive_block","description":"被動抵銷扣血"},
    {"id":"scroll","name":"智慧卷軸","shopPrice":70,"fieldPrice":100,"effect":"eliminate_2","description":"排除 2 個錯誤選項"},
    {"id":"tent","name":"帳篷","shopPrice":70,"fieldPrice":140,"effect":"save","description":"儲存進度"}
]', '商店道具設定'),

-- Question ratio
('question_ratio', '{"bible":0.8,"geography":0.2}', '出題比例：經文 vs 地理'),

-- Initial lives
('initial_lives', '3', '初始生命值');

CREATE INDEX IF NOT EXISTS idx_expedition_config_updated ON expedition_config(updated_at);
