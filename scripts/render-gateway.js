import http from 'node:http';

const PORT = Number(process.env.PORT || 10000);
const HOST = process.env.YOUPI_BIND_HOST || '0.0.0.0';
const SERVICES = [
  { prefix: '/api', port: 6100, label: 'Payment API' },
  { prefix: '/checkout', port: 7000, label: 'Checkout Portal' },
  { prefix: '/admin', port: 6001, label: 'Merchant Admin' },
  { prefix: '/store', port: 5000, label: 'Demo Store' },
  { prefix: '/gmail', port: 6003, label: 'Gmail Observer' },
  { prefix: '/help', port: 3000, label: 'Help Portal' }
];

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

export function startRenderGateway() {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url || '/', 'http://gateway.local').pathname;

    if (pathname === '/health' || pathname === '/gateway-health') {
      return send(res, 200, JSON.stringify({ status: 'UP', service: 'youpi-pg-render-gateway', routes: SERVICES.map(s => s.prefix) }));
    }

    if (pathname === '/' || pathname === '/index.html') {
      const links = SERVICES.map(s => `<li><a href="${s.prefix}/">${s.label}</a> <code>${s.prefix}/</code></li>`).join('');
      return send(res, 200, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YouPI-PG Gateway</title><style>body{font:16px system-ui;max-width:760px;margin:48px auto;padding:0 20px;background:#0b1020;color:#e5e7eb}a{color:#93c5fd}li{padding:10px}code{color:#a5b4fc}</style><h1>YouPI-PG</h1><p>Render gateway is running. Choose a service route below.</p><ul>${links}</ul><p>Gateway health: <a href="/gateway-health">/gateway-health</a></p><small>Internal localhost ports are available only inside the container.</small></html>`, 'text/html; charset=utf-8');
    }

    const service = SERVICES.find(s => pathname === s.prefix || pathname.startsWith(s.prefix + '/'));
    if (!service) return send(res, 404, JSON.stringify({ error: 'Route not found', availableRoutes: ['/', ...SERVICES.map(s => s.prefix + '/'), '/gateway-health'] }));

    const upstreamPath = (req.url || '/').slice(service.prefix.length) || '/';
    const headers = { ...req.headers, host: `127.0.0.1:${service.port}`, 'x-forwarded-host': req.headers.host || '', 'x-forwarded-proto': 'https', 'x-forwarded-prefix': service.prefix };
    const upstream = http.request({ hostname: '127.0.0.1', port: service.port, method: req.method, path: upstreamPath, headers }, upstreamRes => {
      const responseHeaders = { ...upstreamRes.headers };
      if (responseHeaders.location) {
        responseHeaders.location = responseHeaders.location.replace(/^\/(?!\/)/, service.prefix + '/');
      }
      if (responseHeaders['set-cookie']) {
        responseHeaders['set-cookie'] = responseHeaders['set-cookie'].map(cookie => cookie.replace(/;\s*Path=\//i, `; Path=${service.prefix}/`));
      }
      res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
      upstreamRes.pipe(res);
    });
    upstream.on('error', err => {
      if (!res.headersSent) send(res, 502, JSON.stringify({ error: 'Upstream service unavailable', service: service.label, detail: err.message }));
      else res.destroy(err);
    });
    req.pipe(upstream);
  });

  server.listen(PORT, HOST, () => console.log(`[Render Gateway] Listening on ${HOST}:${PORT}`));
  return server;
}
