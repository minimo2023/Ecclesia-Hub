import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const userSchema = read('../database/schemas/users_core.js');
const securitySchema = read('../database/schemas/security.js');
const authService = read('../domains/members/AuthService.js');
const identityService = read('../domains/members/AuthIdentityService.js');
const authRoutes = read('../domains/members/auth.routes.js');
const mailService = read('../infrastructure/MailService.js');
const feedbackRoutes = read('../infrastructure/feedback/routes.js');
const usageReporter = read('../services/usageReporter.js');
const authContext = read('../../src/contexts/AuthContext.jsx');
const authModal = read('../../src/features/auth/AuthModal.jsx');

test('authentication schema supports verified email, social identities, and one-time challenges', () => {
    assert.match(userSchema, /password_hash TEXT,/);
    assert.match(userSchema, /email_verified_at TIMESTAMPTZ/);
    assert.match(userSchema, /ALTER COLUMN password_hash DROP NOT NULL/);
    assert.match(userSchema, /ON users \(LOWER\(email\)\) WHERE email IS NOT NULL/);
    assert.match(securitySchema, /CREATE TABLE IF NOT EXISTS user_auth_identities/);
    assert.match(securitySchema, /UNIQUE\(provider, provider_subject\)/);
    assert.match(securitySchema, /CREATE TABLE IF NOT EXISTS auth_challenges/);
    assert.match(securitySchema, /token_hash TEXT NOT NULL UNIQUE/);
});

test('refresh sessions store only hashes, rotate atomically, and use a 30 day cookie', () => {
    assert.match(authService, /createHash\('sha256'\)\.update\(refreshToken\)/);
    assert.match(authService, /expiresAt\.setDate\(expiresAt\.getDate\(\) \+ 30\)/);
    assert.match(authService, /UPDATE user_sessions[\s\S]*revoked_at = CURRENT_TIMESTAMP[\s\S]*RETURNING user_id, expires_at/);
    assert.match(authRoutes, /httpOnly: true/);
    assert.match(authRoutes, /sameSite: 'lax'/);
    assert.match(authRoutes, /maxAge: 30 \* 24 \* 60 \* 60 \* 1000/);
    assert.doesNotMatch(authContext, /setItem\('refreshToken',\s*refreshData/);
});

test('Google login verifies a one-time nonce and never stores provider access tokens', () => {
    assert.match(identityService, /verifyIdToken\(\{ idToken: credential, audience: audiences \}\)/);
    assert.match(identityService, /payload\.email_verified !== true/);
    assert.match(identityService, /consumeChallenge\(payload\.nonce, 'google_nonce'\)/);
    assert.match(authRoutes, /GOOGLE_ONBOARDING_REQUIRED/);
    assert.match(authRoutes, /ACCOUNT_LINK_REQUIRED/);
    assert.doesNotMatch(securitySchema, /google_(?:access|refresh)_token/i);
});

test('new local registration waits for email verification before provisioning rewards', () => {
    assert.match(authRoutes, /'pending_email'/);
    assert.match(authRoutes, /EMAIL_VERIFICATION_REQUIRED/);
    assert.match(authRoutes, /provisionActivatedUser\(user\.id, user\.username, \{ pendingOnly: true \}\)/);
    assert.match(authRoutes, /ON CONFLICT DO NOTHING/);
    assert.match(authRoutes, /GENERIC_EMAIL_RESPONSE/);
});

test('SMTP credentials are server environment secrets and certificate validation is enabled', () => {
    for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']) {
        assert.match(mailService, new RegExp(key));
    }
    assert.match(mailService, /rejectUnauthorized: true/);
    assert.doesNotMatch(feedbackRoutes, /createTransport|rejectUnauthorized|\bpass\s*:/);
    assert.doesNotMatch(usageReporter, /createTransport|\bpass\s*:/);
});

test('desktop and mobile-facing auth UI expose Google, email registration, and email recovery', () => {
    assert.match(authModal, /GoogleSignInButton/);
    assert.match(authModal, /type="email"/);
    assert.match(authModal, /confirmPassword/);
    assert.match(authModal, /requestPasswordReset/);
    assert.match(authContext, /credentials: 'include'/);
    assert.match(authContext, /completeGoogleOnboarding/);
    assert.match(authContext, /linkGoogleAccount/);
});

test('authentication responses tolerate empty or non-JSON server bodies', () => {
    assert.match(authContext, /async function readJson\(response\)/);
    assert.match(authContext, /const body = await response\.text\(\)/);
    assert.doesNotMatch(authContext, /await (?:response|refreshRes|retryRes|refreshResponse)\.json\(\)/);
});
