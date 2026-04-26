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

function isChatCompletionRequest(req) {
  return req.method === 'POST' && req.url.includes('/chat/completions');
}

function shouldTransformStream(req, res) {
  const contentType = res.headers['content-type'] || '';
  return isChatCompletionRequest(req) && contentType.includes('text/event-stream') && res.statusCode < 400;
}

function filterOpenAIEvent(event) {
  const normalized = event.replace(/\r\n/g, '\n');
  const data = normalized
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart())
    .join('\n')
    .trim();

  if (!data) return '';
  if (data === '[DONE]') return `${event}\n\n`;

  try {
    const json = JSON.parse(data);

    // Open WebUI can emit status/citation/search metadata events when its RAG
    // pipeline is enabled. OpenAI-compatible clients only understand choice
    // chunks, so pass those through and drop UI-only events.
    if (Array.isArray(json.choices) || json.error) return `${event}\n\n`;
  } catch (_) {}

  return '';
}

function pipeOpenAICompatibleStream(proxyRes, clientRes) {
  const headers = { ...proxyRes.headers };
  delete headers['content-length'];

  clientRes.writeHead(proxyRes.statusCode, headers);

  let buffer = '';
  proxyRes.on('data', chunk => {
    buffer = (buffer + chunk.toString('utf8')).replace(/\r\n/g, '\n');

    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      clientRes.write(filterOpenAIEvent(event));
    }
  });

  proxyRes.on('end', () => {
    const remaining = buffer.trim();
    if (remaining) clientRes.write(filterOpenAIEvent(remaining));
    clientRes.end();
  });
}

http.createServer((clientReq, clientRes) => {
  const chunks = [];
  clientReq.on('data', chunk => chunks.push(chunk));
  clientReq.on('end', () => {
    let body = Buffer.concat(chunks);
    const headers = { ...clientReq.headers, host: upstream.host };

    if (isChatCompletionRequest(clientReq)) {
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
        if (shouldTransformStream(clientReq, proxyRes)) {
          pipeOpenAICompatibleStream(proxyRes, clientRes);
          return;
        }

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
