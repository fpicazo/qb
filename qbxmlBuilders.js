const { create } = require('xmlbuilder2');

function wrapRq(inner, version = '13.0') {
  // Build the QBXML without XML declaration first
  const doc = create()
    .ele('QBXML')
      .ele('QBXMLMsgsRq', { onError: 'stopOnError' })
        .import(inner)
      .up()
    .up();
  
  // Get the XML without declaration
  const xmlStr = doc.end({ prettyPrint: true, headless: true });
  
  // Manually build correct format: XML declaration first, then qbxml PI, then content
  return `<?xml version="1.0" encoding="utf-8"?>\n<?qbxml version="${version}"?>\n${xmlStr}`;
}

// ========== CUSTOMER OPERATIONS ==========

/**
 * Query customers from QuickBooks with optional name filtering
 * 
 * @param {Object} params - Query parameters
 * @param {number} [params.maxReturned] - Max number of customers to return (default: 100)
 * @param {string} [params.name] - Exact name to search for (FullName)
 * @param {Object} [params.nameFilter] - Pattern-based name filter
 * @param {string} params.nameFilter.name - Name pattern to search for
 * @param {string} [params.nameFilter.matchCriterion] - 'StartsWith', 'Contains', or 'EndsWith' (default: 'StartsWith')
 */
function customerQuery({ maxReturned = 100, name, nameFilter } = {}) {
  const inner = create().ele('CustomerQueryRq', { requestID: 'cust-query-1' });
  
  // IMPORTANT: QBXML requires specific element order!
  // When filtering by exact FullName, don't include MaxReturned
  
  // Filter by exact name if provided (must come FIRST)
  if (name) {
    inner.ele('FullName').txt(name);
    // Don't add MaxReturned when using exact FullName filter
  } else {
    // Add MaxReturned only when not filtering by exact name
    inner.ele('MaxReturned').txt(String(maxReturned));
  }
  
  // Filter by name pattern if provided (comes AFTER MaxReturned)
  if (nameFilter && nameFilter.name) {
    const filter = inner.ele('NameFilter');
    filter.ele('MatchCriterion').txt(nameFilter.matchCriterion || 'StartsWith');
    filter.ele('Name').txt(nameFilter.name);
  }
  
  // Request specific fields (must come LAST)
  inner.ele('IncludeRetElement').txt('ListID');
  inner.ele('IncludeRetElement').txt('Name');
  inner.ele('IncludeRetElement').txt('FullName');
  inner.ele('IncludeRetElement').txt('CompanyName');
  inner.ele('IncludeRetElement').txt('Email');
  inner.ele('IncludeRetElement').txt('Phone');
  
  inner.up();
  return wrapRq(inner);
}

function customerAdd({ fullName, email, phone }) {
  const inner = create().ele('CustomerAddRq', { requestID: 'cust-1' })
    .ele('CustomerAdd')
      .ele('Name').txt(fullName).up()
      .ele('Phone').txt(phone || '').up()
      .ele('Email').txt(email || '').up()
    .up().up();
  return wrapRq(inner);
}

// ========== INVOICE OPERATIONS ==========

/**
 * Create an invoice in QuickBooks
 * 
 * @param {Object} params - Invoice parameters
 * @param {Object} params.customer - Customer reference
 * @param {string} [params.customer.listId] - Customer ListID (preferred)
 * @param {string} [params.customer.fullName] - Customer FullName (if ListID not available)
 * @param {string} [params.txnDate] - Transaction date (YYYY-MM-DD format)
 * @param {string} [params.refNumber] - Invoice reference number
 * @param {string} [params.memo] - Invoice memo
 * @param {Array} params.lineItems - Array of line items
 * @param {Object} params.lineItems[].item - Item reference
 * @param {string} [params.lineItems[].item.listId] - Item ListID (preferred)
 * @param {string} [params.lineItems[].item.fullName] - Item FullName (if ListID not available)
 * @param {string} [params.lineItems[].description] - Line description
 * @param {number} params.lineItems[].quantity - Quantity
 * @param {number} params.lineItems[].rate - Rate/price per unit
 * @param {number} [params.lineItems[].amount] - Total amount (overrides quantity * rate)
 */
function invoiceAdd({ customer, txnDate, refNumber, memo, lineItems }) {
  if (!customer || (!customer.listId && !customer.fullName)) {
    throw new Error('Customer reference (listId or fullName) is required');
  }
  
  if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
    throw new Error('At least one line item is required');
  }

  const root = create();
  const req = root.ele('InvoiceAddRq', { requestID: 'invoice-1' });
  const add = req.ele('InvoiceAdd');
  
  // Add customer reference
  const custRef = add.ele('CustomerRef');
  if (customer.listId) {
    custRef.ele('ListID').txt(customer.listId);
  } else {
    custRef.ele('FullName').txt(customer.fullName);
  }
  
  // Add optional transaction date (format: YYYY-MM-DD)
  if (txnDate) {
    add.ele('TxnDate').txt(txnDate);
  }
  
  // Add optional reference number
  if (refNumber) {
    add.ele('RefNumber').txt(refNumber);
  }
  
  // Add optional memo
  if (memo) {
    add.ele('Memo').txt(memo);
  }
  
  // Add line items
  lineItems.forEach((line, index) => {
    if (!line.item || (!line.item.listId && !line.item.fullName)) {
      throw new Error(`Line item ${index + 1}: item reference (listId or fullName) is required`);
    }
    
    if (line.quantity === undefined || line.quantity === null) {
      throw new Error(`Line item ${index + 1}: quantity is required`);
    }
    
    if (line.amount === undefined && (line.rate === undefined || line.rate === null)) {
      throw new Error(`Line item ${index + 1}: rate or amount is required`);
    }
    
    const lineAdd = add.ele('InvoiceLineAdd');
    
    // Add item reference
    const itemRef = lineAdd.ele('ItemRef');
    if (line.item.listId) {
      itemRef.ele('ListID').txt(line.item.listId);
    } else {
      itemRef.ele('FullName').txt(line.item.fullName);
    }
    
    // Add description (optional)
    if (line.description) {
      lineAdd.ele('Desc').txt(line.description);
    }
    
    // Add quantity
    lineAdd.ele('Quantity').txt(String(line.quantity));
    
    // Add rate or amount (ensure proper decimal formatting for QB)
    if (line.amount !== undefined) {
      // Format amount with 2 decimal places
      lineAdd.ele('Amount').txt(Number(line.amount).toFixed(2));
    } else {
      // Format rate with 2 decimal places
      lineAdd.ele('Rate').txt(Number(line.rate).toFixed(2));
    }
  });

  return wrapRq(root);
}

// ========== ITEM OPERATIONS (BABY STEPS) ==========

/**
 * Add an item to QuickBooks (simplified!)
 * 
 * @param {Object} params - Item parameters
 * @param {string} params.type - 'Service', 'NonInventory', or 'Inventory'
 * @param {string} params.name - Item name (required)
 * @param {string} [params.description] - Item description
 * @param {number} [params.price] - Sales price
 */
function itemAdd({ type = 'Service', name, description, price, account }) {
  if (!name) throw new Error('Item name is required');
  
  const validTypes = ['Service', 'NonInventory', 'Inventory'];
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid type: ${type}. Use: Service, NonInventory, or Inventory`);
  }

  // Keep reference to root document
  const root = create();
  const req = root.ele(`Item${type}AddRq`, { requestID: 'item-1' });
  const add = req.ele(`Item${type}Add`);
  
  // Add name (required)
  add.ele('Name').txt(name);

  // Inventory items use different tags than Service/NonInventory
  if (type === 'Inventory') {
    if (description) add.ele('SalesDesc').txt(description);
    if (price !== undefined) add.ele('SalesPrice').txt(Number(price).toFixed(2));
    // Add income account for inventory
    if (account) {
      add.ele('IncomeAccountRef')
        .ele('FullName').txt(account);
    }
  } else {
    // Service and NonInventory use SalesOrPurchase wrapper
    if (description || price !== undefined || account) {
      const sop = add.ele('SalesOrPurchase');
      if (description) sop.ele('Desc').txt(description);
      if (price !== undefined) sop.ele('Price').txt(Number(price).toFixed(2));
      // Add account reference for service/non-inventory
      if (account) {
        sop.ele('AccountRef')
          .ele('FullName').txt(account);
      }
    }
  }

  // Pass root document to wrapRq (contains ItemServiceAddRq)
  return wrapRq(root);
}

/**
 * Query items from QuickBooks with optional name filtering
 * 
 * @param {Object} params - Query parameters
 * @param {number} [params.maxReturned] - Max number of items to return (default: 100)
 * @param {string} [params.name] - Exact name to search for
 * @param {Object} [params.nameFilter] - Pattern-based name filter
 * @param {string} params.nameFilter.name - Name pattern to search for
 * @param {string} [params.nameFilter.matchCriterion] - 'StartsWith', 'Contains', or 'EndsWith' (default: 'StartsWith')
 */
function itemQuery({ maxReturned = 100, name, nameFilter } = {}) {
  const inner = create().ele('ItemQueryRq', { requestID: 'item-query-1' });
  
  // IMPORTANT: QBXML requires specific element order!
  // Order: FullName/ListID → MaxReturned → NameFilter → IncludeRetElement
  
  // Filter by exact name if provided (must come FIRST)
  if (name) {
    inner.ele('FullName').txt(name);
  }
  
  // Add MaxReturned (comes AFTER name filters)
  inner.ele('MaxReturned').txt(String(maxReturned));
  
  // Filter by name pattern if provided (comes AFTER MaxReturned)
  if (nameFilter && nameFilter.name) {
    const filter = inner.ele('NameFilter');
    filter.ele('MatchCriterion').txt(nameFilter.matchCriterion || 'StartsWith');
    filter.ele('Name').txt(nameFilter.name);
  }
  
  // Request specific fields (must come LAST)
  inner.ele('IncludeRetElement').txt('ListID');
  inner.ele('IncludeRetElement').txt('Name');
  inner.ele('IncludeRetElement').txt('FullName');
  inner.ele('IncludeRetElement').txt('Type');
  inner.ele('IncludeRetElement').txt('IsActive');
  inner.ele('IncludeRetElement').txt('SalesPrice');
  inner.ele('IncludeRetElement').txt('SalesDesc');
  
  inner.up();
  return wrapRq(inner);
}



module.exports = { 
  customerQuery, 
  customerAdd, 
  invoiceAdd,
  itemAdd,
  itemQuery
};