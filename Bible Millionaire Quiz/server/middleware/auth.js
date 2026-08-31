import jwt from 'jsonwebtoken';
import { dbOps } from '../database/index.js';
import { getJwtSecret } from '../utils/secrets.js';
// dotenv is loaded by index.js

const JWT_SECRET = getJwtSecret();

export const resolveActiveUserFromToken = async (token) => {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId || decoded.id;
    if (!userId) {
        const error = new Error('Token 缺少使用者識別碼');
        error.code = 'INVALID_TOKEN_SUBJECT';
        throw error;
    }
    const user = await dbOps.getUser(userId);
    if (!user || user.status !== 'active') {
        const error = new Error('帳號不存在或已停用');
        error.code = 'ACCOUNT_NOT_ACTIVE';
        throw error;
    }
    return {
        ...decoded,
        userId,
        role: user.role,
        adminRoles: user.adminRoles || user.admin_roles || [],
        status: user.status
    };
};

// Middleware to authenticate user token
export const authenticateToken = async (req, res, next) => {
    try {
        let token;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({ success: false, error: '未授權' });
        }
        req.user = await resolveActiveUserFromToken(token);
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, error: 'Token 已過期', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ success: false, error: '認證失敗' });
    }
};

// Public endpoints may use this to attach a verified member identity while
// remaining available to guests. An explicitly supplied invalid token is never
// silently downgraded to a guest request.
export const optionalAuthenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return next();
    if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'INVALID_AUTH_SCHEME' });
    }
    try {
        req.user = await resolveActiveUserFromToken(authHeader.slice(7));
        return next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, error: 'TOKEN_EXPIRED' });
        }
        if (error.code === 'ACCOUNT_NOT_ACTIVE') {
            return res.status(403).json({ success: false, error: 'ACCOUNT_NOT_ACTIVE' });
        }
        return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
    }
};

// Middleware to check specific roles (RBAC P1-3)
export const requireRole = (allowedRoles = []) => {
    const normalizedRoles = (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles])
        .map((role) => String(role || '').trim())
        .filter(Boolean);

    return async (req, res, next) => {
        try {
            if (!req.user) return res.status(401).json({ success: false, error: '未授權' });

            // Fetch current role and status using helper service
            const user = await dbOps.getUser(req.user.userId);

            if (!user || user.status !== 'active') {
                return res.status(403).json({ success: false, error: '帳號無權限或已被停用' });
            }

            // Super Admin bypass
            if (user.role === 'super_admin') return next();

            // Admin Roles check (v1.5 Multi-Role support)
            // [UNIFIED ARCHITECTURE] Support both snake_case and camelCase for naming alignment
            const userRoles = Array.isArray(user.adminRoles) ? user.adminRoles : 
                             (Array.isArray(user.admin_roles) ? user.admin_roles : []);
            
            // Check if user has the primary role OR any of the allowedRoles in their adminRoles/admin_roles array
            const hasPermission = normalizedRoles.includes(user.role) ||
                                 normalizedRoles.some(r => userRoles.includes(r));

            if (!hasPermission) {
                return res.status(403).json({ success: false, error: '權限不足' });
            }

            next();
        } catch (error) {
            console.error('RBAC Error:', error);
            res.status(500).json({ success: false, error: '權限驗證系統異常' });
        }
    };
};
