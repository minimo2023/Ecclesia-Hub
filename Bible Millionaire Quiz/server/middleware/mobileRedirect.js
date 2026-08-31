/**
 * Mobile Redirect Middleware
 *
 * ?嚗皜祆?璈?蝵桃? User-Agent嚗??撠???Mobile App?? *
 * ??啣?嚗?撠 http://[HOST]:5174
 * ??啣?嚗?撠 /m/嚗obile App ??鞈????潭迨頝臬?嚗? */

const MOBILE_UA_REGEX =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile Safari/i;

/**
 * ?斗 User-Agent ?臬?箸?璈?蝵? * @param {string} ua - User-Agent 摮葡
 * @returns {boolean}
 */
function isMobileUserAgent(ua) {
    if (!ua) return false;
    return MOBILE_UA_REGEX.test(ua);
}

/**
 * 撱箇? Mobile Redirect Middleware
 * @param {object} options
 * @param {string} [options.mobileDevPort=5174] - ??啣? Mobile App port
 */
export function createMobileRedirectMiddleware(options = {}) {
    const { mobileDevPort = 5174 } = options;
    const isDev = process.env.NODE_ENV !== 'production';

    return function mobileRedirectMiddleware(req, res, next) {
        // ?芣??芣頝臬???GET 隢?嚗??API?ocket.io 鋡怨炊??
        if (req.method !== 'GET') return next();
        if (req.path.startsWith('/api')) return next();
        if (req.path.startsWith('/socket.io')) return next();
        if (req.path.startsWith('/uploads')) return next();
        if (req.path.startsWith('/images')) return next();
        if (req.path.startsWith('/experts')) return next();
        if (req.path.startsWith('/assets')) return next();
        if (req.path.startsWith('/health')) return next();

        // ??啣?嚗歇??/m/ 頝臬?銝?銝???嚗?蝒株艘??
        if (!isDev && req.path.startsWith('/m/')) return next();
        // ??啣?嚗頝臬???/m ?祈澈銋歲??        if (!isDev && req.path === '/m') return next();

        const ua = req.headers['user-agent'] || '';
        if (!isMobileUserAgent(ua)) return next();

        if (isDev) {
            // ??啣?嚗?撠 Mobile App ??Vite dev server
            const host = req.hostname;
            const mobileUrl = `http://${host}:${mobileDevPort}${req.originalUrl || '/'}`;
            console.log(`? [MobileRedirect] Dev redirect ??${mobileUrl} (UA: ${ua.slice(0, 60)})`);
            return res.redirect(302, mobileUrl);
        } else {
            // ??啣?嚗?撠???? /m/ 頝臬?
            const originalUrl = req.originalUrl;
            const mobileUrl = `/m${originalUrl === '/' ? '/' : originalUrl}`;
            console.log(`? [MobileRedirect] Prod redirect ??${mobileUrl}`);
            return res.redirect(302, mobileUrl);
        }
    };
}
