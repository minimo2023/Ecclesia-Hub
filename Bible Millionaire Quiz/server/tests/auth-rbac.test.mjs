import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-long-enough';

const { dbOps } = await import('../database/index.js');
const { authenticateToken, requireRole } = await import('../middleware/auth.js');

const createResponse = () => ({
    statusCode: 200,
    payload: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.payload = payload;
        return this;
    }
});

const runMiddleware = async (middleware, req = {}) => {
    const res = createResponse();
    let nextCalled = false;
    await middleware(req, res, () => { nextCalled = true; });
    return { req, res, nextCalled };
};

test('authentication distinguishes valid, expired, invalid, and suspended accounts', async (t) => {
    const originalGetUser = dbOps.getUser;
    t.after(() => { dbOps.getUser = originalGetUser; });

    dbOps.getUser = async (userId) => userId === 'active-user'
        ? { id: userId, role: 'user', adminRoles: [], status: 'active' }
        : { id: userId, role: 'user', adminRoles: [], status: 'suspended' };

    const activeToken = jwt.sign({ userId: 'active-user' }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const active = await runMiddleware(authenticateToken, {
        headers: { authorization: `Bearer ${activeToken}` }
    });
    assert.equal(active.nextCalled, true);
    assert.equal(active.req.user.userId, 'active-user');

    const expiredToken = jwt.sign(
        { userId: 'active-user', exp: Math.floor(Date.now() / 1000) - 1 },
        process.env.JWT_SECRET
    );
    const expired = await runMiddleware(authenticateToken, {
        headers: { authorization: `Bearer ${expiredToken}` }
    });
    assert.equal(expired.res.statusCode, 401);
    assert.equal(expired.res.payload.code, 'TOKEN_EXPIRED');

    const invalid = await runMiddleware(authenticateToken, {
        headers: { authorization: 'Bearer not-a-token' }
    });
    assert.equal(invalid.res.statusCode, 401);
    assert.equal(invalid.nextCalled, false);

    const suspendedToken = jwt.sign({ userId: 'suspended-user' }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const suspended = await runMiddleware(authenticateToken, {
        headers: { authorization: `Bearer ${suspendedToken}` }
    });
    assert.equal(suspended.res.statusCode, 401);
    assert.equal(suspended.nextCalled, false);
});

test('RBAC returns 401, 403, or success for the role matrix', async (t) => {
    const originalGetUser = dbOps.getUser;
    t.after(() => { dbOps.getUser = originalGetUser; });

    const middleware = requireRole(['admin_ops']);

    const unauthenticated = await runMiddleware(middleware, { headers: {} });
    assert.equal(unauthenticated.res.statusCode, 401);

    dbOps.getUser = async () => ({ role: 'user', adminRoles: [], status: 'active' });
    const member = await runMiddleware(middleware, { user: { userId: 'member-1' } });
    assert.equal(member.res.statusCode, 403);

    dbOps.getUser = async () => ({ role: 'user', adminRoles: ['admin_ops'], status: 'active' });
    const delegatedAdmin = await runMiddleware(middleware, { user: { userId: 'ops-1' } });
    assert.equal(delegatedAdmin.nextCalled, true);

    dbOps.getUser = async () => ({ role: 'super_admin', adminRoles: [], status: 'active' });
    const superAdmin = await runMiddleware(middleware, { user: { userId: 'root-1' } });
    assert.equal(superAdmin.nextCalled, true);

    dbOps.getUser = async () => ({ role: 'super_admin', adminRoles: [], status: 'suspended' });
    const suspendedAdmin = await runMiddleware(middleware, { user: { userId: 'root-2' } });
    assert.equal(suspendedAdmin.res.statusCode, 403);
    assert.equal(suspendedAdmin.nextCalled, false);
});

test('RBAC safely normalizes a legacy single role value', async (t) => {
    const originalGetUser = dbOps.getUser;
    t.after(() => { dbOps.getUser = originalGetUser; });
    dbOps.getUser = async () => ({ role: 'admin_ops', adminRoles: [], status: 'active' });

    const result = await runMiddleware(requireRole('admin_ops'), { user: { userId: 'ops-1' } });
    assert.equal(result.nextCalled, true);
});
