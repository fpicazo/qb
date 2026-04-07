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

  function collectItemQueryNodes(rs) {
    return [
      ['ItemServiceRet', toArray(rs.ItemServiceRet)],
      ['ItemNonInventoryRet', toArray(rs.ItemNonInventoryRet)],
      ['ItemInventoryRet', toArray(rs.ItemInventoryRet)],
      ['ItemOtherChargeRet', toArray(rs.ItemOtherChargeRet)],
      ['ItemDiscountRet', toArray(rs.ItemDiscountRet)],
      ['ItemPaymentRet', toArray(rs.ItemPaymentRet)],
      ['ItemSalesTaxRet', toArray(rs.ItemSalesTaxRet)],
      ['ItemSalesTaxGroupRet', toArray(rs.ItemSalesTaxGroupRet)],
      ['ItemFixedAssetRet', toArray(rs.ItemFixedAssetRet)],
      ['ItemSubtotalRet', toArray(rs.ItemSubtotalRet)],
      ['ItemGroupRet', toArray(rs.ItemGroupRet)],
      ['ItemInventoryAssemblyRet', toArray(rs.ItemInventoryAssemblyRet)]
    ].flatMap(([qbType, items]) => items.map((item) => ({ qbType, item })));
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

  function parseItemQueryResponse(rawXml) {
    return new Promise((resolve, reject) => {
      parseString(rawXml, { explicitArray: false }, (err, result) => {
        if (err) return reject(err);

        const rs = result?.QBXML?.QBXMLMsgsRs?.ItemQueryRs || {};
        const attrs = rs?.$ || {};
        const itemNodes = collectItemQueryNodes(rs);

        const items = itemNodes.map(({ qbType, item }) => ({
          listId: item?.ListID || null,
          name: item?.Name || null,
          fullName: item?.FullName || null,
          type: item?.Type || item?.SalesOrPurchase?.Desc || null,
          qbType,
          isGroup: qbType === 'ItemGroupRet',
          isActive: item?.IsActive !== undefined ? String(item.IsActive).toLowerCase() === 'true' : null,
          salesPrice: item?.SalesPrice !== undefined
            ? Number(item.SalesPrice)
            : item?.SalesOrPurchase?.Price !== undefined
              ? Number(item.SalesOrPurchase.Price)
              : null,
          salesDesc: item?.SalesDesc || item?.SalesOrPurchase?.Desc || null
        }));

        resolve({
          items,
          itemCount: items.length,
          pagination: {
            iteratorId: attrs.iteratorID || null,
            iteratorRemainingCount: attrs.iteratorRemainingCount !== undefined
              ? Number(attrs.iteratorRemainingCount)
              : null,
            hasMore: Number(attrs.iteratorRemainingCount || 0) > 0
          },
          status: {
            code: attrs.statusCode || null,
            severity: attrs.statusSeverity || null,
            message: attrs.statusMessage || null
          }
        });
      });
    });
  }

  function parseQueryCountResponse(rawXml, responseNodeName) {
    return new Promise((resolve, reject) => {
      parseString(rawXml, { explicitArray: false }, (err, result) => {
        if (err) return reject(err);

        const rs = result?.QBXML?.QBXMLMsgsRs?.[responseNodeName] || {};
        const attrs = rs?.$ || {};

        resolve({
          retCount: attrs.retCount !== undefined ? Number(attrs.retCount) : null,
          status: {
            code: attrs.statusCode || null,
            severity: attrs.statusSeverity || null,
            message: attrs.statusMessage || null
          }
        });
      });
    });
  }

  function parseInvoiceQueryResponse(rawXml) {
    return new Promise((resolve, reject) => {
      parseString(rawXml, { explicitArray: false }, (err, result) => {
        if (err) return reject(err);

        const rs = result?.QBXML?.QBXMLMsgsRs?.InvoiceQueryRs || {};
        const attrs = rs?.$ || {};
        const invoices = toArray(rs.InvoiceRet).map((invoice) => {
          const customerRef = invoice?.CustomerRef || {};
          const depositToAccountRef = invoice?.DepositToAccountRef || {};
          const lines = toArray(invoice?.InvoiceLineRet).map((line) => ({
            txnLineId: line?.TxnLineID || null,
            itemId: line?.ItemRef?.ListID || null,
            itemName: line?.ItemRef?.FullName || line?.ItemRef?.Name || null,
            description: line?.Desc || null,
            quantity: line?.Quantity !== undefined ? Number(line.Quantity) : null,
            rate: line?.Rate !== undefined ? Number(line.Rate) : null,
            amount: line?.Amount !== undefined ? Number(line.Amount) : null
          }));

          return {
            txnId: invoice?.TxnID || null,
            timeCreated: invoice?.TimeCreated || null,
            timeModified: invoice?.TimeModified || null,
            txnDate: invoice?.TxnDate || null,
            refNumber: invoice?.RefNumber || invoice?.DocNumber || null,
            customer: {
              listId: customerRef?.ListID || null,
              fullName: customerRef?.FullName || customerRef?.Name || null
            },
            memo: invoice?.Memo || null,
            subtotal: invoice?.Subtotal !== undefined ? Number(invoice.Subtotal) : null,
            tax: invoice?.Tax !== undefined ? Number(invoice.Tax) : null,
            total: invoice?.Total !== undefined ? Number(invoice.Total) : null,
            dueDate: invoice?.DueDate || null,
            depositToAccount: {
              listId: depositToAccountRef?.ListID || null,
              fullName: depositToAccountRef?.FullName || depositToAccountRef?.Name || null
            },
            lines
          };
        });

        resolve({
          invoices,
          invoiceCount: invoices.length,
          pagination: {
            iteratorId: attrs.iteratorID || null,
            iteratorRemainingCount: attrs.iteratorRemainingCount !== undefined
              ? Number(attrs.iteratorRemainingCount)
              : null,
            hasMore: Number(attrs.iteratorRemainingCount || 0) > 0
          },
          status: {
            code: attrs.statusCode || null,
            severity: attrs.statusSeverity || null,
            message: attrs.statusMessage || null
          }
        });
      });
    });
  }

  function getLastYearDateRange() {
    const now = new Date();
    const lastYear = now.getFullYear() - 1;

    return {
      year: lastYear,
      txnDateStart: `${lastYear}-01-01`,
      txnDateEnd: `${lastYear}-12-31`
    };
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

app.get('/api/items/all', (req, res) => {
  try {
    const requestedLimit = parseInt(req.query?.limit);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 100;
    const cursor = req.query?.cursor ? String(req.query.cursor) : null;
    const iteratorAction = cursor ? 'Continue' : 'Start';

    const queued = queueJobWithConnectionGuard({
      type: 'ItemQuery',
      payload: {
        maxReturned: limit,
        iteratorAction,
        iteratorId: cursor
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
      message: `Item fetch queued - ${iteratorAction === 'Continue' ? 'next page' : 'first page'}`,
      pagination: {
        limit,
        cursor,
        iteratorAction
      },
      instruction: 'Check /api/queue?jobId=<jobId> after QBWC syncs. Use result.parsed.pagination.iteratorId as the next cursor when hasMore is true.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/items/count/non-group', async (req, res) => {
  try {
    const sessionId = req.query?.sessionId ? String(req.query.sessionId) : null;
    const { _queue } = require('./queue');

    if (!sessionId) {
      const countSessionId = uuidv4();
      const queuedAllItems = queueJobWithConnectionGuard({
        type: 'ItemQuery',
        payload: {
          metaData: 'MetaDataOnly',
          countMode: 'all-items',
          countSessionId
        }
      });

      if (!queuedAllItems.accepted) {
        return res.status(503).json({
          success: false,
          error: `QuickBooks has been offline for more than ${queuedAllItems.connection.offlineCutoffMinutes} minutes. Job not queued.`,
          quickbooks: queuedAllItems.connection
        });
      }

      const queuedGroupItems = queueJobWithConnectionGuard({
        type: 'ItemGroupQuery',
        payload: {
          metaData: 'MetaDataOnly',
          countMode: 'group-items',
          countSessionId
        }
      });

      if (!queuedGroupItems.accepted) {
        return res.status(503).json({
          success: false,
          error: `QuickBooks has been offline for more than ${queuedGroupItems.connection.offlineCutoffMinutes} minutes. Group-count job not queued.`,
          quickbooks: queuedGroupItems.connection
        });
      }

      return res.status(202).json({
        success: true,
        sessionId: countSessionId,
        jobs: {
          allItemsJobId: queuedAllItems.queuedJob.id,
          groupItemsJobId: queuedGroupItems.queuedJob.id
        },
        status: 'pending',
        message: 'Non-group item count started.',
        note: 'This uses QuickBooks metadata counts and subtracts ItemGroup count from total item count.',
        instruction: `Re-call GET /api/items/count/non-group?sessionId=${encodeURIComponent(countSessionId)} after QBWC syncs, or check /api/queue with the returned job IDs`
      });
    }

    const sessionJobs = _queue
      .filter((job) => (
        (job.type === 'ItemQuery' || job.type === 'ItemGroupQuery') &&
        String(job?.payload?.countSessionId || '') === sessionId
      ))
      .sort((a, b) => Number(a.id) - Number(b.id));

    if (sessionJobs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Count session not found'
      });
    }

    const erroredJob = sessionJobs.find((job) => job.status === 'error');
    if (erroredJob) {
      return res.status(500).json({
        success: false,
        sessionId,
        jobId: erroredJob.id,
        status: erroredJob.status,
        error: erroredJob.error || 'Item count session failed'
      });
    }

    const activeJob = sessionJobs.find((job) => job.status === 'pending' || job.status === 'processing');
    if (activeJob) {
      return res.status(202).json({
        success: true,
        sessionId,
        jobId: activeJob.id,
        status: activeJob.status,
        message: 'Non-group item count is still in progress.',
        progress: {
          jobsTotal: sessionJobs.length,
          jobsCompleted: sessionJobs.filter((job) => job.status === 'done').length
        }
      });
    }

    const allItemsJob = sessionJobs.find((job) => job.type === 'ItemQuery' && job?.result?.raw);
    const groupItemsJob = sessionJobs.find((job) => job.type === 'ItemGroupQuery' && job?.result?.raw);

    if (!allItemsJob || !groupItemsJob) {
      return res.status(202).json({
        success: true,
        sessionId,
        status: 'waiting-for-results',
        message: 'Count session exists, but one or more count results are not available yet.'
      });
    }

    const allItemsCount = await parseQueryCountResponse(allItemsJob.result.raw, 'ItemQueryRs');
    const groupItemsCount = await parseQueryCountResponse(groupItemsJob.result.raw, 'ItemGroupQueryRs');
    const totalItemCount = Number(allItemsCount.retCount || 0);
    const totalGroupItemCount = Number(groupItemsCount.retCount || 0);
    const nonGroupItemCount = Math.max(0, totalItemCount - totalGroupItemCount);

    return res.json({
      success: true,
      sessionId,
      nonGroupItemCount,
      groupItemCount: totalGroupItemCount,
      totalItemsSeen: totalItemCount,
      completed: true,
      note: 'QuickBooks retCount metadata is documented as approximate, so this total may be slightly off.',
      jobs: {
        allItemsJobId: allItemsJob.id,
        groupItemsJobId: groupItemsJob.id
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
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
    let maxReturned = parseInt(req.body?.maxReturned) || 30;
    const cursor = req.body?.cursor ? String(req.body.cursor) : null;
    const iteratorAction = cursor ? 'Continue' : 'Start';
    
    // QB Limitation: Max 30 per request
    if (maxReturned > 30) {
      maxReturned = 30;
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
        iteratorAction,
        iteratorId: cursor
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
      message: `Invoice query queued for ${timeline} - ${iteratorAction === 'Continue' ? 'next page' : 'first page'}`,
      parameters: {
        timeline,
        cursor,
        iteratorAction,
        maxPerPage: maxReturned,
        note: 'QB max is 30 invoices per request'
      },
      instruction: 'Check /api/queue for results after QBWC syncs. Use the returned pagination.iteratorId as the next cursor.',
      pagination: {
        itemsPerPage: maxReturned,
        qbLimit: '30 invoices max per request',
        cursor
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

  app.get('/api/invoices/last-year', (req, res) => {
    try {
      const { year, txnDateStart, txnDateEnd } = getLastYearDateRange();
      const requestedLimit = parseInt(req.query?.limit);
      const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 30)
        : 30;
      const cursor = req.query?.cursor ? String(req.query.cursor) : null;
      const iteratorAction = cursor ? 'Continue' : 'Start';

      const queued = queueJobWithConnectionGuard({
        type: 'InvoiceQuery',
        payload: {
          maxReturned: limit,
          depositToAccountName: null,
          customerName: null,
          dateRangePreset: 'last-year',
          txnDateStart,
          txnDateEnd,
          iteratorAction,
          iteratorId: cursor
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
        message: `Last year invoice query queued for ${year} - ${iteratorAction === 'Continue' ? 'next page' : 'first page'}`,
        period: {
          year,
          txnDateStart,
          txnDateEnd
        },
        pagination: {
          limit,
          qbLimit: '30 invoices max per request',
          cursor,
          iteratorAction
        },
        instruction: 'Check /api/queue?jobId=<jobId> after QBWC syncs. Use result.parsed.pagination.iteratorId as the next cursor when hasMore is true.'
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/invoices', (req, res) => {
  try {
    const { customerId, txnDate, items, billTo, shipTo, memo, nonTaxable } = req.body || {};
    
    // Validation
    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required (min 1)' });
    }

    if (nonTaxable !== undefined && nonTaxable !== null && typeof nonTaxable !== 'boolean') {
      return res.status(400).json({ error: 'nonTaxable must be boolean when provided' });
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

      const rawTaxable = item.taxable !== undefined ? item.taxable : item.isTaxable;
      const taxableLooksValid =
        rawTaxable === undefined ||
        rawTaxable === null ||
        typeof rawTaxable === 'boolean' ||
        rawTaxable === 'true' ||
        rawTaxable === 'false' ||
        rawTaxable === '1' ||
        rawTaxable === '0' ||
        rawTaxable === 1 ||
        rawTaxable === 0;

      if (!taxableLooksValid) {
        return res.status(400).json({
          error: `Item ${i + 1}: taxable/isTaxable must be boolean (or 'true'/'false'/'1'/'0') when provided`
        });
      }

      const rawSalesTaxCode = item.salesTaxCode ?? item.taxCode ?? item.taxCodeName;
      if (rawSalesTaxCode !== undefined && rawSalesTaxCode !== null) {
        const isStringCode = typeof rawSalesTaxCode === 'string' && rawSalesTaxCode.trim() !== '';
        const isObjectCode = typeof rawSalesTaxCode === 'object' &&
          (rawSalesTaxCode.listId || rawSalesTaxCode.fullName);

        if (!isStringCode && !isObjectCode) {
          return res.status(400).json({
            error: `Item ${i + 1}: salesTaxCode/taxCode/taxCodeName must be a non-empty string or object with listId/fullName`
          });
        }
      }
    }
    
    // Convert quick format to full format
    const lineItems = items.map(item => ({
      // Accept common boolean representations from upstream systems
      item: {
        listId: item.itemId
      },
      description: item.description || '',
      quantity: item.quantity,
      rate: item.rate,
      taxable: (() => {
        const raw = item.taxable !== undefined ? item.taxable : item.isTaxable;
        if (raw === undefined || raw === null) {
          return nonTaxable === true ? false : undefined;
        }
        if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
        if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
        return undefined;
      })(),
      salesTaxCode: (() => {
        const raw = item.salesTaxCode ?? item.taxCode ?? item.taxCodeName;
        if (!raw) return null;
        if (typeof raw === 'string') return { fullName: raw.trim() };
        return raw;
      })()
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
      const jobId = req.query?.jobId ? String(req.query.jobId) : null;
      const requestId = req.query?.requestId ? String(req.query.requestId) : null;
      let resultQueue = _queue;

      if (jobId) {
        resultQueue = resultQueue.filter((job) => String(job.id) === jobId);
      }
      if (requestId) {
        // requestId aliases the existing queue job id
        resultQueue = resultQueue.filter((job) => String(job.id) === requestId);
      }

      Promise.all(resultQueue.map(async (job) => {
        if (job?.type === 'InvoiceQuery' && job?.status === 'done' && job?.result?.raw) {
          try {
            return {
              ...job,
              result: {
                ...job.result,
                parsed: await parseInvoiceQueryResponse(job.result.raw)
              }
            };
          } catch (parseError) {
            return {
              ...job,
              result: {
                ...job.result,
                parseError: parseError.message
              }
            };
          }
        }

        if (job?.type === 'ItemQuery' && job?.status === 'done' && job?.result?.raw) {
          try {
            return {
              ...job,
              result: {
                ...job.result,
                parsed: await parseItemQueryResponse(job.result.raw)
              }
            };
          } catch (parseError) {
            return {
              ...job,
              result: {
                ...job.result,
                parseError: parseError.message
              }
            };
          }
        }

        return job;
      })).then((queueWithParsedResults) => {
        res.json({
          success: true,
          count: queueWithParsedResults.length,
          filters: {
            jobId,
            requestId
          },
          queue: queueWithParsedResults
        });
      }).catch((error) => {
        res.status(500).json({ error: error.message });
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
