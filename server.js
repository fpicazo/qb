// server.js - Main server entry point

const express = require('express');
const soap = require('soap');
const config = require('./config');
const soapService = require('./soap-service');
const wsdl = require('./wsdl');
const setupRoutes = require('./routes');

const app = express();

// Middleware
app.use(express.raw({ type: () => true, limit: '5mb' }));

// Setup web interface routes
setupRoutes(app);

// SOAP endpoint
app.post('/wsdl', (req, res) => {
  res.set('Content-Type', 'text/xml');
  soap.listen(app, '/wsdl', soapService, wsdl);
});

// Start server
app.listen(config.port, () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🚀 QuickBooks Web Connector Server Started!');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`\n📍 Web Interface: http://localhost:${config.port}`);
  console.log(`📍 WSDL URL: http://localhost:${config.port}/wsdl`);
  console.log(`📥 Download QWC: http://localhost:${config.port}/generate-qwc`);
  console.log(`\n⚙️  Configuration:`);
  console.log(`   Username: ${config.username}`);
  console.log(`   Password: ${config.password}`);
  console.log(`   Server URL: ${config.serverURL}`);
  console.log(`   Port: ${config.port}`);
  console.log('\n⚠️  IMPORTANT: Update serverURL in config.js to your VPS IP/domain!');
  console.log('═══════════════════════════════════════════════════════\n');
});