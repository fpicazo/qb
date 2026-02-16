// routes.js - Web interface routes

const { v4: uuidv4 } = require('uuid');
const { parseString } = require('xml2js');
const config = require('./config');

// Setup routes
function setupRoutes(app) {
  function getQbConnectionStatus() {
    const { getConnectionStatus } = require('./qbwcService');
    return getConnectionStatus();
  }

  function queueJobWithConnectionGuard(job) {
    const rejectWhenOffline = config?.connection?.rejectNewJobsWhenOffline !== false;
    const connection = getQbConnectionStatus();

    if (rejectWhenOffline && !connection.allowNewJobs) {
      return { accepted: false, connection };
    }

    const { addJob } = require('./queue');
    const queuedJob = addJob(job);
    return { accepted: true, queuedJob, connection };
  }

  function toArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  function parseItemGroupProducts(rawXml) {
    return new Promise((resolve, reject) => {
      parseString(rawXml, { explicitArray: false }, (err, result) => {
        if (err) return reject(err);

        const rs = result?.QBXML?.QBXMLMsgsRs?.ItemQueryRs || {};
        const groups = toArray(rs.ItemGroupRet);

        if (groups.length === 0) {
          return resolve({
            groupCount: 0,
            groups: [],
            products: []
          });
        }

        const normalizedGroups = groups.map((group) => {
          const lines = toArray(group.ItemGroupLineRet || group.ItemGroupLine).map((line) => ({
            itemId: line?.ItemRef?.ListID || null,
            name: line?.ItemRef?.FullName || line?.ItemRef?.Name || null,
            quantity: line?.Quantity !== undefined ? Number(line.Quantity) : null
          }));

          return {
            itemId: group.ListID || null,
            fullName: group.FullName || null,
            name: group.Name || null,
            products: lines
          };
        });

        return resolve({
          groupCount: normalizedGroups.length,
          groups: normalizedGroups,
          products: normalizedGroups[0]?.products || []
        });
      });
    });
  }
  
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
      const { maxReturned, name, nameFilter } = req.body || {};
      
      // Queue customer query job and get job object
      const queued = queueJobWithConnectionGuard({
        type: 'CustomerQuery',
        payload: {
          maxReturned: maxReturned || 100,
          name: name || null,
          nameFilter: nameFilter || null
        }
      });

      if (!queued.accepted) {
        return res.status(503).json({
          success: false,
          error: `QuickBooks has been offline for more than ${queued.connection.offlineCutoffMinutes} minutes. Job not queued.`,
          quickbooks: queued.connection
        });
      }

      const job = queued.queuedJob;
      res.json({
        success: true,
        jobId: job.id,
        message: 'Customer fetch job queued',
        filters: {
          maxReturned: maxReturned || 100,
          name: name || null,
          nameFilter: nameFilter || null
        },
        instruction: `Check /api/queue with jobId: ${job.id} to get results when done`
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

// ==========ITEMS ==========
  app.post('/api/items/query', (req, res) => {
  try {
    const { maxReturned, name, nameFilter } = req.body || {};
    const normalizedName = typeof name === 'string'
      ? name
          .replace(/\u00A0/g, ' ')
          .replace(/[\u200B-\u200D\uFEFF]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
      : name;
    
    // Build payload
    const payload = {
      maxReturned: maxReturned || 100
    };
    
    // Auto search strategy: exact first, then contains fallback if exact returns no rows
    if (normalizedName && !nameFilter) {
      const primaryToken = normalizedName.includes(',')
        ? normalizedName.split(',')[0].trim()
        : null;
      payload.autoTryExactContains = true;
      payload.searchTerm = normalizedName;
      payload.searchPrimaryToken = primaryToken || null;
      payload.searchAttempt = 'exact';
    } else if (normalizedName) {
      payload.name = normalizedName;
    }

    // Add pattern-based name filter if provided
    if (nameFilter) {
      payload.nameFilter = nameFilter;
    }
    
    // Queue the query job and get job object
    const queued = queueJobWithConnectionGuard({
      type: 'ItemQuery',
      payload
    });
    if (!queued.accepted) {
      return res.status(503).json({
        success: false,
        error: `QuickBooks has been offline for more than ${queued.connection.offlineCutoffMinutes} minutes. Job not queued.`,
        quickbooks: queued.connection
      });
    }
    const job = queued.queuedJob;
    res.json({ 
      success: true, 
      jobId: job.id,
      message: 'Item query job queued',
      filters: payload,
      note: payload.autoTryExactContains
        ? 'Auto strategy enabled: exact search first, then contains fallback(s) if exact has no results.'
        : 'Check /api/queue for results after QBWC processes'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/items/group-products/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!itemId) {
      return res.status(400).json({ error: 'itemId is required in route param' });
    }

    const { _queue } = require('./queue');

    const sameItemJobs = _queue
      .filter((job) => job.type === 'ItemGroupProductsQuery' && String(job?.payload?.itemId) === String(itemId))
      .sort((a, b) => Number(b.id) - Number(a.id));

    const existingDone = sameItemJobs.find((job) => job.status === 'done' && job?.result?.raw);
    if (existingDone) {
      const parsed = await parseItemGroupProducts(existingDone.result.raw);
      return res.json({
        success: true,
        source: 'cache',
        jobId: existingDone.id,
        itemId,
        ...parsed
      });
    }

    const existingRunning = sameItemJobs.find((job) => job.status === 'pending' || job.status === 'processing');
    if (existingRunning) {
      return res.status(202).json({
        success: true,
        itemId,
        jobId: existingRunning.id,
        status: existingRunning.status,
        message: 'A group-product query for this item is already in progress.',
        instruction: `Check /api/queue with jobId: ${existingRunning.id}`
      });
    }

    const queued = queueJobWithConnectionGuard({
      type: 'ItemGroupProductsQuery',
      payload: { itemId }
    });

    if (!queued.accepted) {
      return res.status(503).json({
        success: false,
        error: `QuickBooks has been offline for more than ${queued.connection.offlineCutoffMinutes} minutes. Job not queued.`,
        quickbooks: queued.connection
      });
    }

    const job = queued.queuedJob;
    return res.status(202).json({
      success: true,
      itemId,
      jobId: job.id,
      status: job.status,
      message: 'Item group product query job queued.',
      instruction: `Re-call GET /api/items/group-products/${encodeURIComponent(itemId)} after QBWC syncs, or check /api/queue with jobId: ${job.id}`
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/items', (req, res) => {
  try {
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
    
    // Queue the job and get job object
    const queued = queueJobWithConnectionGuard({
      type: 'ItemAdd',
      payload: {
        type,
        name,
        description,
        price,
        account  // Add account support
      }
    });
    if (!queued.accepted) {
      return res.status(503).json({
        success: false,
        error: `QuickBooks has been offline for more than ${queued.connection.offlineCutoffMinutes} minutes. Job not queued.`,
        quickbooks: queued.connection
      });
    }
    const job = queued.queuedJob;
    res.json({ 
      success: true, 
      jobId: job.id,
      message: `Item add job queued for: ${name}`,
      itemType: type
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/customers', (req, res) => {
  try {
    const { fullName, email, phone } = req.body;
    
    if (!fullName) {
      return res.status(400).json({ error: 'fullName is required' });
    }
    
    const queued = queueJobWithConnectionGuard({
      type: 'CustomerAdd',
      payload: { fullName, email: email || '', phone: phone || '' }
    });
    if (!queued.accepted) {
      return res.status(503).json({
        success: false,
        error: `QuickBooks has been offline for more than ${queued.connection.offlineCutoffMinutes} minutes. Job not queued.`,
        quickbooks: queued.connection
      });
    }
    const job = queued.queuedJob;
    res.json({ success: true, jobId: job.id, message: 'Customer add job queued' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/invoices/query', (req, res) => {
  try {
    // Parameters
    let timeline = req.body?.timeline || 'last-hour';
    let page = parseInt(req.body?.page) || 1;
    let maxReturned = parseInt(req.body?.maxReturned) || 30;
    
    // QB Limitation: Max 30 per request
    if (maxReturned > 30) {
      maxReturned = 30;
    }
    
    // Validate page
    if (page < 1) {
      page = 1;
    }
    
    const queued = queueJobWithConnectionGuard({
      type: 'InvoiceQuery',
      payload: {
        maxReturned: maxReturned,
        depositToAccountName: null,
        customerName: null,
        dateRangePreset: timeline,
        txnDateStart: null,
        txnDateEnd: null,
        page: page
      }
    });
    if (!queued.accepted) {
      return res.status(503).json({
        success: false,
        error: `QuickBooks has been offline for more than ${queued.connection.offlineCutoffMinutes} minutes. Job not queued.`,
        quickbooks: queued.connection
      });
    }
    const job = queued.queuedJob;
    res.json({
      success: true,
      jobId: job.id,
      message: `Invoice query queued for ${timeline} - page ${page}`,
      parameters: {
        timeline,
        page,
        maxPerPage: maxReturned,
        note: 'QB max is 30 invoices per request'
      },
      instruction: 'Check /api/queue for results after QBWC syncs',
      pagination: {
        currentPage: page,
        itemsPerPage: maxReturned,
        qbLimit: '30 invoices max per request',
        nextPageUrl: `https://infinitecapi.online/api/invoices/fetch?timeline=${timeline}&page=${page + 1}`
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/invoices', (req, res) => {
  try {
    const { customerId, txnDate, items, billTo, shipTo, memo } = req.body || {};
    
    // Validation
    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required (min 1)' });
    }
    
    // Validate items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (!item.itemId) {
        return res.status(400).json({ error: `Item ${i + 1}: itemId is required` });
      }
      
      if (item.quantity === undefined || item.quantity === null) {
        return res.status(400).json({ error: `Item ${i + 1}: quantity is required` });
      }
      
      if (item.rate === undefined || item.rate === null) {
        return res.status(400).json({ error: `Item ${i + 1}: rate is required` });
      }
    }
    
    // Convert quick format to full format
    const lineItems = items.map(item => ({
      item: {
        listId: item.itemId
      },
      description: item.description || '',
      quantity: item.quantity,
      rate: item.rate
    }));
    
    // Calculate total
    const total = lineItems.reduce((sum, line) => sum + (line.quantity * line.rate), 0);
    
    // Queue invoice add job
    const queued = queueJobWithConnectionGuard({
      type: 'InvoiceAdd',
      payload: {
        customer: {
          listId: customerId
        },
        txnDate: txnDate || null,
        refNumber: null,
        memo: memo || null,
        lineItems,
        billTo: billTo || null,
        shipTo: shipTo || null
      }
    });
    if (!queued.accepted) {
      return res.status(503).json({
        success: false,
        error: `QuickBooks has been offline for more than ${queued.connection.offlineCutoffMinutes} minutes. Job not queued.`,
        quickbooks: queued.connection
      });
    }
    const job = queued.queuedJob;
    res.json({
      success: true,
      jobId: job.id,
      message: 'Invoice quick create job queued',
      invoice: {
        customerId,
        txnDate: txnDate || 'Today',
        lineItems: lineItems.length,
        total: parseFloat(total.toFixed(2))
      },
      instruction: 'Check /api/queue for results after QBWC syncs'
    });
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

  app.get('/api/qb/connection-status', (req, res) => {
    try {
      const connection = getQbConnectionStatus();
      res.json({
        success: true,
        quickbooks: connection
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

module.exports = setupRoutes;
