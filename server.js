// server.js - Fixed QuickBooks Web Connector Server with Debugging

const https = require('https');
const fs = require('fs');
const express = require('express');
const soap = require('soap');

let uuidv4; // Will be loaded dynamically

(async () => {
  const uuid = await import('uuid');
  uuidv4 = uuid.v4;
})();

const app = express();

// Configuration
const CONFIG = {
  port: 8080,
  username: 'qbuser',
  password: 'qbpass123',
  appName: 'QB Data Sync',
  serverURL: 'https://infinitecapi.online'
};

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔧 INITIALIZING QB WEB CONNECTOR');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// DEBUGGING: Check certificate files
console.log('🔍 Checking SSL certificate files...\n');

const certPaths = {
  key: '/certs/privkey.pem',
  cert: '/certs/fullchain.pem'
};

let keyData, certData;

try {
  // Check if files exist
  console.log(`📁 Checking: ${certPaths.key}`);
  if (!fs.existsSync(certPaths.key)) {
    throw new Error(`Private key file not found: ${certPaths.key}`);
  }
  console.log('   ✅ File exists');

  console.log(`📁 Checking: ${certPaths.cert}`);
  if (!fs.existsSync(certPaths.cert)) {
    throw new Error(`Certificate file not found: ${certPaths.cert}`);
  }
  console.log('   ✅ File exists\n');

  // Read files
  console.log('📖 Reading certificate files...\n');
  
  keyData = fs.readFileSync(certPaths.key, 'utf8');
  certData = fs.readFileSync(certPaths.cert, 'utf8');

  console.log(`   Key file size: ${keyData.length} bytes`);
  console.log(`   Cert file size: ${certData.length} bytes\n`);

  // Validate PEM format
  console.log('✔️  Validating PEM format...\n');

  if (!keyData.includes('-----BEGIN') || !keyData.includes('-----END')) {
    throw new Error('Private key is missing PEM headers (-----BEGIN/-----END)');
  }
  console.log('   ✅ Private key has valid PEM format');

  if (!certData.includes('-----BEGIN CERTIFICATE-----') || !certData.includes('-----END CERTIFICATE-----')) {
    throw new Error('Certificate is missing PEM headers (-----BEGIN/-----END CERTIFICATE-----)');
  }
  console.log('   ✅ Certificate has valid PEM format\n');

  // Check for blank lines
  const keyLines = keyData.split('\n').filter(line => line.trim() !== '');
  const certLines = certData.split('\n').filter(line => line.trim() !== '');
  
  console.log(`   Private key lines (non-empty): ${keyLines.length}`);
  console.log(`   Certificate lines (non-empty): ${certLines.length}\n`);

  // Show first and last lines
  console.log('   First line of key:', keyLines[0]);
  console.log('   Last line of key:', keyLines[keyLines.length - 1]);
  console.log('   First line of cert:', certLines[0]);
  console.log('   Last line of cert:', certLines[certLines.length - 1] + '\n');

} catch (err) {
  console.error('❌ Certificate validation error:', err.message);
  console.error('\n⚠️  CERTIFICATE PROBLEM DETECTED');
  console.error('Please check:');
  console.error('1. Files exist at /certs/privkey.pem and /certs/fullchain.pem');
  console.error('2. Certificate has no extra blank lines');
  console.error('3. Private key matches the certificate');
  process.exit(1);
}

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
      <div class="status">✓ Server Running on HTTPS</div>
      
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
console.log('🔐 Creating HTTPS server...\n');

const options = {
  key: keyData,
  cert: certData
};

try {
  const server = https.createServer(options, app);

  server.listen(CONFIG.port, async () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 QB Web Connector Started Successfully');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📍 HTTPS URL: ${CONFIG.serverURL}`);
    console.log(`📥 QWC: ${CONFIG.serverURL}/generate-qwc`);
    console.log(`🔧 WSDL: ${CONFIG.serverURL}/wsdl`);
    console.log(`👤 User: ${CONFIG.username}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    try {
      soap.listen(server, '/wsdl', service, wsdl);
      console.log('✓ SOAP server initialized\n');
    } catch (err) {
      console.error('✗ SOAP initialization error:', err.message);
    }
  });
} catch (err) {
  console.error('\n❌ HTTPS Server Creation Error:', err.message);
  console.error('Code:', err.code);
  console.error('\n⚠️  TROUBLESHOOTING:');
  
  if (err.code === 'ERR_OSSL_PEM_BAD_END_LINE') {
    console.error('  → Certificate has bad line endings');
    console.error('  → Run: dos2unix /opt/ssl/infinitecapi/*.pem');
  } else if (err.code === 'ERR_OSSL_X509_KEY_VALUES_MISMATCH') {
    console.error('  → Private key does NOT match the certificate');
    console.error('  → Make sure privkey.pem is for infinitecapi.online certificate');
  }
  
  process.exit(1);
}