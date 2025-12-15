// server.js - FIXED QuickBooks Web Connector Server
// Key fixes: Manual SOAP handling, proper middleware, dynamic tickets

const https = require('https');
const fs = require('fs');
const express = require('express');
const { parseString } = require('xml2js');
const { v4: uuidv4 } = require('uuid');

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

// ========== CERTIFICATE MANAGEMENT ==========
console.log('🔍 Checking SSL certificate files...\n');

const certPaths = {
  key: '/certs/privkey.pem',
  cert: '/certs/fullchain.pem'
};

let keyData, certData;

try {
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

  console.log('📖 Reading certificate files...\n');
  keyData = fs.readFileSync(certPaths.key, 'utf8');
  certData = fs.readFileSync(certPaths.cert, 'utf8');

  console.log(`   Key file size: ${keyData.length} bytes`);
  console.log(`   Cert file size: ${certData.length} bytes\n`);

  // Validate PEM format
  if (!keyData.includes('-----BEGIN') || !keyData.includes('-----END')) {
    throw new Error('Private key is missing PEM headers');
  }
  console.log('   ✅ Private key has valid PEM format');

  if (!certData.includes('-----BEGIN CERTIFICATE-----') || !certData.includes('-----END CERTIFICATE-----')) {
    throw new Error('Certificate is missing PEM headers');
  }
  console.log('   ✅ Certificate has valid PEM format\n');

} catch (err) {
  console.error('❌ Certificate validation error:', err.message);
  process.exit(1);
}

// ========== MIDDLEWARE - FIX: Use text, not raw! ==========
app.use(express.text({ type: 'text/xml' }));
app.use(express.text({ type: 'application/xml' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== SERVICE STATE ==========
let currentTicket = null;
let lastError = '';

// ========== WSDL DEFINITION - Embedded ==========
const wsdlXml = `<?xml version="1.0" encoding="UTF-8"?>
<definitions name="QBWebConnectorSvc"
             targetNamespace="http://developer.intuit.com/"
             xmlns:tns="http://developer.intuit.com/"
             xmlns:xsd="http://www.w3.org/2001/XMLSchema"
             xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
             xmlns="http://schemas.xmlsoap.org/wsdl/">

  <message name="authenticateRequest">
    <part name="strUserName" type="xsd:string"/>
    <part name="strPassword" type="xsd:string"/>
  </message>
  <message name="authenticateResponse">
    <part name="authenticateResult" type="xsd:string" maxOccurs="unbounded"/>
  </message>

  <message name="clientVersionRequest">
    <part name="strVersion" type="xsd:string"/>
  </message>
  <message name="clientVersionResponse">
    <part name="clientVersionResult" type="xsd:string"/>
  </message>

  <message name="serverVersionRequest"/>
  <message name="serverVersionResponse">
    <part name="serverVersionResult" type="xsd:string"/>
  </message>

  <message name="sendRequestXMLRequest">
    <part name="ticket" type="xsd:string"/>
    <part name="strHCPResponse" type="xsd:string"/>
    <part name="strCompanyFileName" type="xsd:string"/>
    <part name="qbXMLCountry" type="xsd:string"/>
    <part name="qbXMLMajorVers" type="xsd:int"/>
    <part name="qbXMLMinorVers" type="xsd:int"/>
  </message>
  <message name="sendRequestXMLResponse">
    <part name="sendRequestXMLResult" type="xsd:string"/>
  </message>

  <message name="receiveResponseXMLRequest">
    <part name="ticket" type="xsd:string"/>
    <part name="response" type="xsd:string"/>
    <part name="hresult" type="xsd:string"/>
    <part name="message" type="xsd:string"/>
  </message>
  <message name="receiveResponseXMLResponse">
    <part name="receiveResponseXMLResult" type="xsd:string"/>
  </message>

  <message name="getLastErrorRequest">
    <part name="ticket" type="xsd:string"/>
  </message>
  <message name="getLastErrorResponse">
    <part name="getLastErrorResult" type="xsd:string"/>
  </message>

  <message name="closeConnectionRequest">
    <part name="ticket" type="xsd:string"/>
  </message>
  <message name="closeConnectionResponse">
    <part name="closeConnectionResult" type="xsd:string"/>
  </message>

  <message name="connectionErrorRequest">
    <part name="ticket" type="xsd:string"/>
    <part name="hresult" type="xsd:string"/>
    <part name="message" type="xsd:string"/>
  </message>
  <message name="connectionErrorResponse">
    <part name="connectionErrorResult" type="xsd:string"/>
  </message>

  <portType name="QBWebConnectorSvcSoap">
    <operation name="authenticate">
      <input message="tns:authenticateRequest"/>
      <output message="tns:authenticateResponse"/>
    </operation>
    <operation name="clientVersion">
      <input message="tns:clientVersionRequest"/>
      <output message="tns:clientVersionResponse"/>
    </operation>
    <operation name="serverVersion">
      <input message="tns:serverVersionRequest"/>
      <output message="tns:serverVersionResponse"/>
    </operation>
    <operation name="sendRequestXML">
      <input message="tns:sendRequestXMLRequest"/>
      <output message="tns:sendRequestXMLResponse"/>
    </operation>
    <operation name="receiveResponseXML">
      <input message="tns:receiveResponseXMLRequest"/>
      <output message="tns:receiveResponseXMLResponse"/>
    </operation>
    <operation name="getLastError">
      <input message="tns:getLastErrorRequest"/>
      <output message="tns:getLastErrorResponse"/>
    </operation>
    <operation name="closeConnection">
      <input message="tns:closeConnectionRequest"/>
      <output message="tns:closeConnectionResponse"/>
    </operation>
    <operation name="connectionError">
      <input message="tns:connectionErrorRequest"/>
      <output message="tns:connectionErrorResponse"/>
    </operation>
  </portType>

  <binding name="QBWebConnectorSvcSoap" type="tns:QBWebConnectorSvcSoap">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="authenticate">
      <soap:operation soapAction="http://developer.intuit.com/authenticate"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="clientVersion">
      <soap:operation soapAction="http://developer.intuit.com/clientVersion"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="serverVersion">
      <soap:operation soapAction="http://developer.intuit.com/serverVersion"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="sendRequestXML">
      <soap:operation soapAction="http://developer.intuit.com/sendRequestXML"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="receiveResponseXML">
      <soap:operation soapAction="http://developer.intuit.com/receiveResponseXML"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="getLastError">
      <soap:operation soapAction="http://developer.intuit.com/getLastError"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="closeConnection">
      <soap:operation soapAction="http://developer.intuit.com/closeConnection"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="connectionError">
      <soap:operation soapAction="http://developer.intuit.com/connectionError"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>

  <service name="QBWebConnectorSvc">
    <port name="QBWebConnectorSvcSoap" binding="tns:QBWebConnectorSvcSoap">
      <soap:address location="${CONFIG.serverURL}/wsdl"/>
    </port>
  </service>
</definitions>`;

// ========== MANUAL SOAP HANDLER ==========
app.get('/wsdl', (req, res) => {
  if (req.query.wsdl !== undefined) {
    res.set('Content-Type', 'text/xml');
    return res.send(wsdlXml);
  }
  res.send('SOAP endpoint ready. Add ?wsdl to see WSDL.');
});

app.post('/wsdl', async (req, res) => {
  const soapRequest = req.body;
  
  console.log('\n' + '='.repeat(60));
  console.log('🟦 Incoming SOAP Request');
  console.log('='.repeat(60));
  console.log(soapRequest.substring(0, 500));

  parseString(soapRequest, { explicitArray: false }, (err, result) => {
    if (err) {
      console.error('❌ XML Parse Error:', err);
      return res.status(500).send(buildFaultResponse('Invalid XML'));
    }

    // Extract SOAP body
    let body;
    if (result['soap:Envelope']) {
      body = result['soap:Envelope']['soap:Body'];
    } else if (result['SOAP-ENV:Envelope']) {
      body = result['SOAP-ENV:Envelope']['SOAP-ENV:Body'];
    } else {
      return res.status(500).send(buildFaultResponse('Invalid SOAP Envelope'));
    }

    const methodName = Object.keys(body)[0];
    const params = body[methodName];

    console.log(`📞 Method: ${methodName}`);
    console.log(`📦 Params:`, JSON.stringify(params).substring(0, 200));

    let response;

    try {
      // FIX: Properly structured responses
      if (methodName === 'authenticate') {
        response = handleAuthenticate(params);
      } else if (methodName === 'clientVersion') {
        response = handleClientVersion(params);
      } else if (methodName === 'serverVersion') {
        response = handleServerVersion(params);
      } else if (methodName === 'sendRequestXML') {
        response = handleSendRequestXML(params);
      } else if (methodName === 'receiveResponseXML') {
        response = handleReceiveResponseXML(params);
      } else if (methodName === 'getLastError') {
        response = handleGetLastError(params);
      } else if (methodName === 'closeConnection') {
        response = handleCloseConnection(params);
      } else if (methodName === 'connectionError') {
        response = handleConnectionError(params);
      } else {
        response = buildFaultResponse('Unknown method: ' + methodName);
      }

      console.log('='.repeat(60));
      console.log('🟩 SOAP Response');
      console.log('='.repeat(60));
      console.log(response.substring(0, 300));
      console.log('='.repeat(60) + '\n');

      res.set('Content-Type', 'text/xml; charset=utf-8');
      res.send(response);
    } catch (error) {
      console.error('❌ Error:', error);
      res.status(500).send(buildFaultResponse(error.message));
    }
  });
});

// ========== HANDLER FUNCTIONS ==========

function handleAuthenticate(params) {
  console.log('🔐 Authenticate called');
  const username = params.strUserName || '';
  const password = params.strPassword || '';

  if (username === CONFIG.username && password === CONFIG.password) {
    currentTicket = `ticket_${Date.now()}_${uuidv4()}`;
    console.log('✅ Auth success, ticket:', currentTicket);
    return buildAuthenticateResponse(currentTicket, '');
  }

  console.log('❌ Invalid credentials');
  return buildAuthenticateResponse('nvu', '');
}

function handleClientVersion(params) {
  console.log('📱 Client version:', params.strVersion);
  return buildSimpleResponse('clientVersion', '');
}

function handleServerVersion(params) {
  console.log('🖥️  Server version requested');
  return buildSimpleResponse('serverVersion', '1.0.0');
}

function handleSendRequestXML(params) {
  console.log('📤 sendRequestXML called');
  console.log('   Ticket:', params.ticket);

  lastError = '';

  if (params.ticket !== currentTicket) {
    console.error('❌ Invalid ticket');
    return buildSimpleResponse('sendRequestXML', '');
  }

  // For now, return empty (no jobs to process)
  // In production, queue jobs here
  console.log('✅ No pending jobs');
  return buildSimpleResponse('sendRequestXML', '');
}

function handleReceiveResponseXML(params) {
  console.log('📥 receiveResponseXML called');
  console.log('   HRESULT:', params.hresult || '(none)');
  console.log('   Message:', params.message || '(none)');

  if (params.hresult && String(params.hresult).trim() !== '') {
    lastError = `QB Error ${params.hresult}: ${params.message || 'Unknown'}`;
    console.error('❌', lastError);
  } else {
    console.log('✅ Response received successfully');
  }

  return buildSimpleResponse('receiveResponseXML', '100');
}

function handleGetLastError(params) {
  console.log('🔍 getLastError called');
  return buildSimpleResponse('getLastError', lastError || '');
}

function handleCloseConnection(params) {
  console.log('👋 closeConnection called');
  currentTicket = null;
  return buildSimpleResponse('closeConnection', 'OK');
}

function handleConnectionError(params) {
  lastError = `Connection error: ${params?.hresult || ''} ${params?.message || ''}`.trim();
  console.error('❌', lastError);
  return buildSimpleResponse('connectionError', 'done');
}

// ========== SOAP RESPONSE BUILDERS ==========

function buildAuthenticateResponse(ticket, companyFile) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <authenticateResponse xmlns="http://developer.intuit.com/">
      <authenticateResult>
        <string>${escapeXml(ticket)}</string>
        <string>${escapeXml(companyFile)}</string>
      </authenticateResult>
    </authenticateResponse>
  </soap:Body>
</soap:Envelope>`;
}

function buildSimpleResponse(methodName, result) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <${methodName}Response xmlns="http://developer.intuit.com/">
      <${methodName}Result>${escapeXml(result || '')}</${methodName}Result>
    </${methodName}Response>
  </soap:Body>
</soap:Envelope>`;
}

function buildFaultResponse(message) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Server</faultcode>
      <faultstring>${escapeXml(message)}</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ========== QWC GENERATION ==========
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

// ========== STATUS PAGE ==========
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
        <code>${CONFIG.serverURL}/wsdl?wsdl</code>
      </div>
      
      <div class="info">
        <strong>SOAP Endpoint:</strong><br>
        <code>${CONFIG.serverURL}/wsdl</code>
      </div>
    </body>
    </html>
  `);
});

// ========== START HTTPS SERVER ==========
console.log('🔐 Creating HTTPS server...\n');

const options = {
  key: keyData,
  cert: certData
};

try {
  const server = https.createServer(options, app);

  server.listen(CONFIG.port, () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 QB Web Connector Started Successfully');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📍 HTTPS URL: ${CONFIG.serverURL}`);
    console.log(`📥 QWC: ${CONFIG.serverURL}/generate-qwc`);
    console.log(`🔧 WSDL: ${CONFIG.serverURL}/wsdl?wsdl`);
    console.log(`📤 SOAP: ${CONFIG.serverURL}/wsdl`);
    console.log(`👤 User: ${CONFIG.username}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ Ready for QBWC connection!\n');
  });
} catch (err) {
  console.error('\n❌ HTTPS Server Creation Error:', err.message);
  process.exit(1);
}