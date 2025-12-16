// routes.js - Web interface routes

const { v4: uuidv4 } = require('uuid');
const config = require('./config');

// Setup routes
function setupRoutes(app) {
  
  // Home page - Web interface
  app.get('/', (req, res) => {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>QuickBooks Web Connector</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 10px;
        }
        h2 {
            color: #34495e;
            margin-top: 30px;
        }
        .status {
            background: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
        }
        .button {
            display: inline-block;
            background: #3498db;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 4px;
            margin: 10px 10px 10px 0;
            font-weight: bold;
        }
        .button:hover {
            background: #2980b9;
        }
        .button.secondary {
            background: #95a5a6;
        }
        .button.secondary:hover {
            background: #7f8c8d;
        }
        .info-box {
            background: #f8f9fa;
            border-left: 4px solid #3498db;
            padding: 15px;
            margin: 20px 0;
        }
        .info-box code {
            background: #e9ecef;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: monospace;
        }
        .warning {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        table td {
            padding: 10px;
            border-bottom: 1px solid #dee2e6;
        }
        table td:first-child {
            font-weight: bold;
            width: 200px;
            color: #495057;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔗 QuickBooks Web Connector</h1>
        
        <div class="status">
            ✅ Server is running successfully!
        </div>

        <h2>📥 Quick Actions</h2>
        <a href="/generate-qwc" class="button" download>Download QWC File</a>
        <a href="/wsdl" class="button secondary" target="_blank">View WSDL</a>

        <h2>⚙️ Current Configuration</h2>
        <table>
            <tr>
                <td>App Name:</td>
                <td>${config.appName}</td>
            </tr>
            <tr>
                <td>Server URL:</td>
                <td><code>${config.serverURL}/wsdl</code></td>
            </tr>
            <tr>
                <td>Username:</td>
                <td><code>${config.username}</code></td>
            </tr>
            <tr>
                <td>Password:</td>
                <td><code>${config.password}</code></td>
            </tr>
            <tr>
                <td>Company File:</td>
                <td>${config.companyFile || '(Use currently open file)'}</td>
            </tr>
            <tr>
                <td>Update Frequency:</td>
                <td>Every ${config.scheduler.runEveryMinutes} minutes</td>
            </tr>
        </table>

        <div class="warning">
            <strong>⚠️ Important:</strong> Make sure to update <code>serverURL</code> in <code>config.js</code> to your actual VPS IP or domain before generating the QWC file!
        </div>

        <h2>📋 Setup Instructions</h2>
        <div class="info-box">
            <h3>For Server Management Company (RDP Server):</h3>
            <ol>
                <li>Click "Download QWC File" button above</li>
                <li>Copy the downloaded <code>quickbooks-connector.qwc</code> to the RDP server</li>
                <li>Open QuickBooks Web Connector</li>
                <li>Click "Add an application" and select the QWC file</li>
                <li>Enter password: <code>${config.password}</code></li>
                <li>Click "Update Selected" to test connection</li>
            </ol>
        </div>

        <h2>🔍 Testing</h2>
        <div class="info-box">
            <p>To verify the WSDL is accessible from the QuickBooks server, have them visit:</p>
            <code>${config.serverURL}/wsdl</code>
            <p style="margin-top: 10px;">They should see XML content if the connection is working.</p>
        </div>

        <h2>📡 API Endpoints</h2>
        <div class="info-box">
            <h3>Fetch Customers:</h3>
            <code>POST /api/customers/fetch</code>
            <p style="margin-top: 10px;">Request body (optional):</p>
            <pre>{
  "maxReturned": 100,
  "name": "John Doe",
  "nameFilter": {
    "name": "Acme",
    "matchCriterion": "StartsWith"
  }
}</pre>
            <p>Response will contain jobId to check results in queue</p>
        </div>

        <h2>📊 Queue Status</h2>
        <div class="info-box">
            <code>GET /api/queue</code>
            <p style="margin-top: 10px;">View all jobs and their results</p>
        </div>
    </div>
</body>
</html>
    `;
    res.send(html);
  });

  // Generate and download QWC file
  app.get('/generate-qwc', (req, res) => {
    const fileID = uuidv4();
    const ownerID = uuidv4();
    
    const qwcContent = `<?xml version="1.0"?>
<QBWCXML>
  <AppName>${config.appName}</AppName>
  <AppID></AppID>
  <AppURL>${config.serverURL}/wsdl</AppURL>
  <AppDescription>${config.appDescription}</AppDescription>
  <AppSupport>${config.appSupport}</AppSupport>
  <UserName>${config.username}</UserName>
  <OwnerID>{${ownerID}}</OwnerID>
  <FileID>{${fileID}}</FileID>
  <QBType>QBFS</QBType>
  <Scheduler>
    <RunEveryNMinutes>${config.scheduler.runEveryMinutes}</RunEveryNMinutes>
  </Scheduler>
  <IsReadOnly>false</IsReadOnly>
</QBWCXML>`;

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', 'attachment; filename="quickbooks-connector.qwc"');
    res.send(qwcContent);
    
    console.log('QWC file generated and downloaded');
  });

  // ========== FETCH CUSTOMERS ENDPOINT ==========
  app.post('/api/customers/query', (req, res) => {
    try {
      const { addJob, _queue } = require('./queue');
      const { maxReturned, name, nameFilter } = req.body || {};
      
      // Queue customer query job
      addJob({
        type: 'CustomerQuery',
        payload: {
          maxReturned: maxReturned || 100,
          name: name || null,
          nameFilter: nameFilter || null
        }
      });
      
      // Get the job ID (last job added)
      const jobId = _queue[_queue.length - 1].id;
      
      res.json({
        success: true,
        jobId: jobId,
        message: 'Customer fetch job queued',
        filters: {
          maxReturned: maxReturned || 100,
          name: name || null,
          nameFilter: nameFilter || null
        },
        instruction: `Check /api/queue with jobId: ${jobId} to get results when done`
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

// ==========ITEMS ==========
  app.post('/api/items/query', (req, res) => {
  try {
    const { addJob } = require('./queue');
    const { maxReturned, name, nameFilter } = req.body || {};
    
    // Build payload
    const payload = {
      maxReturned: maxReturned || 100
    };
    
    // Add exact name filter if provided
    if (name) {
      payload.name = name;
    }
    
    // Add pattern-based name filter if provided
    if (nameFilter) {
      payload.nameFilter = nameFilter;
    }
    
    // Queue the query job
    addJob({
      type: 'ItemQuery',
      payload
    });
    
    res.json({ 
      success: true, 
      message: 'Item query job queued',
      filters: payload,
      note: 'Check /api/queue for results after QBWC processes'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/items', (req, res) => {
  try {
    const { addJob } = require('./queue');
    const { type, name, description, price, account } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    
    if (!type) {
      return res.status(400).json({ error: 'type is required (Service, NonInventory, or Inventory)' });
    }
    
    // Validate type
    const validTypes = ['Service', 'NonInventory', 'Inventory'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ 
        error: `Invalid type. Must be one of: ${validTypes.join(', ')}` 
      });
    }
    
    // Queue the job
    addJob({
      type: 'ItemAdd',
      payload: {
        type,
        name,
        description,
        price,
        account  // Add account support
      }
    });
    
    res.json({ 
      success: true, 
      message: `Item add job queued for: ${name}`,
      itemType: type
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/customers', (req, res) => {
  try {
    const { addJob } = require('./queue');
    const { fullName, email, phone } = req.body;
    
    if (!fullName) {
      return res.status(400).json({ error: 'fullName is required' });
    }
    
    addJob({
      type: 'CustomerAdd',
      payload: { fullName, email: email || '', phone: phone || '' }
    });
    
    res.json({ success: true, message: 'Customer add job queued' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});





  // ========== QUEUE STATUS ENDPOINT ==========
  app.get('/api/queue', (req, res) => {
    try {
      const { _queue } = require('./queue');
      res.json({
        success: true,
        count: _queue.length,
        queue: _queue
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

module.exports = setupRoutes;