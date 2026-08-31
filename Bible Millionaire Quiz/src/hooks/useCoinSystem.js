/**
 * useCoinSystem - 智匯金幣系統
 * [SOVEREIGN v4] 全局唯一錢包，透過 CoinSystemContext 共享狀態
 * 所有 import 路徑保持不變，內部統一從 Context 讀取
 */
export { useCoinSystem, LIFELINE_COSTS, CoinSystemProvider } from '../contexts/CoinSystemContext';
export { useCoinSystem as default } from '../contexts/CoinSystemContext';
