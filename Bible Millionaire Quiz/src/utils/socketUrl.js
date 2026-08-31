
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Get the Socket.IO connection URL based on environment
 */
export const getSocketUrl = () => {
    // 1. If VITE_SOCKET_URL is set (production usually empty or same as API)
    if (import.meta.env.VITE_SOCKET_URL) {
        return import.meta.env.VITE_SOCKET_URL;
    }
    // 2. Dev environment: if API base is absolute, use it
    // NOTE: In Docker prod, this might be internal 3000, so we prefer relative path (proxy) if possible.
    // But for local dev without proxy, we might need 3001.
    // Ideally, local dev uses 'window.location.origin' which hits Vite (5173) -> Proxy -> 3001.
    // Docker prod uses 'window.location.origin' which hits Nginx -> 3000.

    // So 'window.location.origin' is actually correct for BOTH if proxy is set up.
    // We only need manual override if frontend and backend are on different domains without proxy.

    // if (API_BASE && API_BASE.startsWith('http')) {
    //     return API_BASE;
    // }
    // 3. Default: use current origin (for production same-origin or proxy)
    return window.location.origin;
};
