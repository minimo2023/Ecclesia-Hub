import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const platformDir = path.dirname(fileURLToPath(import.meta.url));
const hubRoot = path.resolve(platformDir, '..');
const desktopRoot = path.join(hubRoot, 'Bible Millionaire Quiz', 'server', 'public');
const mobileRoot = path.join(hubRoot, 'Bible Millionaire Quiz', 'server', 'public-mobile');
const host = process.env.BASELINE_HOST || '127.0.0.1';
const port = Number(process.env.BASELINE_PORT || 5173);
const apiOrigin = new URL(process.env.BASELINE_API_ORIGIN || 'http://127.0.0.1:3000');

const app = express();

function proxyToDevelopmentApi(req, res) {
  const upstream = http.request({
    protocol: apiOrigin.protocol,
    hostname: apiOrigin.hostname,
    port: apiOrigin.port,
    method: req.method,
    path: req.originalUrl,
    headers: {
      ...req.headers,
      host: apiOrigin.host
    }
  }, (upstreamResponse) => {
    res.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(res);
  });

  upstream.on('error', (error) => {
    if (res.headersSent) return res.end();
    res.status(502).json({
      success: false,
      error: 'DEVELOPMENT_API_UNAVAILABLE',
      message: error.message
    });
  });

  req.pipe(upstream);
}

app.use(['/api', '/socket.io', '/uploads'], proxyToDevelopmentApi);

app.use('/m', express.static(mobileRoot, { index: 'index.html' }));
app.get('/m/*', (_req, res) => res.sendFile(path.join(mobileRoot, 'index.html')));

app.use(express.static(desktopRoot, { index: 'index.html' }));
app.get('*', (_req, res) => res.sendFile(path.join(desktopRoot, 'index.html')));

const server = http.createServer(app);
server.listen(port, host, () => {
  console.log(`Production baseline: http://${host}:${port}`);
  console.log(`Development API proxy: ${apiOrigin.origin}`);
  console.log('Desktop and /m mobile routes are the exact approved production clients.');
});
