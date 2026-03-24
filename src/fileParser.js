'use strict';

const XLSX = require('xlsx');

// ── Column name aliases → standard lead field mapping ────────────────────────
const FIELD_ALIASES = {
  name:              ['name', 'full name', 'fullname', 'contact name', 'contact', 'lead name', 'person name', 'contact person'],
  email:             ['email', 'email address', 'e-mail', 'emailaddress', 'mail', 'email id', 'emailid', 'person email', 'contact email', 'work email', 'business email', 'corporate email', 'primary email'],
  jobTitle:          ['job title', 'jobtitle', 'title', 'role', 'position', 'designation', 'job role', 'person title', 'contact title'],
  companyName:       ['company', 'company name', 'companyname', 'organisation', 'organization', 'org', 'account', 'account name', 'firm', 'business name', 'employer', 'company  name'],
  numberOfEmployees: ['employees', 'number of employees', 'numberofemployees', 'employee count', 'company size', 'headcount', 'num employees', 'no of employees', 'employee size', 'team size', 'staff count', 'of employees'],
  country:           ['country', 'location', 'region', 'geography', 'geo', 'nation', 'person country', 'company country', 'hq country'],
  industry:          ['industry', 'sector', 'vertical', 'business type', 'company industry'],
  techStack:         ['tech stack', 'techstack', 'technology', 'technologies', 'tools', 'software', 'tech'],
  phone:             ['phone', 'phone number', 'phonenumber', 'telephone', 'tel', 'mobile', 'cell', 'direct phone', 'work phone', 'contact number', 'mobile number', 'phone no'],
  leadStatus:        ['lead status', 'leadstatus', 'status', 'stage'],
  linkedinUrl:       ['linkedin', 'linkedin url', 'linkedin profile', 'person linkedin url', 'linkedin link'],
  website:           ['website', 'domain', 'company domain', 'url', 'web', 'company website', 'website url'],
  createdDate:       ['created date', 'createddate', 'create date', 'date created', 'date', 'created at', 'createdat', 'creation date', 'created', 'lead date', 'date added', 'added date', 'signup date', 'registered date']
};

/**
 * Normalise a header string for matching.
 * Collapses whitespace, strips non-alphanumeric, lowercases.
 */
function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Check if a header matches a field by:
 * 1. Exact alias match
 * 2. Header contains an alias as substring (e.g. "Person Email Address" matches "email address")
 * 3. Alias contains the header as substring (e.g. header "email" matches alias "email address")
 */
function findFieldMatch(headerNorm) {
  // Pass 1: exact match
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.includes(headerNorm)) return field;
  }

  // Pass 2: header contains alias OR alias contains header (min 3 chars to avoid false positives)
  if (headerNorm.length >= 3) {
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      for (const alias of aliases) {
        if (headerNorm.includes(alias) || (alias.length >= 5 && alias.includes(headerNorm))) {
          return field;
        }
      }
    }
  }

  // Pass 3: detect email columns by checking if header has 'email' or 'mail' anywhere
  if (headerNorm.includes('email') || headerNorm.includes('mail')) return 'email';
  if (headerNorm.includes('phone') || headerNorm.includes('mobile')) return 'phone';
  if (headerNorm.includes('company') || headerNorm.includes('organization')) return 'companyName';
  if (headerNorm.includes('country')) return 'country';
  if (headerNorm.includes('industry')) return 'industry';
  if (headerNorm.includes('employee')) return 'numberOfEmployees';
  if (headerNorm.includes('linkedin')) return 'linkedinUrl';
  if (headerNorm.includes('title') && !headerNorm.includes('company')) return 'jobTitle';
  if (headerNorm.includes('date') || headerNorm.includes('created')) return 'createdDate';

  return null;
}

/**
 * Build a map: { actualColumnHeader → leadFieldName }
 */
function buildColumnMap(headers) {
  const map = {};
  const usedFields = new Set(); // avoid mapping two columns to the same field

  for (const header of headers) {
    const h = norm(header);
    const field = findFieldMatch(h);
    if (field && !usedFields.has(field)) {
      map[header] = field;
      usedFields.add(field);
    }
  }

  console.log('[fileParser] Column mapping:', JSON.stringify(map, null, 2));
  console.log('[fileParser] Unmapped headers:', headers.filter(h => !map[h]));

  return map;
}

/**
 * If there's no 'name' column but there are 'first name' + 'last name', merge them.
 */
function handleNameColumns(headers, rows) {
  const hn = headers.map(norm);
  const firstIdx = hn.findIndex(h => ['first name', 'firstname', 'first'].includes(h));
  const lastIdx  = hn.findIndex(h => ['last name', 'lastname', 'last', 'surname'].includes(h));

  if (firstIdx === -1 && lastIdx === -1) return;

  // Only merge if there's no explicit "name" column already
  const nameIdx = hn.findIndex(h => FIELD_ALIASES.name.includes(h));
  if (nameIdx !== -1) return;

  // Add a synthetic "name" header
  headers.push('name');
  for (const row of rows) {
    const first = (row[headers[firstIdx]] || '').trim();
    const last  = (row[headers[lastIdx]]  || '').trim();
    row['name'] = `${first} ${last}`.trim();
  }
}

/**
 * Parse a CSV / XLS / XLSX buffer and return an array of lead objects.
 *
 * @param {Buffer} buffer   – file contents
 * @param {string} filename – original file name (used to detect format)
 * @returns {Array<Object>}
 */
function parseLeadsFile(buffer, filename = 'file.csv') {
  const ext = (filename.split('.').pop() || '').toLowerCase();

  // Read workbook from buffer
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    codepage: 65001  // UTF-8
  });

  // Use the first sheet
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The file contains no sheets.');

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (!rawRows.length) throw new Error('The file is empty — no data rows found.');

  const headers = Object.keys(rawRows[0]);

  // Handle first/last name merge
  handleNameColumns(headers, rawRows);

  // Build column mapping
  const colMap = buildColumnMap(headers);

  // Check that at least email or name is mapped
  const mappedFields = new Set(Object.values(colMap));
  if (!mappedFields.has('email') && !mappedFields.has('name')) {
    throw new Error(
      'Could not identify an "Email" or "Name" column in your file. ' +
      'Please ensure your headers include at least one of: ' +
      FIELD_ALIASES.email.concat(FIELD_ALIASES.name).join(', ')
    );
  }

  // Convert rows to standard lead objects
  const leads = rawRows.map(row => {
    const lead = {};
    for (const [colHeader, fieldName] of Object.entries(colMap)) {
      let val = row[colHeader];
      if (val === undefined || val === null) val = '';
      val = String(val).trim();

      // numberOfEmployees → parse as integer
      if (fieldName === 'numberOfEmployees') {
        const n = parseInt(val.replace(/,/g, ''), 10);
        lead[fieldName] = isNaN(n) ? null : n;
      } else if (fieldName === 'createdDate') {
        // Try to parse date; XLSX may give us a Date object or string
        let rawVal = row[colHeader];
        if (rawVal instanceof Date && !isNaN(rawVal)) {
          lead[fieldName] = rawVal.toISOString().split('T')[0];
        } else if (val) {
          // Attempt common date formats
          const d = new Date(val);
          lead[fieldName] = (!isNaN(d)) ? d.toISOString().split('T')[0] : val;
        } else {
          lead[fieldName] = null;
        }
      } else {
        lead[fieldName] = val || null;
      }
    }
    return lead;
  });

  // Filter out rows that are completely empty
  const validLeads = leads.filter(l =>
    l.email || l.name || l.companyName || l.jobTitle
  );

  if (!validLeads.length) {
    throw new Error('No valid leads found in the file. All rows appear to be empty.');
  }

  return validLeads;
}

module.exports = { parseLeadsFile };
