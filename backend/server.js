const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const frontendDir = path.join(__dirname, '..', 'frontend');
let registrations = [];

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (reqUrl.pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok', service: 'msa-registration-backend' });
    return;
  }

  if (reqUrl.pathname === '/api/registrations') {
    if (req.method === 'GET') {
      sendJson(res, 200, { registrations });
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          const name = (data.name || '').trim();
          const email = (data.email || '').trim();

          if (!name || !email) {
            sendJson(res, 400, { error: 'Name and email are required.' });
            return;
          }

          const entry = {
            id: Date.now().toString(),
            name,
            email,
            createdAt: new Date().toISOString()
          };

          registrations.unshift(entry);
          sendJson(res, 201, { message: 'Registration saved', entry });
        } catch (error) {
          sendJson(res, 400, { error: 'Invalid JSON payload.' });
        }
      });
      return;
    }
  }

  const pathname = reqUrl.pathname === '/' ? '/index.html' : reqUrl.pathname;
  const filePath = path.join(frontendDir, pathname);

  if (pathname === '/styles.css') {
    serveFile(res, path.join(frontendDir, 'styles.css'), 'text/css; charset=utf-8');
    return;
  }

  if (pathname === '/app.js') {
    serveFile(res, path.join(frontendDir, 'app.js'), 'application/javascript; charset=utf-8');
    return;
  }

  if (pathname === '/firebase-config.js') {
    serveFile(res, path.join(__dirname, '..', 'firebase-config.js'), 'application/javascript; charset=utf-8');
    return;
  }

  if (pathname === '/index.html') {
    serveFile(res, path.join(frontendDir, 'index.html'), 'text/html; charset=utf-8');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
