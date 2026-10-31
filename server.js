const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';
const publicFiles = new Set(['/index.html', '/style.css', '/app.js', '/distance-verifier.js', '/assets/alarm_sounds/manifest.json']);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  if (pathname === '/') pathname = '/index.html';
  const normalizedPath = path.posix.normalize(pathname);
  if (!publicFiles.has(normalizedPath) && !/^\/assets\/alarm_sounds\/[a-zA-Z0-9._-]+\.mp3$/.test(normalizedPath)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  const filePath = path.resolve(root, `.${pathname}`);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }
    const headers = {
      'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
    };
    const range = request.headers.range;
    if (range && path.extname(filePath) === '.mp3') {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const start = match?.[1] ? Number(match[1]) : 0;
      const end = match?.[2] ? Math.min(Number(match[2]), content.length - 1) : content.length - 1;
      if (!match || start > end || start >= content.length) {
        response.writeHead(416, { 'Content-Range': `bytes */${content.length}` }).end();
        return;
      }
      response.writeHead(206, {
        ...headers,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${content.length}`,
      });
      response.end(content.subarray(start, end + 1));
      return;
    }
    headers['Content-Length'] = content.length;
    response.writeHead(200, headers);
    response.end(request.method === 'HEAD' ? undefined : content);
  });
});

server.listen(port, host, () => {
  console.log(`Move to Wake preview: http://localhost:${port}`);
  if (host === '0.0.0.0') console.log(`LAN preview: http://<this-PC-local-IP>:${port}`);
  console.log('Press Ctrl+C to stop the preview server.');
});
