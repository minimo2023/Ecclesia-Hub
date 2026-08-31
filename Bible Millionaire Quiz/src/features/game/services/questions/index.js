/**
 * Questions Module Entry Point
 * 
 * 導出 QuestionService 實例和工具函數
 */

import QuestionService from './QuestionService';

// 創建單例實例
export const questionService = new QuestionService();

// 同時導出類（用於測試或自定義實例）
export { default as QuestionService } from './QuestionService';

// 導出工具模塊（供其他服務使用）
export * as generator from './questionGenerator';
export * as storage from './questionStorage';
export * as filters from './questionFilters';
export * as validator from './questionValidator';

// 默認導出實例（向後兼容）
export default questionService;
