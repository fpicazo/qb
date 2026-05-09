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

function resolveRequestId(requestId, fallback) {
  const normalized = requestId === null || requestId === undefined ? '' : String(requestId).trim();
  return normalized || fallback;
}

function customerQuery({ maxReturned = 100, name, nameFilter, requestId } = {}) {
  const inner = create().ele('CustomerQueryRq', { requestID: resolveRequestId(requestId, 'cust-query-1') });
  
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

function itemQuery({ maxReturned = 100, name, nameFilter, iteratorAction, iteratorId, requestId, metaData } = {}) {
  const attrs = { requestID: resolveRequestId(requestId, 'item-query-1') };
  if (metaData) {
    attrs.metaData = metaData;
  }
  if (iteratorAction) {
    attrs.iterator = iteratorAction;
  }
  if (iteratorId) {
    attrs.iteratorID = iteratorId;
  }

  const inner = create().ele('ItemQueryRq', attrs);
  const normalizedName = normalizeLookupText(name);
  const normalizedFilterName = normalizeLookupText(nameFilter && nameFilter.name);
  const isMetaDataOnly = metaData === 'MetaDataOnly';
  
  // IMPORTANT: QBXML requires specific element order!
  // Order: FullName/ListID → MaxReturned → NameFilter → IncludeRetElement
  
  // Filter by exact name if provided (must come FIRST)
  if (normalizedName) {
    inner.ele('FullName').txt(normalizedName);
    // When filtering by exact FullName, do NOT include MaxReturned
  } else if (!isMetaDataOnly) {
    // Add MaxReturned only when not filtering by exact name
    inner.ele('MaxReturned').txt(String(maxReturned));
  }

  // ActiveStatus belongs to the list-filter branch, so don't combine it with exact FullName queries.
  if (!normalizedName) {
    inner.ele('ActiveStatus').txt('All');
  }
  
  // Filter by name pattern if provided (comes AFTER MaxReturned)
  if (normalizedFilterName) {
    const filter = inner.ele('NameFilter');
    filter.ele('MatchCriterion').txt(nameFilter.matchCriterion || 'StartsWith');
    filter.ele('Name').txt(normalizedFilterName);
  }
  
  // Request specific fields (must come LAST)
  if (!isMetaDataOnly) {
    inner.ele('IncludeRetElement').txt('ListID');
    inner.ele('IncludeRetElement').txt('Name');
    inner.ele('IncludeRetElement').txt('FullName');
    inner.ele('IncludeRetElement').txt('Type');
    inner.ele('IncludeRetElement').txt('IsActive');
    inner.ele('IncludeRetElement').txt('SalesPrice');
    inner.ele('IncludeRetElement').txt('SalesDesc');
  }
  
  inner.up();
  return wrapRq(inner);
}

function itemGroupQuery({ requestId, metaData, nameFilter } = {}) {
  const attrs = { requestID: resolveRequestId(requestId, 'item-group-query-1') };
  if (metaData) {
    attrs.metaData = metaData;
  }

  const inner = create().ele('ItemGroupQueryRq', attrs);
  const normalizedFilterName = normalizeLookupText(nameFilter && nameFilter.name);
  const isMetaDataOnly = metaData === 'MetaDataOnly';

  inner.ele('ActiveStatus').txt('All');

  if (!isMetaDataOnly && normalizedFilterName) {
    const filter = inner.ele('NameFilter');
    filter.ele('MatchCriterion').txt(nameFilter.matchCriterion || 'StartsWith');
    filter.ele('Name').txt(normalizedFilterName);
  }

  inner.up();
  return wrapRq(inner);
}

function itemGroupProductsQuery({ itemId, requestId } = {}) {
  if (!itemId) {
    throw new Error('itemId is required');
  }

  const inner = create().ele('ItemQueryRq', { requestID: resolveRequestId(requestId, 'item-group-products-query-1') });
  inner.ele('ListID').txt(String(itemId));

  // Intentionally do not use IncludeRetElement here so QB returns full ItemGroupLineRet data.
  inner.up();
  return wrapRq(inner);
}

function itemInventoryAssemblyComponentsQuery({ itemId, requestId } = {}) {
  if (!itemId) {
    throw new Error('itemId is required');
  }

  const inner = create().ele('ItemInventoryAssemblyQueryRq', {
    requestID: resolveRequestId(requestId, 'item-assembly-components-query-1')
  });
  inner.ele('ListID').txt(String(itemId));

  // Intentionally do not use IncludeRetElement here so QB returns full assembly line data.
  inner.up();
  return wrapRq(inner);
}

// Note: ItemInventoryQueryRq only returns regular inventory items (ItemInventoryRet).
// Assembly items (ItemInventoryAssembly) require a separate ItemInventoryAssemblyQueryRq,
// so this query already filters out assemblies by design.
function itemInventoryQuery({ listId, name, maxReturned = 100, iteratorAction, iteratorId, requestId } = {}) {
  const attrs = { requestID: resolveRequestId(requestId, 'item-inventory-query-1') };
  if (iteratorAction) {
    attrs.iterator = iteratorAction;
  }
  if (iteratorId) {
    attrs.iteratorID = iteratorId;
  }

  const inner = create().ele('ItemInventoryQueryRq', attrs);

  const normalizedName = normalizeLookupText(name);

  if (listId) {
    inner.ele('ListID').txt(String(listId));
  } else if (normalizedName) {
    inner.ele('FullName').txt(normalizedName);
  } else {
    inner.ele('MaxReturned').txt(String(maxReturned));
    inner.ele('ActiveStatus').txt('ActiveOnly');
  }

  inner.ele('IncludeRetElement').txt('ListID');
  inner.ele('IncludeRetElement').txt('Name');
  inner.ele('IncludeRetElement').txt('FullName');
  inner.ele('IncludeRetElement').txt('IsActive');
  inner.ele('IncludeRetElement').txt('QuantityOnHand');
  inner.ele('IncludeRetElement').txt('QuantityOnOrder');
  inner.ele('IncludeRetElement').txt('QuantityOnSalesOrder');

  inner.up();
  return wrapRq(inner);
}

function itemAdd({ type = 'Service', name, description, price, account, requestId }) {
  if (!name) throw new Error('Item name is required');
  
  const validTypes = ['Service', 'NonInventory', 'Inventory'];
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid type: ${type}. Use: Service, NonInventory, or Inventory`);
  }

  // Keep reference to root document
  const root = create();
  const req = root.ele(`Item${type}AddRq`, { requestID: resolveRequestId(requestId, 'item-1') });
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

function customerAdd({ fullName, email, phone, requestId }) {
  const inner = create().ele('CustomerAddRq', { requestID: resolveRequestId(requestId, 'cust-1') })
    .ele('CustomerAdd')
      .ele('Name').txt(fullName).up()
      .ele('Phone').txt(phone || '').up()
      .ele('Email').txt(email || '').up()
    .up().up();
  return wrapRq(inner);
}

// ========== INVOICE OPERATIONS ==========

function invoiceQuery({
  maxReturned = 20,
  txnId,
  depositToAccountName,
  customerName,
  txnDateStart,
  txnDateEnd,
  iteratorAction,
  iteratorId,
  requestId
} = {}) {
  const attrs = { requestID: resolveRequestId(requestId, 'invoice-query-1') };
  if (iteratorAction) {
    attrs.iterator = iteratorAction;
  }
  if (iteratorId) {
    attrs.iteratorID = iteratorId;
  }

  const inner = create().ele('InvoiceQueryRq', attrs);

  if (txnId) {
    inner.ele('TxnID').txt(String(txnId));
  } else {
    // Add MaxReturned
    inner.ele('MaxReturned').txt(String(maxReturned));
  }

  if (!txnId && (txnDateStart || txnDateEnd)) {
    const dateRange = inner.ele('ORDateRangeFilter').ele('TxnDateRangeFilter');
    if (txnDateStart) {
      dateRange.ele('FromTxnDate').txt(txnDateStart);
    }
    if (txnDateEnd) {
      dateRange.ele('ToTxnDate').txt(txnDateEnd);
    }
  }
  
  // Add optional filters via metadata
  // Filtering by DepositToAccountRef happens in response parsing
  
  // Request all fields so we can filter client-side
  inner.ele('IncludeRetElement').txt('TxnID');
  inner.ele('IncludeRetElement').txt('EditSequence');
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

function invoiceAdd({ customer, txnDate, refNumber, memo, lineItems, billTo, shipTo, requestId }) {
  if (!customer || (!customer.listId && !customer.fullName)) {
    throw new Error('Customer reference (listId or fullName) is required');
  }
  
  if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
    throw new Error('At least one line item is required');
  }

  const root = create();
  const req = root.ele('InvoiceAddRq', { requestID: resolveRequestId(requestId, 'invoice-1') });
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
  
  addAddress(add, 'BillAddress', billTo);
  addAddress(add, 'ShipAddress', shipTo);
  
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

    // Optional line-level sales tax code
    // - line.salesTaxCode / line.taxCode: string or { listId/fullName }
    // - line.taxable false-like values default to QuickBooks "Non"
    const rawSalesTaxCode = line.salesTaxCode ?? line.taxCode ?? null;
    const normalizedSalesTaxCode = typeof rawSalesTaxCode === 'string'
      ? { fullName: rawSalesTaxCode.trim() }
      : rawSalesTaxCode;
    const isNonTaxable =
      line.taxable === false ||
      line.taxable === 'false' ||
      line.taxable === 0 ||
      line.taxable === '0';

    if (normalizedSalesTaxCode && (normalizedSalesTaxCode.listId || normalizedSalesTaxCode.fullName)) {
      const taxCodeRef = lineAdd.ele('SalesTaxCodeRef');
      if (normalizedSalesTaxCode.listId) {
        taxCodeRef.ele('ListID').txt(normalizedSalesTaxCode.listId);
      } else {
        taxCodeRef.ele('FullName').txt(normalizedSalesTaxCode.fullName);
      }
    } else if (isNonTaxable) {
      lineAdd.ele('SalesTaxCodeRef').ele('FullName').txt('Non');
    }
  });

  return wrapRq(root);
}

function addAddress(parent, elementName, address) {
  if (!address) return;

  if (typeof address !== 'object' || Array.isArray(address)) {
    throw new Error(`${elementName} must be an address object`);
  }

  const fields = [
    ['address1', 'Addr1'],
    ['address2', 'Addr2'],
    ['address3', 'Addr3'],
    ['address4', 'Addr4'],
    ['address5', 'Addr5'],
    ['city', 'City'],
    ['state', 'State'],
    ['postalCode', 'PostalCode'],
    ['country', 'Country'],
    ['note', 'Note']
  ].filter(([key]) => address[key] !== undefined && address[key] !== null && String(address[key]) !== '');

  if (fields.length === 0) {
    throw new Error(`${elementName} must include at least one address field`);
  }

  const addr = parent.ele(elementName);
  fields.forEach(([key, tag]) => {
    addr.ele(tag).txt(String(address[key]));
  });
}

function addRef(parent, elementName, ref) {
  if (!ref || (!ref.listId && !ref.fullName)) return;

  const refNode = parent.ele(elementName);
  if (ref.listId) {
    refNode.ele('ListID').txt(ref.listId);
  } else {
    refNode.ele('FullName').txt(ref.fullName);
  }
}

function addLineTaxCode(parent, line) {
  const rawSalesTaxCode = line.salesTaxCode ?? line.taxCode ?? null;
  const normalizedSalesTaxCode = typeof rawSalesTaxCode === 'string'
    ? { fullName: rawSalesTaxCode.trim() }
    : rawSalesTaxCode;
  const isNonTaxable =
    line.taxable === false ||
    line.taxable === 'false' ||
    line.taxable === 0 ||
    line.taxable === '0';

  if (normalizedSalesTaxCode && (normalizedSalesTaxCode.listId || normalizedSalesTaxCode.fullName)) {
    addRef(parent, 'SalesTaxCodeRef', normalizedSalesTaxCode);
  } else if (isNonTaxable) {
    parent.ele('SalesTaxCodeRef').ele('FullName').txt('Non');
  }
}

function invoiceMod({
  txnId,
  editSequence,
  customer,
  txnDate,
  refNumber,
  memo,
  lineItems,
  billTo,
  shipTo,
  requestId
}) {
  if (!txnId) {
    throw new Error('txnId is required');
  }

  if (!editSequence) {
    throw new Error('editSequence is required');
  }

  const root = create();
  const req = root.ele('InvoiceModRq', { requestID: resolveRequestId(requestId, 'invoice-mod-1') });
  const mod = req.ele('InvoiceMod');

  mod.ele('TxnID').txt(txnId);
  mod.ele('EditSequence').txt(editSequence);

  addRef(mod, 'CustomerRef', customer);

  if (txnDate) {
    mod.ele('TxnDate').txt(txnDate);
  }

  if (refNumber !== undefined && refNumber !== null) {
    mod.ele('RefNumber').txt(String(refNumber));
  }

  addAddress(mod, 'BillAddress', billTo);
  addAddress(mod, 'ShipAddress', shipTo);

  if (memo !== undefined && memo !== null) {
    mod.ele('Memo').txt(String(memo));
  }

  if (Array.isArray(lineItems)) {
    lineItems.forEach((line, index) => {
      const lineMod = mod.ele('InvoiceLineMod');
      const txnLineId = line.txnLineId || line.txnLineID || '-1';
      lineMod.ele('TxnLineID').txt(String(txnLineId));

      if (line.item) {
        addRef(lineMod, 'ItemRef', line.item);
      } else if (txnLineId === '-1') {
        throw new Error(`Line item ${index + 1}: item reference is required for new invoice lines`);
      }

      if (line.description !== undefined && line.description !== null) {
        lineMod.ele('Desc').txt(String(line.description));
      }

      if (line.quantity !== undefined && line.quantity !== null) {
        lineMod.ele('Quantity').txt(String(line.quantity));
      }

      if (line.amount !== undefined && line.amount !== null) {
        lineMod.ele('Amount').txt(Number(line.amount).toFixed(2));
      } else if (line.rate !== undefined && line.rate !== null) {
        lineMod.ele('Rate').txt(Number(line.rate).toFixed(2));
      }

      addLineTaxCode(lineMod, line);
    });
  }

  return wrapRq(root);
}

function receivePaymentAdd({
  customer,
  arAccount,
  txnDate,
  refNumber,
  totalAmount,
  paymentMethod,
  memo,
  depositToAccount,
  appliedTo,
  requestId
}) {
  if (!customer || (!customer.listId && !customer.fullName)) {
    throw new Error('Customer reference (listId or fullName) is required');
  }

  if (!Array.isArray(appliedTo) || appliedTo.length === 0) {
    throw new Error('At least one applied transaction is required');
  }

  const root = create();
  const req = root.ele('ReceivePaymentAddRq', { requestID: resolveRequestId(requestId, 'receive-payment-1') });
  const add = req.ele('ReceivePaymentAdd');

  addRef(add, 'CustomerRef', customer);
  addRef(add, 'ARAccountRef', arAccount);

  if (txnDate) {
    add.ele('TxnDate').txt(txnDate);
  }

  if (refNumber !== undefined && refNumber !== null && String(refNumber) !== '') {
    add.ele('RefNumber').txt(String(refNumber));
  }

  if (totalAmount !== undefined && totalAmount !== null) {
    add.ele('TotalAmount').txt(Number(totalAmount).toFixed(2));
  }

  addRef(add, 'PaymentMethodRef', paymentMethod);

  if (memo) {
    add.ele('Memo').txt(String(memo));
  }

  addRef(add, 'DepositToAccountRef', depositToAccount);

  appliedTo.forEach((application, index) => {
    if (!application || !application.txnId) {
      throw new Error(`Applied transaction ${index + 1}: txnId is required`);
    }

    const appliedNode = add.ele('AppliedToTxnAdd');
    appliedNode.ele('TxnID').txt(String(application.txnId));

    if (application.paymentAmount !== undefined && application.paymentAmount !== null) {
      appliedNode.ele('PaymentAmount').txt(Number(application.paymentAmount).toFixed(2));
    }
  });

  return wrapRq(root);
}





module.exports = { 
  customerQuery,
  itemQuery,
  itemGroupQuery,
  itemGroupProductsQuery,
  itemInventoryAssemblyComponentsQuery,
  itemInventoryQuery,
  itemAdd,
  customerAdd,
  invoiceQuery,
  invoiceAdd,
  invoiceMod,
  receivePaymentAdd
};
