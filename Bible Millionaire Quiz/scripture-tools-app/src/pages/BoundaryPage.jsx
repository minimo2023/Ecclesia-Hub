import { BookMarked, Church, LockKeyhole, Share2, Users, Wrench } from 'lucide-react';
import { AppShell } from '../components/AppShell.jsx';

const configs = {
    records: {
        title: '我的記錄', icon: BookMarked, status: '尚未啟用資料寫入',
        intro: '這一頁未來只整理使用者自己的標記、筆記、書籤與私人朗讀記錄。',
        ready: ['獨立於靈修筆記，不混用內容欄位', '預設私人，只有本人可讀取', '支援匯出與刪除'],
        pending: ['先修正既有經文標記資料表欄位落差', '加入版本與經文位置', '完成會員所有權與刪除測試']
    },
    share: {
        title: '經文分享', icon: Share2, status: '分享連結尚未啟用',
        intro: '這一頁將負責產生不公開列出的分享連結；目前不會把任何筆記或錄音送到伺服器。',
        ready: ['分享前逐項勾選經文、文字或錄音', '連結可設期限並隨時撤銷', '不建立公開動態牆'],
        pending: ['設計撤銷式分享憑證', '建立音檔大小與格式驗證', '完成未登入觀看與濫用防護']
    },
    groups: {
        title: '共讀小組', icon: Users, status: '邀請制小組尚未啟用',
        intro: '共讀會維持小型、邀請制，焦點是經文與成員明確分享的內容，不做陌生人社群。',
        ready: ['邀請制加入，不提供公開搜尋', '經文活動與遊戲完全分開', '成員可離開並帶走自己的私人內容'],
        pending: ['先完成角色與權限模型', '建立檢舉、封鎖與管理紀錄', '完成通知偏好與資料保留規則']
    },
    churches: {
        title: '附近教會', icon: Church, status: '等待 CCNDA 端點正式串接',
        intro: '只有使用者主動要求並同意後才使用當次位置；不保存長期位置，也不把對話或信仰處境傳給教會。',
        ready: ['拒絕定位後可手動輸入地區', '只依距離排序，不評分或付費置頂', '顯示資料來源與最後更新時間'],
        pending: ['依官方 API 3.1 規格建立供應介面', '驗證金鑰只留在後端', '完成 API 失效時的原名錄外部入口']
    }
};

export function BoundaryPage({ type }) {
    const config = configs[type];
    const Icon = config.icon;
    return (
        <AppShell title={config.title} eyebrow="經文工具・獨立模組邊界">
            <div className="boundary-hero">
                <span className="boundary-icon"><Icon size={30} /></span>
                <div><span className="status-pill status-wait">{config.status}</span><p>{config.intro}</p></div>
            </div>
            <div className="boundary-grid">
                <section className="boundary-card"><h2><LockKeyhole size={19} /> 已固定的界線</h2><ul>{config.ready.map(item => <li key={item}>{item}</li>)}</ul></section>
                <section className="boundary-card"><h2><Wrench size={19} /> 啟用前工作</h2><ul>{config.pending.map(item => <li key={item}>{item}</li>)}</ul></section>
            </div>
            <div className="notice">目前這一頁只呈現流程與界線，沒有假資料、沒有隱藏上傳，也不會修改正式帳號內容。</div>
        </AppShell>
    );
}
