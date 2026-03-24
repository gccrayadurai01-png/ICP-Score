'use strict';
const { loadConfig } = require('./configManager');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalise(str) {
  return (str || '').toLowerCase().trim();
}

function matchesAny(value, keywords) {
  const v = normalise(value);
  if (!v) return false;
  return keywords.some(kw => v.includes(normalise(kw)));
}

// ─── 1. Company Size (max configurable, default 35) ──────────────────────────
function scoreCompanySize(employees, config) {
  const n = parseInt(employees, 10);
  if (isNaN(n)) return 0;
  for (const tier of config.companySize) {
    const ok = n >= tier.minEmployees && (tier.maxEmployees === null || n <= tier.maxEmployees);
    if (ok) return tier.score;
  }
  return 0;
}

// ─── 2. Geography (max configurable, default 35) ─────────────────────────────
function scoreGeography(country, config) {
  const c = normalise(country);
  if (!c) return 0;
  const { tier1, tier2, other } = config.geography;
  if (tier1.countries.some(ct => normalise(ct) === c)) return tier1.score;
  if (tier2.countries.some(ct => normalise(ct) === c)) return tier2.score;
  return other.score;
}

// ─── 3. Industry (max configurable, default 10) ──────────────────────────────
function scoreIndustry(industry, config) {
  const { tier1, tier2, tier3, other } = config.industry;
  if (!industry) return other.score;
  if (matchesAny(industry, tier1.keywords)) return tier1.score;
  if (matchesAny(industry, tier2.keywords)) return tier2.score;
  if (matchesAny(industry, tier3.keywords)) return tier3.score;
  return other.score;
}

// ─── 4. Technology (max configurable, default 10) ────────────────────────────
function scoreTechnology(techStack, config) {
  const { tier1, tier2, tier3, none } = config.technology;
  if (!techStack) return none.score;
  if (matchesAny(techStack, tier1.keywords)) return tier1.score;
  if (matchesAny(techStack, tier2.keywords)) return tier2.score;
  if (matchesAny(techStack, tier3.keywords)) return tier3.score;
  return none.score;
}

// ─── 5. Buyer Fit (max configurable, default 10) ─────────────────────────────
function scoreBuyerFit(jobTitle, config) {
  const { tier1, tier2, tier3, other } = config.buyerFit;
  if (!jobTitle) return other.score;
  if (matchesAny(jobTitle, tier1.keywords)) return tier1.score;
  if (matchesAny(jobTitle, tier2.keywords)) return tier2.score;
  if (matchesAny(jobTitle, tier3.keywords)) return tier3.score;
  return other.score;
}

// ─── Category ─────────────────────────────────────────────────────────────────
function getCategory(score, config) {
  for (const cat of config.categories) {
    if (score >= cat.min && score <= cat.max) return cat;
  }
  return config.categories[config.categories.length - 1];
}

// ─── Score a HubSpot contact ─────────────────────────────────────────────────
function scoreContact(contactProps, companyProps = {}) {
  const config    = loadConfig();
  const techField = process.env.TECH_STACK_FIELD || 'technologies';

  const employees = companyProps.numberofemployees || null;
  const country   = companyProps.country || contactProps.country || null;
  const industry  = companyProps.industry || null;
  const techStack = companyProps[techField] || companyProps.technologies || null;
  const jobTitle  = contactProps.jobtitle || null;

  const breakdown = {
    companySize: scoreCompanySize(employees, config),
    geography:   scoreGeography(country, config),
    industry:    scoreIndustry(industry, config),
    technology:  scoreTechnology(techStack, config),
    buyerFit:    scoreBuyerFit(jobTitle, config)
  };

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const cat   = getCategory(score, config);

  return {
    score,
    category:  cat.label,
    priority:  cat.priority,
    breakdown,
    inputs: { employees, country, industry, techStack, jobTitle }
  };
}

// ─── Score a PDF-extracted lead ───────────────────────────────────────────────
function scoreExtractedLead(lead, config) {
  const cfg = config || loadConfig();

  const breakdown = {
    companySize: scoreCompanySize(lead.numberOfEmployees, cfg),
    geography:   scoreGeography(lead.country, cfg),
    industry:    scoreIndustry(lead.industry, cfg),
    technology:  scoreTechnology(lead.techStack, cfg),
    buyerFit:    scoreBuyerFit(lead.jobTitle, cfg)
  };

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const cat   = getCategory(score, cfg);

  return {
    ...lead,
    score,
    category:  cat.label,
    priority:  cat.priority,
    breakdown
  };
}

module.exports = {
  scoreContact,
  scoreExtractedLead,
  scoreCompanySize,
  scoreGeography,
  scoreIndustry,
  scoreTechnology,
  scoreBuyerFit,
  getCategory
};
