// 生產模式 (Prod): Single Entry Point 模式下使用相對路徑
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const getApiUrl = (path) => `${API_BASE_URL}${path}`;
