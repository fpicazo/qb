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




module.exports = { 
  customerQuery,
  itemQuery,
  itemAdd,
  customerAdd
  

};