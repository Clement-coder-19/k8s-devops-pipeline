const http = require('http');
const os = require('os');

const PORT = process.env.PORT || 3000;
const VERSION = process.env.APP_VERSION || 'v1';

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Mon App sur Kubernetes</title>
      <style>
        body {
          font-family: system-ui, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #1e3a8a, #0ea5e9);
          color: white;
          text-align: center;
        }
        h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
        p { opacity: 0.85; }
        .badge {
          background: rgba(255,255,255,0.15);
          padding: 8px 16px;
          border-radius: 20px;
          margin-top: 20px;
          font-family: monospace;
        }
      </style>
    </head>
    <body>
        <h1>K8s Demo Platform</h1>
        <p>Déployée via Docker, Helm et Kubernetes</p>
        <p>Supervisée en temps réel avec Prometheus, Grafana et Loki</p>
      <div class="badge">Version: ${VERSION} | Host: ${os.hostname()}</div>
    </body>
    </html>
  `);
});

server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});