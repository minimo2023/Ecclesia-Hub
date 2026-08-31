/**
 * Expedition Mode Socket Core (Refactored Entry Point)
 * 遠征模式 Socket 核心 - 模組化入口
 */
import { registerRoomHandlers } from './expedition/handlers/roomHandlers.js';
import { registerGameHandlers } from './expedition/handlers/gameHandlers.js';
import { registerItemHandlers } from './expedition/handlers/itemHandlers.js';

/**
 * 初始化遠征模式 Socket
 */
export function initExpeditionSocket(io) {
    const expeditionNamespace = io.of('/expedition');

    expeditionNamespace.on('connection', (socket) => {
        // 註冊所有模組化處理器
        registerRoomHandlers(io, socket);
        registerGameHandlers(io, socket);
        registerItemHandlers(io, socket);
        
        // console.log(`🔌 [Expedition] Socket connected: ${socket.id}`);
    });

    console.log('✅ [Expedition] Socket initialized at /expedition (Modularized)');
}
