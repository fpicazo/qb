// server.js - Fixed QuickBooks Web Connector Server

const https = require('https');  // ← ADD THIS
const fs = require('fs');         // ← ADD THIS
const express = require('express');
const soap = require('soap');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Configuration
const CONFIG = {
  port: 8080,
  username: 'qbuser',
  password: 'qbpass123',
  appName: 'QB Data Sync',
  serverURL: 'https://infinitecapi.online'  // Remove 'www.' if not needed
};

// SOAP Service - QuickBooks Integration
const service = {
  QBWebConnectorSvc: {
    QBWebConnectorSvcSoap: {
      authenticate: function(args) {
        console.log('✓ Authenticate:', args.strUserName);
        if (args.strUserName === CONFIG.username && args.strPassword === CONFIG.password) {
          return { authenticateResult: ['SESSION_TICKET', ''] };
        }
        return { authenticateResult: ['nvu', ''] };
      },
      
      clientVersion: function(args) {
        return { clientVersionResult: '' };
      },
      
      sendRequestXML: function(args) {
        console.log('✓ Sending request to QuickBooks');
        const qbXML = `<?xml version="1.0" encoding="utf-8"?>
<?qbxml version="13.0"?>
<QBXML>
  <QBXMLMsgsRq onError="stopOnError">
    <HostQueryRq requestID="1"></HostQueryRq>
  </QBXMLMsgsRq>
</QBXML>`;
        return { sendRequestXMLResult: qbXML };
      },
      
      receiveResponseXML: function(args) {
        console.log('✓ Received response from QuickBooks');
        console.log(args.response);
        return { receiveResponseXMLResult: 100 };
      },
      
      connectionError: function(args) {
        console.log('✗ Connection error:', args);
        return { connectionErrorResult: 'done' };
      },
      
      getLastError: function(args) {
        return { getLastErrorResult: '' };
      },
      
      closeConnection: function(args) {
        console.log('✓ Connection closed');
        return { closeConnectionResult: 'OK' };
      }
    }
  }
};

// WSDL Definition
const wsdl = require('./wsdl');

// Middleware
app.use(express.raw({ type: () => true, limit: '5mb' }));

// Endpoint: Generate QWC File
app.get('/generate-qwc', (req, res) => {
  const qwcContent = `<?xml version="1.0"?>
<QBWCXML>
  <AppName>${CONFIG.appName}</AppName>
  <AppID></AppID>
  <AppURL>${CONFIG.serverURL}/wsdl</AppURL>
  <AppDescription>QuickBooks Data Synchronization</AppDescription>
  <AppSupport>https://infinitecapi.online/support</AppSupport>
  <UserName>${CONFIG.username}</UserName>
  <OwnerID>{${uuidv4()}}</OwnerID>
  <FileID>{${uuidv4()}}</FileID>
  <QBType>QBFS</QBType>
  <IsReadOnly>false</IsReadOnly>
</QBWCXML>`;

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', 'attachment; filename="quickbooks-connector.qwc"');
  res.send(qwcContent);
  console.log('✓ QWC file generated');
});

// Endpoint: Simple status page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>QB Web Connector</title>
      <style>
        body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; }
        .status { background: #d4edda; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .button { display: inline-block; background: #007bff; color: white; padding: 15px 30px; 
                  text-decoration: none; border-radius: 5px; font-weight: bold; }
        .info { background: #f8f9fa; padding: 15px; margin: 20px 0; border-left: 4px solid #007bff; }
        code { background: #e9ecef; padding: 3px 8px; border-radius: 3px; }
      </style>
    </head>
    <body>
      <h1>QuickBooks Web Connector</h1>
      <div class="status">✓ Server Running</div>
      
      <h3>Download QWC File:</h3>
      <a href="/generate-qwc" class="button">Download QWC</a>
      
      <div class="info">
        <strong>Credentials:</strong><br>
        Username: <code>${CONFIG.username}</code><br>
        Password: <code>${CONFIG.password}</code>
      </div>
      
      <div class="info">
        <strong>WSDL Endpoint:</strong><br>
        <code>${CONFIG.serverURL}/wsdl</code>
      </div>
    </body>
    </html>
  `);
});

// Create HTTPS server with Sectigo certificate
const options = {
  key: fs.readFileSync('/certs/privkey.pem'),
  cert: fs.readFileSync('/certs/fullchain.pem')
};

const server = https.createServer(options, app);

server.listen(CONFIG.port, async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 QB Web Connector Started');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 HTTPS URL: https://infinitecapi.online`);
  console.log(`📥 QWC: https://infinitecapi.online/generate-qwc`);
  console.log(`🔧 WSDL: https://infinitecapi.online/wsdl`);
  console.log(`👤 User: ${CONFIG.username}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    soap.listen(server, '/wsdl', service, wsdl);
    console.log('✓ SOAP server initialized');
  } catch (err) {
    console.error('✗ SOAP initialization error:', err.message);
  }
});