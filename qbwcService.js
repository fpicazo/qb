// qbwcService.js
const { customerAdd, customerQuery, itemAdd, itemQuery, invoiceAdd } = require('./qbxmlBuilders');
const { addJob, getNextPending, markDone, markError, _queue } = require('./queue');

// Track context per run
let lastJob = null;
let lastErrorMsg = '';
let currentTicket = null;

function hasPending() {
  return _queue.some(j => j.status === 'pending');
}

const service = {
  QBWebConnectorSvc: {
    QBWebConnectorSvcSoap: {
      // ---- Handshake ----
      authenticate(args) {
        console.log('🔐 Authenticate called');
        console.log('   Username:', args.strUserName);
        console.log('   Password:', args.strPassword);
        
        // Validate credentials
        if (args.strUserName !== 'qbwc_user' || args.strPassword !== 'password') {
          console.log('❌ Invalid credentials');
          return { authenticateResult: { string: ['nvu', ''] } };
        }
        
        // Process pending invoices BEFORE checking for jobs
        // This will queue validation jobs for any pending invoices
        try {
          invoiceProcessor.processPendingInvoices();
        } catch (e) {
          console.error('❌ Error processing pending invoices during auth:', e.message);
        }
        
        // Check if there are jobs to process
        if (!hasPending()) {
          console.log('⚠️  No pending jobs - returning "none"');
          return { authenticateResult: { string: ['none', ''] } };
        }
        
        // Generate ticket
        currentTicket = `ticket_${Date.now()}`;
        
        // OPTION 1: Empty string = use currently open company file (RECOMMENDED)
        const companyFile = '';
        
        // OPTION 2: If option 1 doesn't work, specify exact path:
        // const companyFile = 'C:\\Users\\Public\\Documents\\Intuit\\QuickBooks\\Company Files\\testing.qbw';
        
        console.log('✅ Auth success, ticket:', currentTicket);
        console.log('   Company file:', companyFile || '(use currently open)');
        
        return { 
          authenticateResult: {
            string: [currentTicket, companyFile]
          }
        };
      },

      clientVersion(args) {
        console.log('📱 Client version:', args.strVersion);
        // Return empty to accept any version
        return { clientVersionResult: '' };
      },

      serverVersion() {
        console.log('🖥️  Server version requested');
        return { serverVersionResult: '1.0.0' };
      },

      // ---- Work request ----
      sendRequestXML(args) {
        console.log('📤 sendRequestXML called');
        console.log('   Ticket:', args.ticket);
        console.log('   Company file:', args.strCompanyFileName || '(current)');
        console.log('   QB Version:', `${args.qbXMLMajorVers}.${args.qbXMLMinorVers}`);
        
        lastErrorMsg = '';

        // Validate ticket
        if (args.ticket !== currentTicket) {
          console.error('❌ Invalid ticket');
          return { sendRequestXMLResult: '' };
        }

        // Pull next job
        const job = getNextPending();
        lastJob = job || null;

        if (!job) {
          console.log('✅ No pending jobs');
          return { sendRequestXMLResult: '' };
        }

        console.log('🔧 Processing job:', job.type, '(ID:', job.id + ')');

        // Build QBXML
        try {
          let qbxml = '';
          
          if (job.type === 'CustomerAdd') {
            qbxml = customerAdd(job.payload);
            console.log('📝 CustomerAdd XML generated');
          } else if (job.type === 'CustomerQuery') {
            qbxml = customerQuery({
              maxReturned: job.payload.maxReturned || 100,
              name: job.payload.name,
              nameFilter: job.payload.nameFilter
            });
            console.log('📝 CustomerQuery XML generated');
          
          } else if (job.type === 'ItemAdd') {
            qbxml = itemAdd(job.payload);
            console.log('📝 ItemAdd XML generated');
          } else if (job.type === 'ItemQuery') {
            qbxml = itemQuery({
              maxReturned: job.payload.maxReturned || 100,
              name: job.payload.name,
              nameFilter: job.payload.nameFilter
            });
            console.log('📝 ItemQuery XML generated');
          } else if (job.type === 'InvoiceAdd') {
            qbxml = invoiceAdd(job.payload);
            console.log('📝 InvoiceAdd XML generated');
            console.log('   Customer:', job.payload.customer.listId || job.payload.customer.fullName);
            console.log('   Line items:', job.payload.lineItems.length);
          } else {
            lastErrorMsg = `Unknown job type: ${job.type}`;
            console.error('❌', lastErrorMsg);
            markError(job.id, lastErrorMsg);
            return { sendRequestXMLResult: '' };
          }

          // Log first 200 chars of XML for debugging
          console.log('📄 XML preview:', qbxml.substring(0, 200) + '...');
          return { sendRequestXMLResult: qbxml };
          
        } catch (e) {
          lastErrorMsg = `Builder error: ${e.message || e}`;
          console.error('❌', lastErrorMsg, e);
          if (job) markError(job.id, lastErrorMsg);
          return { sendRequestXMLResult: '' };
        }
      },

      // ---- QB response ----
      receiveResponseXML(args) {
        console.log('📥 receiveResponseXML called');
        console.log('   HRESULT:', args.hresult || '(none)');
        console.log('   Message:', args.message || '(none)');
        
        try {
          // Check for QB error
          if (args.hresult && String(args.hresult).trim() !== '') {
            lastErrorMsg = `QB Error ${args.hresult}: ${args.message || 'Unknown error'}`;
            console.error('❌', lastErrorMsg);
            if (lastJob) {
              markError(lastJob.id, lastErrorMsg);
              // Handle invoice processor callbacks for failures
              handleJobFailure(lastJob, lastErrorMsg);
            }
          } else {
            // Check for operation-level errors in XML response
            const xmlResponse = args.response || '';
            const hasError = xmlResponse.includes('statusSeverity="Error"');
            
            if (hasError) {
              // Extract error details from XML
              const statusCodeMatch = xmlResponse.match(/statusCode="(\d+)"/);
              const statusMessageMatch = xmlResponse.match(/statusMessage="([^"]+)"/);
              const statusCode = statusCodeMatch ? statusCodeMatch[1] : 'unknown';
              const statusMessage = statusMessageMatch ? statusMessageMatch[1] : 'Unknown error';
              
              lastErrorMsg = `QB Operation Error ${statusCode}: ${statusMessage}`;
              console.error('❌', lastErrorMsg);
              
              if (lastJob) {
                markError(lastJob.id, lastErrorMsg);
                handleJobFailure(lastJob, lastErrorMsg);
              }
            } else {
              // Success
              console.log('✅ Job completed:', lastJob?.id);
              if (lastJob) {
                markDone(lastJob.id, { raw: args.response });
                // Log response preview
                if (args.response) {
                  console.log('📄 Response preview:', args.response.substring(0, 200) + '...');
                }
                // Handle invoice processor callbacks for success
                handleJobSuccess(lastJob, args.response);
              }
            }
          }
        } catch (e) {
          lastErrorMsg = `receiveResponseXML error: ${e.message || e}`;
          console.error('❌', lastErrorMsg);
          if (lastJob) {
            markError(lastJob.id, lastErrorMsg);
            handleJobFailure(lastJob, lastErrorMsg);
          }
        }

        // Process pending invoices after each job completes
        try {
          invoiceProcessor.processPendingInvoices();
        } catch (e) {
          console.error('❌ Error processing pending invoices:', e.message);
        }

        // Return progress
        const more = hasPending();
        const progress = more ? '10' : '100';
        console.log(`📊 Progress: ${progress}% (${more ? 'more jobs pending' : 'all done'})`);
        
        return { receiveResponseXMLResult: progress };
      },

      // ---- Close connection ----
      closeConnection(args) {
        console.log('👋 closeConnection called');
        console.log('   Final message: Connection closed successfully');
        lastJob = null;
        currentTicket = null;
        return { closeConnectionResult: 'OK' };
      },

      // ---- Error handling ----
      getLastError(args) {
        console.log('🔍 getLastError called');
        console.log('   Error:', lastErrorMsg || '(none)');
        return { getLastErrorResult: lastErrorMsg || '' };
      },

      connectionError(args) {
        lastErrorMsg = `Connection error: ${args?.hresult || ''} ${args?.message || ''}`.trim();
        console.error('❌ Connection error:', lastErrorMsg);
        return { connectionErrorResult: 'done' };
      },
    },
  },
};

// Helper function to handle successful job completion
function handleJobSuccess(job, responseXml) {
  if (!job.metadata || !job.metadata.invoiceId) {
    return; // Not an invoice-related job
  }
  
  const { invoiceId, purpose, itemName } = job.metadata;
  
  try {
    // Parse XML to extract data (simple extraction)
    const hasData = responseXml && responseXml.includes('ListID');
    
    switch (purpose) {
      case 'validate-customer':
        if (hasData) {
          const listId = extractListId(responseXml);
          invoiceProcessor.handleCustomerQueryResult(invoiceId, true, { listId });
        } else {
          invoiceProcessor.handleCustomerQueryResult(invoiceId, false, null);
        }
        break;
        
      case 'validate-item':
        if (hasData) {
          const listId = extractListId(responseXml);
          invoiceProcessor.handleItemQueryResult(invoiceId, itemName, true, { listId });
        } else {
          invoiceProcessor.handleItemQueryResult(invoiceId, itemName, false, null);
        }
        break;
        
      case 'create-customer':
        const customerListId = extractListId(responseXml);
        invoiceProcessor.handleCustomerCreateResult(invoiceId, true, { listId: customerListId }, null);
        break;
        
      case 'create-item':
        const itemListId = extractListId(responseXml);
        invoiceProcessor.handleItemCreateResult(invoiceId, itemName, true, { listId: itemListId }, null);
        break;
        
      case 'create-invoice':
        const invoiceData = {
          txnID: extractTxnID(responseXml),
          invoiceNumber: extractRefNumber(responseXml)
        };
        invoiceProcessor.handleInvoiceCreateResult(invoiceId, true, invoiceData, null);
        break;
    }
  } catch (e) {
    console.error(`Error handling job success callback:`, e.message);
  }
}

// Helper function to handle failed job
function handleJobFailure(job, error) {
  if (!job.metadata || !job.metadata.invoiceId) {
    return; // Not an invoice-related job
  }
  
  const { invoiceId, purpose, itemName } = job.metadata;
  
  // Check if this is an "already exists" error (3100)
  const isAlreadyExists = error && error.includes('3100');
  
  try {
    switch (purpose) {
      case 'validate-customer':
        invoiceProcessor.handleCustomerQueryResult(invoiceId, false, null);
        break;
        
      case 'validate-item':
        invoiceProcessor.handleItemQueryResult(invoiceId, itemName, false, null);
        break;
        
      case 'create-customer':
        if (isAlreadyExists) {
          // Customer already exists - query to get its ListID
          console.log(`   📋 ${invoiceId}: Customer already exists, querying for ListID...`);
          const invoice = require('./invoiceStorage').getInvoice(invoiceId);
          if (invoice) {
            addJob({
              type: 'CustomerQuery',
              payload: {
                name: invoice.customer.name,
                maxReturned: 1
              },
              metadata: {
                invoiceId: invoiceId,
                purpose: 'validate-customer'
              }
            });
            // Reset the queued flag so we can try the query
            const invoiceStorage = require('./invoiceStorage');
            invoiceStorage.updateInvoice(invoiceId, {
              queuedJobs: {
                ...(invoice.queuedJobs || {}),
                customerAdd: false
              }
            });
          }
        } else {
          // Other errors - reset flag so it can be retried
          console.log(`   📋 ${invoiceId}: Customer creation failed with: ${error}`);
          const invoiceStorage = require('./invoiceStorage');
          const invoice = invoiceStorage.getInvoice(invoiceId);
          if (invoice) {
            invoiceStorage.updateInvoice(invoiceId, {
              queuedJobs: {
                ...(invoice.queuedJobs || {}),
                customerAdd: false  // Reset so it can be retried
              }
            });
          }
          invoiceProcessor.handleCustomerCreateResult(invoiceId, false, null, error);
        }
        break;
        
      case 'create-item':
        if (isAlreadyExists) {
          // Item already exists - query to get its ListID
          console.log(`   📋 ${invoiceId}: Item "${itemName}" already exists, querying for ListID...`);
          addJob({
            type: 'ItemQuery',
            payload: {
              name: itemName,
              maxReturned: 1
            },
            metadata: {
              invoiceId: invoiceId,
              itemName: itemName,
              purpose: 'validate-item'
            }
          });
          // Reset the queued flag
          const invoiceStorage = require('./invoiceStorage');
          const invoice = invoiceStorage.getInvoice(invoiceId);
          if (invoice) {
            invoiceStorage.updateInvoice(invoiceId, {
              queuedJobs: {
                ...(invoice.queuedJobs || {}),
                itemAdds: {
                  ...(invoice.queuedJobs?.itemAdds || {}),
                  [itemName]: false
                }
              }
            });
          }
        } else {
          // Other errors - reset flag so it can be retried
          console.log(`   📋 ${invoiceId}: Item "${itemName}" creation failed with: ${error}`);
          const invoiceStorage = require('./invoiceStorage');
          const invoice = invoiceStorage.getInvoice(invoiceId);
          if (invoice) {
            invoiceStorage.updateInvoice(invoiceId, {
              queuedJobs: {
                ...(invoice.queuedJobs || {}),
                itemAdds: {
                  ...(invoice.queuedJobs?.itemAdds || {}),
                  [itemName]: false  // Reset so it can be retried
                }
              }
            });
          }
          invoiceProcessor.handleItemCreateResult(invoiceId, itemName, false, null, error);
        }
        break;
        
      case 'create-invoice':
        invoiceProcessor.handleInvoiceCreateResult(invoiceId, false, null, error);
        break;
    }
  } catch (e) {
    console.error(`Error handling job failure callback:`, e.message);
  }
}

// Simple XML parsing helpers
function extractListId(xml) {
  const match = xml.match(/<ListID>([^<]+)<\/ListID>/);
  return match ? match[1] : null;
}

function extractTxnID(xml) {
  const match = xml.match(/<TxnID>([^<]+)<\/TxnID>/);
  return match ? match[1] : null;
}

function extractRefNumber(xml) {
  const match = xml.match(/<RefNumber>([^<]+)<\/RefNumber>/);
  return match ? match[1] : null;
}

// Seed demo jobs
function seedDemoJobs() {
  console.log('🌱 Seeding demo jobs...');
  


}

module.exports = { service, seedDemoJobs };