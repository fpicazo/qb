// qbwcService.js - QB Web Connector Service

const {
  customerQuery,
  itemQuery,
  itemGroupQuery,
  itemGroupProductsQuery,
  itemInventoryAssemblyComponentsQuery,
  itemInventoryQuery,
  customerAdd,
  itemAdd,
  invoiceQuery,
  invoiceAdd,
  invoiceMod,
  receivePaymentAdd
} = require('./qbxmlBuilders');
const { getNextPending, markDone, markError, _queue } = require('./queue');
const config = require('./config');

let currentTicket = null;
let lastErrorMsg = '';
let lastJob = null;

let lastSeenAt = Date.now();
let hasSeenQbwcTraffic = false;
const offlineCutoffMinutes = Math.max(1, Number(config?.connection?.maxOfflineMinutesBeforePause) || 10);

function markQbwcActivity(source) {
  hasSeenQbwcTraffic = true;
  lastSeenAt = Date.now();
  if (source) {
    console.log(`QBWC activity: ${source}`);
  }
}

function getConnectionStatus() {
  const now = Date.now();
  const lastSeenIso = lastSeenAt ? new Date(lastSeenAt).toISOString() : null;
  const offlineMs = lastSeenAt ? now - lastSeenAt : Number.POSITIVE_INFINITY;
  const offlineMinutes = Number.isFinite(offlineMs) ? Math.floor(offlineMs / 60000) : null;
  const allowNewJobs = offlineMs <= (offlineCutoffMinutes * 60 * 1000);

  return {
    hasSeenQbwcTraffic,
    connectedRecently: hasSeenQbwcTraffic && allowNewJobs,
    allowNewJobs,
    offlineCutoffMinutes,
    lastSeenAt: lastSeenIso,
    offlineMinutes
  };
}

function itemQueryHasResults(xmlResponse) {
  if (!xmlResponse) return false;
  return /<Item[A-Za-z]*Ret\b/.test(xmlResponse);
}

function parseItemQueryPageStats(xmlResponse) {
  const xml = xmlResponse || '';
  const totalItems = (xml.match(/<Item[A-Za-z]*Ret\b/g) || []).length;
  const groupItems = (xml.match(/<ItemGroupRet\b/g) || []).length;
  const rsTagMatch = xml.match(/<ItemQueryRs\b([^>]*)>/);
  const attrsText = rsTagMatch ? rsTagMatch[1] : '';
  const iteratorIdMatch = attrsText.match(/\biteratorID="([^"]+)"/);
  const remainingCountMatch = attrsText.match(/\biteratorRemainingCount="([^"]+)"/);
  const statusCodeMatch = attrsText.match(/\bstatusCode="([^"]+)"/);
  const statusSeverityMatch = attrsText.match(/\bstatusSeverity="([^"]+)"/);
  const statusMessageMatch = attrsText.match(/\bstatusMessage="([^"]+)"/);
  const iteratorRemainingCount = remainingCountMatch ? Number(remainingCountMatch[1]) : 0;

  return {
    totalItems,
    groupItems,
    nonGroupItems: totalItems - groupItems,
    iteratorId: iteratorIdMatch ? iteratorIdMatch[1] : null,
    iteratorRemainingCount,
    hasMore: iteratorRemainingCount > 0,
    status: {
      code: statusCodeMatch ? statusCodeMatch[1] : null,
      severity: statusSeverityMatch ? statusSeverityMatch[1] : null,
      message: statusMessageMatch ? statusMessageMatch[1] : null
    }
  };
}

function parseItemInventoryQueryPageStats(xmlResponse) {
  const xml = xmlResponse || '';
  const totalItems = (xml.match(/<ItemInventoryRet\b/g) || []).length;
  const rsTagMatch = xml.match(/<ItemInventoryQueryRs\b([^>]*)>/);
  const attrsText = rsTagMatch ? rsTagMatch[1] : '';
  const iteratorIdMatch = attrsText.match(/\biteratorID="([^"]+)"/);
  const remainingCountMatch = attrsText.match(/\biteratorRemainingCount="([^"]+)"/);
  const iteratorRemainingCount = remainingCountMatch ? Number(remainingCountMatch[1]) : 0;

  return {
    totalItems,
    iteratorId: iteratorIdMatch ? iteratorIdMatch[1] : null,
    iteratorRemainingCount,
    hasMore: iteratorRemainingCount > 0
  };
}

function normalizeLookupText(value) {
  if (value === null || value === undefined) return value;
  return String(value)
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const service = {
  QBWebConnectorSvc: {
    QBWebConnectorSvcSoap: {
      // ---- Handshake ----
      authenticate(args) {
        markQbwcActivity('authenticate');
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
        markQbwcActivity('clientVersion');
        console.log('📱 Client version:', args.strVersion);
        return { clientVersionResult: '' };
      },

      serverVersion(args) {
        markQbwcActivity('serverVersion');
        console.log('🖥️  Server version requested');
        return { serverVersionResult: '1.0.0' };
      },

      // ---- Work request ----
      sendRequestXML(args) {
        markQbwcActivity('sendRequestXML');
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
          // Return minimal valid QBXML instead of empty string
          const emptyQbxml = `<?xml version="1.0" encoding="utf-8"?>\n<QBXML>\n  <QBXMLMsgsRq onError="stopOnError">\n    <ItemQueryRq requestID="none">\n      <MaxReturned>0</MaxReturned>\n    </ItemQueryRq>\n  </QBXMLMsgsRq>\n</QBXML>`;
          return { sendRequestXMLResult: emptyQbxml };
        }

        console.log('🔧 Processing job:', job.type, '(ID:', job.id + ')');

        // Build QBXML based on job type
        try {
          let qbxml = '';
          
          if (job.type === 'CustomerQuery') {
            qbxml = customerQuery({
              maxReturned: job.payload.maxReturned || 100,
              name: job.payload.name,
              nameFilter: job.payload.nameFilter,
              requestId: job.id
            });
            console.log('📝 CustomerQuery XML generated');
          } 
          else if (job.type === 'CustomerAdd') {
            qbxml = customerAdd({
              fullName: job.payload.fullName,
              email: job.payload.email,
              phone: job.payload.phone,
              requestId: job.id
            });
            console.log('📝 CustomerAdd XML generated');
            console.log('   Customer:', job.payload.fullName);
          }
          else if (job.type === 'ItemQuery') {
            const queryPayload = {
              maxReturned: job.payload.maxReturned || 100,
              iteratorAction: job.payload.iteratorAction,
              iteratorId: job.payload.iteratorId,
              requestId: job.id,
              metaData: job.payload.metaData
            };
            const autoTryEnabled = Boolean(job.payload && job.payload.autoTryExactContains && job.payload.searchTerm);

            if (autoTryEnabled) {
              const attempt = job.payload.searchAttempt || 'exact';
              const searchTerm = normalizeLookupText(job.payload.searchTerm);
              const primaryToken = normalizeLookupText(job.payload.searchPrimaryToken);
              if (attempt === 'contains') {
                queryPayload.nameFilter = {
                  name: searchTerm,
                  matchCriterion: 'Contains'
                };
                console.log('   ItemQuery attempt: contains "' + searchTerm + '"');
              } else if (attempt === 'contains-primary-token') {
                queryPayload.nameFilter = {
                  name: primaryToken || searchTerm,
                  matchCriterion: 'Contains'
                };
                console.log('   ItemQuery attempt: contains primary token "' + (primaryToken || searchTerm) + '"');
              } else {
                job.payload.searchAttempt = 'exact';
                queryPayload.name = searchTerm;
                console.log('   ItemQuery attempt: exact "' + searchTerm + '"');
              }
            } else {
              queryPayload.name = job.payload.name;
              queryPayload.nameFilter = job.payload.nameFilter;
            }

            qbxml = itemQuery(queryPayload);
            console.log('ItemQuery XML generated');
            if (job.payload.metaData || job.payload.countSessionId) {
              console.log(qbxml);
            }
          }
          else if (job.type === 'ItemGroupQuery') {
            qbxml = itemGroupQuery({
              requestId: job.id,
              metaData: job.payload.metaData,
              nameFilter: job.payload.nameFilter
            });
            console.log('ItemGroupQuery XML generated');
            if (job.payload.metaData || job.payload.countSessionId) {
              console.log(qbxml);
            }
          }
          else if (job.type === 'ItemGroupProductsQuery') {
            qbxml = itemGroupProductsQuery({
              itemId: job.payload.itemId,
              requestId: job.id
            });
            console.log('📝 ItemGroupProductsQuery XML generated');
            console.log('   Item ListID:', job.payload.itemId);
          }
          else if (job.type === 'ItemInventoryAssemblyComponentsQuery') {
            qbxml = itemInventoryAssemblyComponentsQuery({
              itemId: job.payload.itemId,
              requestId: job.id
            });
            console.log('ItemInventoryAssemblyComponentsQuery XML generated');
            console.log('   Item ListID:', job.payload.itemId);
          }
          else if (job.type === 'ItemInventoryQuery') {
            qbxml = itemInventoryQuery({
              listId: job.payload.listId,
              name: job.payload.name,
              maxReturned: job.payload.maxReturned || 100,
              iteratorAction: job.payload.iteratorAction,
              iteratorId: job.payload.iteratorId,
              requestId: job.id
            });
            console.log('ItemInventoryQuery XML generated');
            if (job.payload.listId) console.log('   ListID:', job.payload.listId);
            if (job.payload.name) console.log('   Name:', job.payload.name);
            if (job.payload.iteratorAction) console.log('   Iterator:', job.payload.iteratorAction);
          }
          else if (job.type === 'ItemAdd') {
            qbxml = itemAdd({
              type: job.payload.type,
              name: job.payload.name,
              description: job.payload.description,
              price: job.payload.price,
              account: job.payload.account,
              requestId: job.id
            });
            console.log('📝 ItemAdd XML generated');
            console.log('   Item:', job.payload.name, `(${job.payload.type})`);
          } else if (job.type === 'InvoiceQuery') {
            qbxml = invoiceQuery({
              maxReturned: job.payload.maxReturned || 100,
              txnId: job.payload.txnId,
              depositToAccountName: job.payload.depositToAccountName,
              customerName: job.payload.customerName,
              dateRangePreset: job.payload.dateRangePreset,
              txnDateStart: job.payload.txnDateStart,
              txnDateEnd: job.payload.txnDateEnd,
              iteratorAction: job.payload.iteratorAction,
              iteratorId: job.payload.iteratorId,
              requestId: job.id
            });
            console.log('📝 InvoiceQuery XML generated');
            if (job.payload.depositToAccountName) {
              console.log('   Filter by deposit account:', job.payload.depositToAccountName);
            }
          } else if (job.type === 'InvoiceAdd') {
            qbxml = invoiceAdd({
              customer: job.payload.customer,
              txnDate: job.payload.txnDate,
              refNumber: job.payload.refNumber,
              memo: job.payload.memo,
              lineItems: job.payload.lineItems,
              billTo: job.payload.billTo,
              shipTo: job.payload.shipTo,
              requestId: job.id
            });
            console.log('📝 InvoiceAdd XML generated');
            console.log('   Customer:', job.payload.customer.listId || job.payload.customer.fullName);
            console.log('   Line Items:', job.payload.lineItems?.length || 0);
            if (job.payload.refNumber) {
              console.log('   Reference:', job.payload.refNumber);
            }
          } else if (job.type === 'InvoiceMod') {
            qbxml = invoiceMod({
              txnId: job.payload.txnId,
              editSequence: job.payload.editSequence,
              customer: job.payload.customer,
              txnDate: job.payload.txnDate,
              refNumber: job.payload.refNumber,
              memo: job.payload.memo,
              lineItems: job.payload.lineItems,
              billTo: job.payload.billTo,
              shipTo: job.payload.shipTo,
              requestId: job.id
            });
            console.log('ðŸ“ InvoiceMod XML generated');
            console.log('   TxnID:', job.payload.txnId);
            console.log('   Line Items:', job.payload.lineItems?.length || 0);
          } else if (job.type === 'ReceivePaymentAdd') {
            qbxml = receivePaymentAdd({
              customer: job.payload.customer,
              arAccount: job.payload.arAccount,
              txnDate: job.payload.txnDate,
              refNumber: job.payload.refNumber,
              totalAmount: job.payload.totalAmount,
              paymentMethod: job.payload.paymentMethod,
              memo: job.payload.memo,
              depositToAccount: job.payload.depositToAccount,
              appliedTo: job.payload.appliedTo,
              requestId: job.id
            });
            console.log('ReceivePaymentAdd XML generated');
            console.log('   Customer:', job.payload.customer.listId || job.payload.customer.fullName);
            console.log('   Applied To:', job.payload.appliedTo?.length || 0);
          } else {
            lastErrorMsg = `Unknown job type: ${job.type}`;
            console.error('❌', lastErrorMsg);
            markError(job.id, lastErrorMsg);
            // Return minimal valid QBXML instead of empty string
            const emptyQbxml = `<?xml version="1.0" encoding="utf-8"?>\n<QBXML>\n  <QBXMLMsgsRq onError="stopOnError">\n    <ItemQueryRq requestID="error">\n      <MaxReturned>0</MaxReturned>\n    </ItemQueryRq>\n  </QBXMLMsgsRq>\n</QBXML>`;
            return { sendRequestXMLResult: emptyQbxml };
          }

          // Log first 200 chars of XML for debugging
          console.log('📄 XML preview:', qbxml.substring(0, 200) + '...');
          // Log full XML for debugging
          console.log('📄 FULL XML sent to QuickBooks:\n' + qbxml);
          return { sendRequestXMLResult: qbxml };
          
        } catch (e) {
          lastErrorMsg = `Builder error: ${e.message || e}`;
          console.error('❌', lastErrorMsg, e);
          if (job) markError(job.id, lastErrorMsg);
          // Return minimal valid QBXML instead of empty string
          const emptyQbxml = `<?xml version="1.0" encoding="utf-8"?>\n<QBXML>\n  <QBXMLMsgsRq onError="stopOnError">\n    <ItemQueryRq requestID="builder-error">\n      <MaxReturned>0</MaxReturned>\n    </ItemQueryRq>\n  </QBXMLMsgsRq>\n</QBXML>`;
          return { sendRequestXMLResult: emptyQbxml };
        }
      },

      // ---- QB response ----
      receiveResponseXML(args) {
        markQbwcActivity('receiveResponseXML');
        console.log('receiveResponseXML called');
        console.log('   HRESULT:', args.hresult || '(none)');
        console.log('   Message:', args.message || '(none)');
        
        try {
          // Check for QB error
          if (args.hresult && String(args.hresult).trim() !== '') {
            lastErrorMsg = `QB Error ${args.hresult}: ${args.message || 'Unknown error'}`;
            console.error('Error:', lastErrorMsg);
            if (lastJob) {
              markError(lastJob.id, lastErrorMsg);
            }
          } else {
            // Check for operation-level errors in XML response
            const xmlResponse = args.response || '';
            const hasError = xmlResponse.includes('statusSeverity="Error"');
            
            if (hasError) {
              const statusCodeMatch = xmlResponse.match(/statusCode="(\d+)"/);
              const statusMessageMatch = xmlResponse.match(/statusMessage="([^"]+)"/);
              const statusCode = statusCodeMatch ? statusCodeMatch[1] : 'unknown';
              const statusMessage = statusMessageMatch ? statusMessageMatch[1] : 'Unknown error';

              lastErrorMsg = `QB Operation Error ${statusCode}: ${statusMessage}`;
              console.error('Error:', lastErrorMsg);

              if (lastJob) {
                markError(lastJob.id, lastErrorMsg);
              }
            } else {
              const isAutoItemRetry =
                lastJob &&
                lastJob.type === 'ItemQuery' &&
                lastJob.payload &&
                lastJob.payload.autoTryExactContains &&
                lastJob.payload.searchTerm;

              if (isAutoItemRetry) {
                const attempt = lastJob.payload.searchAttempt || 'exact';
                const hasItems = itemQueryHasResults(xmlResponse);
                const primaryToken = normalizeLookupText(lastJob.payload.searchPrimaryToken);
                const searchTerm = normalizeLookupText(lastJob.payload.searchTerm);
                const hasTokenFallback =
                  Boolean(primaryToken) &&
                  Boolean(searchTerm) &&
                  primaryToken.toLowerCase() !== searchTerm.toLowerCase();

                if (!hasItems && attempt === 'exact') {
                  lastJob.payload.searchAttempt = 'contains';
                  lastJob.status = 'pending';
                  lastJob.result = {
                    ...(lastJob.result || {}),
                    firstAttempt: 'exact',
                    firstAttemptFoundItems: false,
                    firstAttemptRaw: xmlResponse
                  };
                  console.log('No exact item match for "' + lastJob.payload.searchTerm + '". Re-queueing with Contains.');
                } else if (!hasItems && attempt === 'contains' && hasTokenFallback) {
                  lastJob.payload.searchAttempt = 'contains-primary-token';
                  lastJob.status = 'pending';
                  lastJob.result = {
                    ...(lastJob.result || {}),
                    secondAttempt: 'contains',
                    secondAttemptFoundItems: false,
                    secondAttemptRaw: xmlResponse
                  };
                  console.log(
                    'No contains-full match for "' +
                    lastJob.payload.searchTerm +
                    '". Re-queueing with primary token "' +
                    primaryToken +
                    '".'
                  );
                } else {
                  const fallbackUsed = attempt === 'contains' || attempt === 'contains-primary-token';
                  console.log('Job completed: ' + lastJob.id + (fallbackUsed ? ' (contains fallback used)' : ''));
                  markDone(lastJob.id, {
                    raw: args.response,
                    autoTryExactContains: true,
                    finalAttempt: attempt,
                    fallbackUsed
                  });
                  if (args.response) {
                    console.log('Response preview:', args.response.substring(0, 200) + '...');
                  }
                }
              } else {
                console.log('Job completed:', lastJob && lastJob.id);
                if (lastJob) {
                  const isExactNonGroupCount =
                    lastJob.type === 'ItemQuery' &&
                    lastJob.payload &&
                    lastJob.payload.exactCountMode === 'non-group';

                  if (isExactNonGroupCount) {
                    const pageStats = parseItemQueryPageStats(args.response);
                    const runningTotalItems = Number(lastJob.payload.runningTotalItems || 0) + pageStats.totalItems;
                    const runningGroupItems = Number(lastJob.payload.runningGroupItems || 0) + pageStats.groupItems;
                    const runningNonGroupItems = Number(lastJob.payload.runningNonGroupItems || 0) + pageStats.nonGroupItems;

                    lastJob.payload.runningTotalItems = runningTotalItems;
                    lastJob.payload.runningGroupItems = runningGroupItems;
                    lastJob.payload.runningNonGroupItems = runningNonGroupItems;
                    lastJob.payload.pagesProcessed = Number(lastJob.payload.pagesProcessed || 0) + 1;

                    if (pageStats.hasMore && pageStats.iteratorId) {
                      lastJob.payload.iteratorAction = 'Continue';
                      lastJob.payload.iteratorId = pageStats.iteratorId;
                      lastJob.status = 'pending';
                      lastJob.result = {
                        raw: args.response,
                        progress: {
                          totalItems: runningTotalItems,
                          groupItems: runningGroupItems,
                          nonGroupItems: runningNonGroupItems,
                          pagesProcessed: lastJob.payload.pagesProcessed,
                          iteratorRemainingCount: pageStats.iteratorRemainingCount
                        }
                      };
                      console.log(
                        'Continuing exact non-group count for job',
                        lastJob.id,
                        '- pages:',
                        lastJob.payload.pagesProcessed,
                        'remaining:',
                        pageStats.iteratorRemainingCount
                      );
                    } else {
                      markDone(lastJob.id, {
                        raw: args.response,
                        exactCountMode: 'non-group',
                        totalItems: runningTotalItems,
                        groupItems: runningGroupItems,
                        nonGroupItems: runningNonGroupItems,
                        pagesProcessed: lastJob.payload.pagesProcessed
                      });
                    }
                  } else if (lastJob.type === 'ItemInventoryQuery' && lastJob.payload?.targetCount) {
                    const pageStats = parseItemInventoryQueryPageStats(args.response);
                    const targetCount = Number(lastJob.payload.targetCount);
                    const rawPages = Array.isArray(lastJob.result?.rawPages)
                      ? [...lastJob.result.rawPages, args.response]
                      : [args.response];
                    const accumulatedCount = Number(lastJob.payload.accumulatedCount || 0) + pageStats.totalItems;

                    if (pageStats.hasMore && accumulatedCount < targetCount && pageStats.iteratorId) {
                      lastJob.payload.iteratorAction = 'Continue';
                      lastJob.payload.iteratorId = pageStats.iteratorId;
                      lastJob.payload.accumulatedCount = accumulatedCount;
                      lastJob.status = 'pending';
                      lastJob.result = { rawPages, accumulatedCount };
                      console.log(`ItemInventoryQuery continuing - accumulated: ${accumulatedCount}, remaining: ${pageStats.iteratorRemainingCount}`);
                    } else {
                      markDone(lastJob.id, { rawPages, raw: args.response, accumulatedCount });
                    }
                  } else {
                    markDone(lastJob.id, { raw: args.response });
                  }
                  if (args.response) {
                    console.log('Response preview:', args.response.substring(0, 200) + '...');
                  }
                }
              }
            }
          }
        } catch (e) {
          lastErrorMsg = `receiveResponseXML error: ${e.message || e}`;
          console.error('Error:', lastErrorMsg);
          if (lastJob) {
            markError(lastJob.id, lastErrorMsg);
          }
        }

        // Return progress
        const more = _queue.some(j => j.status === 'pending');
        const progress = more ? '10' : '100';
        console.log(`Progress: ${progress}% (${more ? 'more jobs pending' : 'all done'})`);

        return { receiveResponseXMLResult: progress };
      },

      // ---- Close connection ----
      closeConnection(args) {
        markQbwcActivity('closeConnection');
        console.log('👋 closeConnection called');
        lastJob = null;
        currentTicket = null;
        return { closeConnectionResult: 'OK' };
      },

      // ---- Error handling ----
      getLastError(args) {
        markQbwcActivity('getLastError');
        console.log('🔍 getLastError called');
        console.log('   Error:', lastErrorMsg || '(none)');
        return { getLastErrorResult: lastErrorMsg || '' };
      },

      connectionError(args) {
        markQbwcActivity('connectionError');
        lastErrorMsg = `Connection error: ${args?.hresult || ''} ${args?.message || ''}`.trim();
        console.error('❌ Connection error:', lastErrorMsg);
        return { connectionErrorResult: 'done' };
      }
    }
  }
};

module.exports = {
  service,
  getConnectionStatus
};
