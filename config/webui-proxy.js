'use strict';

// Proxy that injects {"features":{"web_search":true}} into every chat
// completion request so Open WebUI handles SearXNG search itself rather
// than relying on model-level tool calling (which local 8B models don't
// support reliably).

const http = require('http');
const { URL } = require('url');

const UPSTREAM = process.env.OPENWEBUI_URL || 'http://open-webui:8080';
const PORT = 8090;

const upstream = new URL(UPSTREAM);

http.createServer((clientReq, clientRes) => {
  const chunks = [];
  clientReq.on('data', chunk => chunks.push(chunk));
  clientReq.on('end', () => {
    let body = Buffer.concat(chunks);
    const headers = { ...clientReq.headers, host: upstream.host };

    if (clientReq.method === 'POST' && clientReq.url.includes('/chat/completions')) {
      try {
        const json = JSON.parse(body.toString('utf8'));
        json.features = { ...(json.features || {}), web_search: true };
        body = Buffer.from(JSON.stringify(json), 'utf8');
        headers['content-length'] = String(body.length);
        headers['content-type'] = 'application/json';
      } catch (_) {}
    }

    const proxyReq = http.request(
      {
        hostname: upstream.hostname,
        port: parseInt(upstream.port) || 80,
        path: clientReq.url,
        method: clientReq.method,
        headers,
      },
      proxyRes => {
        clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(clientRes);
      }
    );

    proxyReq.on('error', err => {
      if (!clientRes.headersSent) {
        clientRes.writeHead(502);
        clientRes.end(`Proxy error: ${err.message}`);
      }
    });

    proxyReq.write(body);
    proxyReq.end();
  });

  clientReq.on('error', err => {
    clientRes.writeHead(400);
    clientRes.end(`Request error: ${err.message}`);
  });
}).listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`webui-proxy: localhost:${PORT} -> ${UPSTREAM}\n`);
});
