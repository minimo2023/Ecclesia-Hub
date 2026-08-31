import { dbOps } from '../../database/index.js';

// 活躍隊伍房間內存狀態
export const activeRooms = new Map();

/**
 * 取得房間狀態
 */
export const getRoom = (teamId) => activeRooms.get(teamId);

/**
 * 更新房間狀態
 */
export const setRoom = (teamId, roomData) => activeRooms.set(teamId, roomData);

/**
 * 刪除房間
 */
export const deleteRoom = (teamId) => activeRooms.delete(teamId);
