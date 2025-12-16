// qbwcService.js - QB Web Connector Service

const { customerQuery, itemQuery, customerAdd, itemAdd } = require('./qbxmlBuilders');
const { getNextPending, markDone, markError, _queue } = require('./queue');

let currentTicket = null;
let lastErrorMsg = '';
let lastJob = null;

const service = {
  QBWebConnectorSvc: {
    QBWebConnectorSvcSoap: {
      // ---- Handshake ----
      authenticate(args) {
        console.log('🔐 Authenticate called');
        console.log('   Username:', args.strUserName);
        
        // Validate credentials
        if (args.strUserName !== 'qbuser' || args.strPassword !== 'qbpass') {
          console.log('❌ Invalid credentials');
          return { authenticateResult: { string: ['nvu', ''] } };
        }
        
        // Check if there are pending jobs
        const hasPending = _queue.some(j => j.status === 'pending');
        if (!hasPending) {
          console.log('⚠️  No pending jobs');
          return { authenticateResult: { string: ['none', ''] } };
        }
        
        // Generate ticket
        currentTicket = `ticket_${Date.now()}`;
        console.log('✅ Auth success, ticket:', currentTicket);
        
        return { 
          authenticateResult: {
            string: [currentTicket, '']
          }
        };
      },

      clientVersion(args) {
        console.log('📱 Client version:', args.strVersion);
        return { clientVersionResult: '' };
      },

      serverVersion(args) {
        console.log('🖥️  Server version requested');
        return { serverVersionResult: '1.0.0' };
      },

      // ---- Work request ----
      sendRequestXML(args) {
        console.log('📤 sendRequestXML called');
        console.log('   Ticket:', args.ticket);
        
        lastErrorMsg = '';

        // Validate ticket
        if (args.ticket !== currentTicket) {
          console.error('❌ Invalid ticket');
          return { sendRequestXMLResult: '' };
        }

        // Get next pending job
        const job = getNextPending();
        lastJob = job || null;

        if (!job) {
          console.log('✅ No pending jobs');
          return { sendRequestXMLResult: '' };
        }

        console.log('🔧 Processing job:', job.type, '(ID:', job.id + ')');

        // Build QBXML based on job type
        try {
          let qbxml = '';
          
          if (job.type === 'CustomerQuery') {
            qbxml = customerQuery({
              maxReturned: job.payload.maxReturned || 100,
              name: job.payload.name,
              nameFilter: job.payload.nameFilter
            });
            console.log('📝 CustomerQuery XML generated');
          } 
          else if (job.type === 'CustomerAdd') {
            qbxml = customerAdd({
              fullName: job.payload.fullName,
              email: job.payload.email,
              phone: job.payload.phone
            });
            console.log('📝 CustomerAdd XML generated');
            console.log('   Customer:', job.payload.fullName);
          }
          else if (job.type === 'ItemQuery') {
            qbxml = itemQuery({
              maxReturned: job.payload.maxReturned || 100,
              name: job.payload.name,
              nameFilter: job.payload.nameFilter
            });
            console.log('📝 ItemQuery XML generated');
          }
          else if (job.type === 'ItemAdd') {
            qbxml = itemAdd({
              type: job.payload.type,
              name: job.payload.name,
              description: job.payload.description,
              price: job.payload.price,
              account: job.payload.account
            });
            console.log('📝 ItemAdd XML generated');
            console.log('   Item:', job.payload.name, `(${job.payload.type})`);
          }
          else {
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
              }
            }
          }
        } catch (e) {
          lastErrorMsg = `receiveResponseXML error: ${e.message || e}`;
          console.error('❌', lastErrorMsg);
          if (lastJob) {
            markError(lastJob.id, lastErrorMsg);
          }
        }

        // Return progress
        const more = _queue.some(j => j.status === 'pending');
        const progress = more ? '10' : '100';
        console.log(`📊 Progress: ${progress}% (${more ? 'more jobs pending' : 'all done'})`);
        
        return { receiveResponseXMLResult: progress };
      },

      // ---- Close connection ----
      closeConnection(args) {
        console.log('👋 closeConnection called');
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
      }
    }
  }
};

module.exports = { service };