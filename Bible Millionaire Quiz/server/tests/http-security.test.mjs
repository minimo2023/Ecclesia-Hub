import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-long-enough';
process.env.ANSWER_TOKEN_SECRET = 'test-only-answer-secret-that-is-long-enough';

const { app } = await import('../index.js');
const { ExpertService } = await import('../infrastructure/ExpertService.js');
const { generateAnswerToken } = await import('../utils/tokenHandler.js');

let server;
let baseUrl;

test.before(async () => {
    server = createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

const request = (path, options = {}) => fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: '{}',
    ...options
});

test('member and legacy asset write endpoints reject unauthenticated requests', async () => {
    const endpoints = [
        ['POST', '/api/game-sessions'],
        ['PUT', '/api/users/coins'],
        ['PUT', '/api/users/assets/milestone'],
        ['PUT', '/api/users/stats'],
        ['POST', '/api/users/merge'],
        ['POST', '/api/leaderboard'],
        ['POST', '/api/leaderboard/infinite'],
        ['POST', '/api/achievements/unlock'],
        ['POST', '/api/achievements/check'],
        ['POST', '/api/generate/quiz'],
        ['POST', '/api/logos/ask'],
        ['POST', '/api/quiz/session/reset']
    ];
    for (const [method, path] of endpoints) {
        const response = await request(path, { method });
        assert.equal(response.status, 401, path);
    }
});

test('query-string tokens are rejected', async () => {
    const response = await request('/api/game-sessions?token=forged');
    assert.equal(response.status, 401);
});

test('unknown API paths do not fall through to SPA HTML', async () => {
    const response = await fetch(`${baseUrl}/api/crash`);
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type') || '', /application\/json/);
    assert.equal((await response.json()).error, 'API_NOT_FOUND');
});

test('invalid answer tokens are rejected without database access', async () => {
    const response = await request('/api/quiz/verify', {
        body: JSON.stringify({ answerToken: 'invalid', selectedOption: 'A' })
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'INVALID_TOKEN');
});

test('guest expert requests reach the public lifeline route but require a signed answer token', async () => {
    const response = await request('/api/generate/expert', {
        body: JSON.stringify({
            expert: { name: 'Test Expert' },
            question: {
                question: 'Test question?',
                options: ['A', 'B'],
                answerToken: 'invalid'
            }
        })
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'INVALID_ANSWER_TOKEN');
});

test('guest expert requests with a signed answer token reach the expert service', async () => {
    const originalGenerateAdvice = ExpertService.generateAdvice;
    let receivedQuestion;
    ExpertService.generateAdvice = async ({ question }) => {
        receivedQuestion = question;
        return 'Choose B.';
    };

    try {
        const response = await request('/api/generate/expert', {
            body: JSON.stringify({
                expert: { name: 'Test Expert' },
                question: {
                    question: 'Test question?',
                    options: ['First', 'Second'],
                    answerToken: generateAnswerToken({ answer: 'Second', correctIndex: 1 })
                }
            })
        });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).data.text, 'Choose B.');
        assert.equal(receivedQuestion.answer, 'Second');
        assert.equal(receivedQuestion.correctIndex, 1);
    } finally {
        ExpertService.generateAdvice = originalGenerateAdvice;
    }
});

test('mobile expert images bypass the page redirect and remain image responses', async () => {
    const response = await fetch(`${baseUrl}/experts/${encodeURIComponent('李樂恩博士.png')}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) Mobile/15E148 Safari/604.1'
        },
        redirect: 'manual'
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /^image\/png/);
});
