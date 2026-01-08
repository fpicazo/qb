// server.js - FIXED QuickBooks Web Connector Server with full integration

const https = require('https');
const fs = require('fs');
const express = require('express');
const { parseString } = require('xml2js');
const { v4: uuidv4 } = require('uuid');

const app = express();

// ========== CONFIGURATION ==========
const CONFIG = {
  port: 8080,
  username: 'qbuser',
  password: 'qbpass',
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

// ========== MIDDLEWARE ==========
app.use(express.text({ type: 'text/xml' }));
app.use(express.text({ type: 'application/xml' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== SETUP ROUTES ==========
const setupRoutes = require('./routes');
setupRoutes(app);

// ========== WSDL DEFINITION ==========
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

    // Only log if not a closeConnection with ticket 'none'
    const isNoOpClose = methodName === 'closeConnection' && params && params.ticket === 'none';
    if (!isNoOpClose) {
      console.log(`📞 Method: ${methodName}`);
      console.log(`📦 Params:`, JSON.stringify(params).substring(0, 200));
    }

    let response;
    const { service } = require('./qbwcService');
    const svc = service.QBWebConnectorSvc.QBWebConnectorSvcSoap;

    try {
      if (methodName === 'authenticate') {
        const result = svc.authenticate(params);
        response = buildAuthenticateResponse(result.authenticateResult.string);
      } else if (methodName === 'clientVersion') {
        const result = svc.clientVersion(params);
        response = buildSimpleResponse('clientVersion', result.clientVersionResult);
      } else if (methodName === 'serverVersion') {
        const result = svc.serverVersion(params);
        response = buildSimpleResponse('serverVersion', result.serverVersionResult);
      } else if (methodName === 'sendRequestXML') {
        const result = svc.sendRequestXML(params);
        // Log the raw QBXML string returned by the service for inspection
        try {
          console.log('🔎 Raw sendRequestXMLResult (first 2000 chars):');
          console.log(String(result.sendRequestXMLResult || '').substring(0, 2000));
        } catch (e) {
          console.error('❌ Failed to log raw sendRequestXMLResult:', e);
        }

        response = buildSimpleResponse('sendRequestXML', result.sendRequestXMLResult);
      } else if (methodName === 'receiveResponseXML') {
        const result = svc.receiveResponseXML(params);
        response = buildSimpleResponse('receiveResponseXML', result.receiveResponseXMLResult);
      } else if (methodName === 'getLastError') {
        const result = svc.getLastError(params);
        response = buildSimpleResponse('getLastError', result.getLastErrorResult);
      } else if (methodName === 'closeConnection') {
        const result = svc.closeConnection(params);
        response = buildSimpleResponse('closeConnection', result.closeConnectionResult);
      } else if (methodName === 'connectionError') {
        const result = svc.connectionError(params);
        response = buildSimpleResponse('connectionError', result.connectionErrorResult);
      } else {
        response = buildFaultResponse('Unknown method: ' + methodName);
      }

      // Only log SOAP response if not a no-op closeConnection
      if (!isNoOpClose) {
        console.log('='.repeat(60));
        console.log('🟩 SOAP Response');
        console.log('='.repeat(60));
        console.log(response.substring(0, 300));
        console.log('='.repeat(60) + '\n');
      }

      res.set('Content-Type', 'text/xml; charset=utf-8');
      res.send(response);
    } catch (error) {
      console.error('❌ Error:', error);
      res.status(500).send(buildFaultResponse(error.message));
    }
  });
});

// ========== SOAP RESPONSE BUILDERS ==========

function buildAuthenticateResponse(resultArray) {
  const [ticket, companyFile] = resultArray;
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
  // For sendRequestXML, the QBWC expects the QBXML embedded as a string
  // inside <sendRequestXMLResult> (escaped as XML entities). Use
  // escapeXml so the payload is sent as a string value.
  if (methodName === 'sendRequestXML') {
    return `<?xml version="1.0" encoding="utf-8"?>\n<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">\n  <soap:Body>\n    <sendRequestXMLResponse xmlns="http://developer.intuit.com/">\n      <sendRequestXMLResult>${escapeXml(result || '')}</sendRequestXMLResult>\n    </sendRequestXMLResponse>\n  </soap:Body>\n</soap:Envelope>`;
  }

  // Default: escape result for other methods
  return `<?xml version="1.0" encoding="utf-8"?>\n<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">\n  <soap:Body>\n    <${methodName}Response xmlns="http://developer.intuit.com/">\n      <${methodName}Result>${escapeXml(result || '')}</${methodName}Result>\n    </${methodName}Response>\n  </soap:Body>\n</soap:Envelope>`;
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
    console.log('📡 API Endpoints:');
    console.log('   POST /api/customers/fetch - Queue customer fetch');
    console.log('   GET  /api/queue           - View queue status\n');
  });
} catch (err) {
  console.error('\n❌ HTTPS Server Creation Error:', err.message);
  process.exit(1);
}