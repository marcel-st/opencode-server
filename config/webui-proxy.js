'use strict';

// Proxy that injects {"features":{"web_search":true}} into every chat
// completion request so Open WebUI handles SearXNG search itself. It also
// strips OpenCode tool schemas because local Ollama models commonly print
// JSON-shaped tool calls instead of returning structured tool_calls.

const http = require('http');
const { URL } = require('url');

const UPSTREAM = process.env.OPENWEBUI_URL || 'http://open-webui:8080';
const PORT = 8090;
const SEARCH_RESULT_COUNT = parseInt(process.env.RAG_WEB_SEARCH_RESULT_COUNT || '5', 10);
const SEARXNG_URL = process.env.OPENCODE_SEARXNG_URL || 'http://searxng:8080';

const upstream = new URL(UPSTREAM);

function isChatCompletionRequest(req) {
  return req.method === 'POST' && req.url.includes('/chat/completions');
}

function shouldTransformStream(req, res) {
  const contentType = res.headers['content-type'] || '';
  return isChatCompletionRequest(req) && contentType.includes('text/event-stream') && res.statusCode < 400;
}

function stripToolCalling(json) {
  delete json.tools;
  delete json.tool_choice;
  delete json.parallel_tool_calls;
}

function addNoToolCallingInstruction(json) {
  if (!Array.isArray(json.messages)) return;

  json.messages.unshift({
    role: 'system',
    content: [
      'In this Open WebUI provider path, OpenCode tool calling is disabled.',
      'Do not print JSON tool call objects such as {"name":"todowrite","arguments":{...}}.',
      'Answer the user directly. Web search is handled by Open WebUI before generation.',
    ].join(' '),
  });
}

function messageText(message) {
  if (!message || typeof message !== 'object') return '';
  const content = message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map(part => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
      return '';
    })
    .join('\n');
}

function latestUserMessage(json) {
  if (!Array.isArray(json.messages)) return '';

  for (let index = json.messages.length - 1; index >= 0; index -= 1) {
    const message = json.messages[index];
    if (message && message.role === 'user') return messageText(message).trim();
  }

  return '';
}

function shouldSearchWeb(query) {
  return /\b(search|web|internet|latest|current|today|recent|version|release|published|npm)\b/i.test(query);
}

async function searchWeb(query) {
  const endpoint = new URL('/search', SEARXNG_URL);
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('format', 'json');

  const response = await fetch(endpoint.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`SearXNG request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return (data.results || [])
    .slice(0, Math.max(1, Math.min(10, SEARCH_RESULT_COUNT)))
    .map((result, index) => ({
      rank: index + 1,
      title: result.title || '(untitled)',
      url: result.url || '',
      snippet: result.content || '',
    }));
}

function addSearchContext(json, query, results) {
  if (!Array.isArray(json.messages) || results.length === 0) return;

  json.messages.unshift({
    role: 'system',
    content: [
      `Web search results for "${query}":`,
      '',
      ...results.map(result => [
        `${result.rank}. ${result.title}`,
        `URL: ${result.url || '(no URL)'}`,
        `Snippet: ${result.snippet || 'No snippet available.'}`,
      ].join('\n')),
      '',
      'Use these search results to answer the user. If the results are insufficient, say what is missing.',
    ].join('\n'),
  });
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
  clientReq.on('end', async () => {
    let body = Buffer.concat(chunks);
    const headers = { ...clientReq.headers, host: upstream.host };

    if (isChatCompletionRequest(clientReq)) {
      try {
        const json = JSON.parse(body.toString('utf8'));
        json.features = { ...(json.features || {}), web_search: true };
        stripToolCalling(json);
        const query = latestUserMessage(json);
        if (query && shouldSearchWeb(query)) {
          try {
            const results = await searchWeb(query);
            addSearchContext(json, query, results);
          } catch (err) {
            process.stderr.write(`webui-proxy: SearXNG search failed: ${err.message}\n`);
          }
        }
        addNoToolCallingInstruction(json);
        body = Buffer.from(JSON.stringify(json), 'utf8');
        headers['content-length'] = String(body.length);
        headers['content-type'] = 'application/json';
      } catch (err) {
        process.stderr.write(`webui-proxy: request enrichment failed: ${err.message}\n`);
      }
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
