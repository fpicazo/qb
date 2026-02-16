const { create } = require('xmlbuilder2');

function normalizeLookupText(value) {
  if (value === null || value === undefined) return value;
  return String(value)
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function itemQuery({ maxReturned = 100, name, nameFilter } = {}) {
  const inner = create().ele('ItemQueryRq', { requestID: 'item-query-1' });
  const normalizedName = normalizeLookupText(name);
  const normalizedFilterName = normalizeLookupText(nameFilter && nameFilter.name);
  
  // IMPORTANT: QBXML requires specific element order!
  // Order: FullName/ListID → MaxReturned → NameFilter → IncludeRetElement
  
  // Filter by exact name if provided (must come FIRST)
  if (normalizedName) {
    inner.ele('FullName').txt(normalizedName);
    // When filtering by exact FullName, do NOT include MaxReturned
  } else {
    // Add MaxReturned only when not filtering by exact name
    inner.ele('MaxReturned').txt(String(maxReturned));
  }

  // Include inactive items too (default is ActiveOnly in many QB setups).
  inner.ele('ActiveStatus').txt('All');
  
  // Filter by name pattern if provided (comes AFTER MaxReturned)
  if (normalizedFilterName) {
    const filter = inner.ele('NameFilter');
    filter.ele('MatchCriterion').txt(nameFilter.matchCriterion || 'StartsWith');
    filter.ele('Name').txt(normalizedFilterName);
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

function itemGroupProductsQuery({ itemId } = {}) {
  if (!itemId) {
    throw new Error('itemId is required');
  }

  const inner = create().ele('ItemQueryRq', { requestID: 'item-group-products-query-1' });
  inner.ele('ListID').txt(String(itemId));

  // Intentionally do not use IncludeRetElement here so QB returns full ItemGroupLineRet data.
  inner.up();
  return wrapRq(inner);
}

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

function invoiceQuery({ maxReturned = 20, depositToAccountName, customerName, txnDateStart, txnDateEnd } = {}) {
  const inner = create().ele('InvoiceQueryRq', { requestID: 'invoice-query-1' });
  
  // Add MaxReturned
  inner.ele('MaxReturned').txt(String(maxReturned));
  
  // Add optional filters via metadata
  // Note: QB doesn't support direct filtering in InvoiceQuery request
  // Filtering by DepositToAccountRef happens in response parsing
  
  // Request all fields so we can filter client-side
  inner.ele('IncludeRetElement').txt('TxnID');
  inner.ele('IncludeRetElement').txt('TimeCreated');
  inner.ele('IncludeRetElement').txt('TimeModified');
  inner.ele('IncludeRetElement').txt('DocNumber');
  inner.ele('IncludeRetElement').txt('TxnDate');
  inner.ele('IncludeRetElement').txt('CustomerRef');
  inner.ele('IncludeRetElement').txt('RefNumber');
  inner.ele('IncludeRetElement').txt('BillAddress');
  inner.ele('IncludeRetElement').txt('ShipAddress');
  inner.ele('IncludeRetElement').txt('ClassRef');
  inner.ele('IncludeRetElement').txt('TermsRef');
  inner.ele('IncludeRetElement').txt('DueDate');
  inner.ele('IncludeRetElement').txt('Memo');
  inner.ele('IncludeRetElement').txt('IsPending');
  inner.ele('IncludeRetElement').txt('IsFinanceCharge');
  inner.ele('IncludeRetElement').txt('PONumber');
  inner.ele('IncludeRetElement').txt('Subtotal');
  inner.ele('IncludeRetElement').txt('TaxPercent');
  inner.ele('IncludeRetElement').txt('Tax');
  inner.ele('IncludeRetElement').txt('Total');
  inner.ele('IncludeRetElement').txt('InvoiceLineRet');
  inner.ele('IncludeRetElement').txt('DepositToAccountRef');
  
  inner.up();
  return wrapRq(inner);
}

function invoiceAdd({ customer, txnDate, refNumber, memo, lineItems, billTo, shipTo }) {
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
  
  // Add optional bill to address
  if (billTo) {
    const billAddr = add.ele('BillAddress');
    if (billTo.address1) billAddr.ele('Addr1').txt(billTo.address1);
    if (billTo.address2) billAddr.ele('Addr2').txt(billTo.address2);
    if (billTo.address3) billAddr.ele('Addr3').txt(billTo.address3);
    if (billTo.address4) billAddr.ele('Addr4').txt(billTo.address4);
    if (billTo.address5) billAddr.ele('Addr5').txt(billTo.address5);
    if (billTo.city) billAddr.ele('City').txt(billTo.city);
    if (billTo.state) billAddr.ele('State').txt(billTo.state);
    if (billTo.postalCode) billAddr.ele('PostalCode').txt(billTo.postalCode);
    if (billTo.country) billAddr.ele('Country').txt(billTo.country);
    if (billTo.note) billAddr.ele('Note').txt(billTo.note);
  }
  
  // Add optional ship to address
  if (shipTo) {
    const shipAddr = add.ele('ShipAddress');
    if (shipTo.address1) shipAddr.ele('Addr1').txt(shipTo.address1);
    if (shipTo.address2) shipAddr.ele('Addr2').txt(shipTo.address2);
    if (shipTo.address3) shipAddr.ele('Addr3').txt(shipTo.address3);
    if (shipTo.address4) shipAddr.ele('Addr4').txt(shipTo.address4);
    if (shipTo.address5) shipAddr.ele('Addr5').txt(shipTo.address5);
    if (shipTo.city) shipAddr.ele('City').txt(shipTo.city);
    if (shipTo.state) shipAddr.ele('State').txt(shipTo.state);
    if (shipTo.postalCode) shipAddr.ele('PostalCode').txt(shipTo.postalCode);
    if (shipTo.country) shipAddr.ele('Country').txt(shipTo.country);
    if (shipTo.note) shipAddr.ele('Note').txt(shipTo.note);
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





module.exports = { 
  customerQuery,
  itemQuery,
  itemGroupProductsQuery,
  itemAdd,
  customerAdd,
  invoiceQuery,
  invoiceAdd
  

};
