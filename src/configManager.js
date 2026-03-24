'use strict';
const fs   = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'scoring-config.json');

// ─── Default scoring config ───────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  companySize: [
    { label: '> 500 employees',   minEmployees: 501, maxEmployees: null, score: 35 },
    { label: '250–500 employees', minEmployees: 250, maxEmployees: 500,  score: 25 },
    { label: '50–249 employees',  minEmployees: 50,  maxEmployees: 249,  score: 15 },
    { label: '< 50 employees',    minEmployees: 0,   maxEmployees: 49,   score: 5  }
  ],
  geography: {
    tier1: {
      score: 35,
      countries: [
        'United States', 'US', 'USA', 'U.S.', 'U.S.A.',
        'Canada', 'CA',
        'United Kingdom', 'UK', 'GB', 'Great Britain',
        'England', 'Scotland', 'Wales', 'Northern Ireland'
      ]
    },
    tier2: {
      score: 25,
      countries: [
        'Germany', 'France', 'Spain', 'Italy', 'Netherlands', 'Belgium',
        'Sweden', 'Norway', 'Denmark', 'Finland', 'Poland', 'Czech Republic',
        'Austria', 'Switzerland', 'Portugal', 'Greece', 'Hungary', 'Romania',
        'Bulgaria', 'Croatia', 'Slovakia', 'Slovenia', 'Estonia', 'Latvia',
        'Lithuania', 'Luxembourg', 'Malta', 'Cyprus', 'Ireland', 'Iceland',
        'Australia', 'India'
      ]
    },
    other: { score: 10 }
  },
  industry: {
    tier1: {
      score: 10,
      keywords: [
        'computer software', 'software', 'information technology',
        'it services', 'it consulting', 'technology', 'saas', 'tech'
      ]
    },
    tier2: {
      score: 8,
      keywords: [
        'financial services', 'finance', 'banking', 'insurance',
        'marketing', 'advertising', 'digital marketing',
        'hospital', 'health care', 'healthcare', 'medical', 'pharma', 'biotech'
      ]
    },
    tier3: {
      score: 6,
      keywords: [
        'education', 'e-learning', 'elearning', 'higher education',
        'university', 'school', 'academic', 'training'
      ]
    },
    other: { score: 4 }
  },
  technology: {
    // Scored by Destination Cloud (type_of_destination / destination_cloud)
    tier1: {
      score: 10,
      keywords: [
        'office 365', 'microsoft 365', 'm365', 'o365',
        'google workspace', 'g suite', 'gsuite'
      ]
    },
    tier2: {
      score: 8,
      keywords: ['teams', 'microsoft teams']
    },
    tier3: {
      score: 5,
      keywords: [
        'others', 'other', 'cloud', 'aws', 'azure', 'gcp',
        'onedrive', 'sharepoint', 'salesforce'
      ]
    },
    none: { score: 0 }
  },
  buyerFit: {
    tier1: {
      score: 10,
      keywords: [
        'cio', 'chief information officer',
        'cto', 'chief technology officer',
        'ceo', 'chief executive',
        'it director', 'director of it', 'head of it',
        'vp of it', 'vp it', 'vice president of it',
        'head of technology', 'vp of technology'
      ]
    },
    tier2: {
      score: 7,
      keywords: [
        'it manager', 'it admin', 'it administrator',
        'systems administrator', 'sysadmin', 'sys admin',
        'network administrator', 'infrastructure manager',
        'it specialist', 'it lead', 'it supervisor'
      ]
    },
    tier3: {
      score: 5,
      keywords: ['consultant', 'consulting', 'advisor', 'strategist']
    },
    other: { score: 0 }
  },
  categories: [
    { label: 'Core ICP',     priority: 'Highest Priority', min: 80, max: 100 },
    { label: 'Strong ICP',   priority: 'High Priority',    min: 65, max: 79  },
    { label: 'Moderate ICP', priority: 'Nurture',          min: 50, max: 64  },
    { label: 'Non ICP',      priority: 'Low Priority',     min: 0,  max: 49  }
  ]
};

// ─── Public API ───────────────────────────────────────────────────────────────

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {
    console.warn('[configManager] Failed to load config, using defaults:', e.message);
  }
  return deepClone(DEFAULT_CONFIG);
}

function saveConfig(config) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

function getDefaultConfig() {
  return deepClone(DEFAULT_CONFIG);
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

module.exports = { loadConfig, saveConfig, getDefaultConfig };
