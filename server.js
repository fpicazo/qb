// server.js - HTTP Server for Certificate Validation

const http = require('http');
const express = require('express');
const path = require('path');

const app = express();

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔧 STARTING HTTP VALIDATION SERVER');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Serve static files from .well-known directory
app.use('/.well-known', express.static(path.join(__dirname, '.well-known')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'HTTP validation server running', timestamp: new Date() });
});

// Root endpoint
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Validation Server</title>
      <style>
        body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; }
        .status { background: #d4edda; padding: 20px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <h1>🔧 Validation Server</h1>
      <div class="status">✓ HTTP Server Running on Port 80</div>
      <p>Ready for SSL certificate validation</p>
      <p>Validation files available at: /.well-known/pki-validation/</p>
    </body>
    </html>
  `);
});

// Catch-all for debugging
app.use((req, res) => {
  console.log('Request:', req.method, req.url);
  res.status(404).send('Not Found');
});

// Create HTTP server
const PORT = 80;
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ HTTP Validation Server Started');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 URL: http://infinitecapi.online`);
  console.log(`📁 Validation: http://infinitecapi.online/.well-known/pki-validation/`);
  console.log(`❤️  Health: http://infinitecapi.online/health`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

process.on('SIGTERM', () => {
  console.log('Server stopping...');
  process.exit(0);
});