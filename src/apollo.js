'use strict';

/**
 * Apollo.io API integration — enrich leads by email & company name.
 *
 * Endpoints used:
 *   POST https://api.apollo.io/api/v1/people/match   — enrich a person by email
 *   POST https://api.apollo.io/api/v1/organizations/enrich — enrich org by domain/name
 */

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

function getApiKey() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY is not configured. Add it to your .env file.');
  return key;
}

/**
 * Enrich a single person by email.
 * Returns enriched fields or null if not found.
 */
async function enrichPerson(email) {
  const apiKey = getApiKey();

  const res = await fetch(`${APOLLO_BASE}/people/match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey
    },
    body: JSON.stringify({
      email: email
    })
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Apollo people/match failed for ${email}: ${res.status} ${text}`);
    return null;
  }

  const data = await res.json();
  const person = data.person;
  if (!person) return null;

  const org = person.organization || {};

  return {
    // Person fields
    name:              [person.first_name, person.last_name].filter(Boolean).join(' ') || null,
    firstName:         person.first_name || null,
    lastName:          person.last_name || null,
    jobTitle:          person.title || null,
    phone:             person.phone_numbers?.[0]?.sanitized_number || person.phone_number?.sanitized_number || null,
    linkedinUrl:       person.linkedin_url || null,
    city:              person.city || null,
    state:             person.state || null,
    country:           person.country || null,

    // Organization fields
    companyName:       org.name || null,
    companyDomain:     org.primary_domain || org.website_url || null,
    industry:          org.industry || null,
    numberOfEmployees: org.estimated_num_employees || null,
    annualRevenue:     org.annual_revenue_printed || null,
    companyCity:       org.city || null,
    companyState:      org.state || null,
    companyCountry:    org.country || null,
    techStack:         (org.current_technologies || []).map(t => t.name).join(', ') || null,
    companyLinkedin:   org.linkedin_url || null,
    companyPhone:      org.phone || null,
    keywords:          (org.keywords || []).join(', ') || null,
    fundingStage:      org.latest_funding_stage || null,
    totalFunding:      org.total_funding_printed || null
  };
}

/**
 * Enrich a single organization by name or domain.
 */
async function enrichOrganization(companyNameOrDomain) {
  const apiKey = getApiKey();

  const body = {};
  // If it looks like a domain, use domain field; otherwise use name
  if (companyNameOrDomain.includes('.')) {
    body.domain = companyNameOrDomain;
  } else {
    body.organization_name = companyNameOrDomain;
  }

  const res = await fetch(`${APOLLO_BASE}/organizations/enrich`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    console.error(`Apollo org enrich failed for ${companyNameOrDomain}: ${res.status}`);
    return null;
  }

  const data = await res.json();
  const org = data.organization;
  if (!org) return null;

  return {
    companyName:       org.name || null,
    companyDomain:     org.primary_domain || org.website_url || null,
    industry:          org.industry || null,
    numberOfEmployees: org.estimated_num_employees || null,
    annualRevenue:     org.annual_revenue_printed || null,
    companyCountry:    org.country || null,
    techStack:         (org.current_technologies || []).map(t => t.name).join(', ') || null,
    keywords:          (org.keywords || []).join(', ') || null,
    fundingStage:      org.latest_funding_stage || null,
    totalFunding:      org.total_funding_printed || null
  };
}

/**
 * Enrich a batch of leads. Each lead should have at least { email } or { companyName }.
 * Returns the same leads with Apollo data merged in.
 *
 * @param {Array} leads  — array of lead objects from file parser
 * @param {Function} onProgress — optional callback(enrichedCount, totalCount)
 * @returns {Array} enriched leads
 */
async function enrichLeads(leads, onProgress) {
  const results = [];
  const total = leads.length;
  let enrichedCount = 0;

  for (const lead of leads) {
    let enriched = { ...lead, _enriched: false };

    console.log(`[Apollo] Enriching lead #${enrichedCount + 1}/${total}: email=${lead.email || 'N/A'}, company=${lead.companyName || 'N/A'}`);

    try {
      // Strategy 1: If we have email, use people/match (gives person + org data)
      if (lead.email) {
        const personData = await enrichPerson(lead.email);
        if (personData) {
          // Merge: Apollo data fills in missing fields, doesn't overwrite existing
          enriched = mergeLead(lead, personData);
          enriched._enriched = true;
        }
      }

      // Strategy 2: If no email enrichment worked but we have company name, enrich the org
      if (!enriched._enriched && lead.companyName) {
        const orgData = await enrichOrganization(lead.companyName);
        if (orgData) {
          enriched = mergeLead(lead, orgData);
          enriched._enriched = true;
        }
      }
    } catch (err) {
      console.error(`Enrichment error for ${lead.email || lead.companyName}:`, err.message);
    }

    results.push(enriched);
    enrichedCount++;

    console.log(`[Apollo] Lead #${enrichedCount}: enriched=${enriched._enriched}, name=${enriched.name || 'N/A'}, title=${enriched.jobTitle || 'N/A'}, employees=${enriched.numberOfEmployees || 'N/A'}, country=${enriched.country || 'N/A'}`);

    if (onProgress) onProgress(enrichedCount, total);

    // Rate limiting: Apollo free tier = ~5 req/min, paid = higher
    // Small delay to be respectful
    if (enrichedCount < total) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return results;
}

/**
 * Merge Apollo data into a lead object.
 * Apollo fills in blanks — does NOT overwrite data that's already present in the lead.
 */
function mergeLead(original, apolloData) {
  const merged = { ...original };

  for (const [key, value] of Object.entries(apolloData)) {
    // Only fill in if the original doesn't already have this field
    if (value != null && value !== '' && (merged[key] == null || merged[key] === '')) {
      merged[key] = value;
    }
  }

  return merged;
}

module.exports = {
  enrichPerson,
  enrichOrganization,
  enrichLeads,
  getApiKey
};
