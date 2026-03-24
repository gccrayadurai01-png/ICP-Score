'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR  = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'rep-store.json');

// ── Default store structure ──────────────────────────────────────────────────
function getDefaultStore() {
  return {
    reps:             [],   // { id, name, email, teamId, createdAt }
    teams:            [],   // { id, name, createdAt }
    uploads:          [],   // { id, repId, repName, teamId, teamName, filename, uploadedAt, leadCount, enrichedCount, stats:{}, leads:[] }
    hubspotLeads:     [],   // scored contacts pulled from HubSpot, keyed by hubspotId
    lastHubspotSync:  null  // ISO timestamp of last sync
  };
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadStore() {
  ensureDir();
  try {
    if (fs.existsSync(STORE_FILE)) {
      return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Failed to load rep store:', err.message);
  }
  return getDefaultStore();
}

function saveStore(store) {
  ensureDir();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ══════════════════════════════════════════════════════════════════════════════
//  TEAMS
// ══════════════════════════════════════════════════════════════════════════════

function getTeams() {
  return loadStore().teams;
}

function createTeam(name) {
  const store = loadStore();
  const team = { id: genId(), name: name.trim(), createdAt: new Date().toISOString() };
  store.teams.push(team);
  saveStore(store);
  return team;
}

function deleteTeam(teamId) {
  const store = loadStore();
  store.teams = store.teams.filter(t => t.id !== teamId);
  // Remove team assignment from reps
  store.reps.forEach(r => { if (r.teamId === teamId) r.teamId = null; });
  saveStore(store);
}

// ══════════════════════════════════════════════════════════════════════════════
//  REPS
// ══════════════════════════════════════════════════════════════════════════════

function getReps() {
  const store = loadStore();
  return store.reps.map(r => ({
    ...r,
    teamName: store.teams.find(t => t.id === r.teamId)?.name || null
  }));
}

function createRep({ name, email, teamId }) {
  const store = loadStore();
  const rep = {
    id: genId(),
    name: (name || '').trim(),
    email: (email || '').trim(),
    teamId: teamId || null,
    createdAt: new Date().toISOString()
  };
  store.reps.push(rep);
  saveStore(store);
  return rep;
}

function updateRep(repId, updates) {
  const store = loadStore();
  const rep = store.reps.find(r => r.id === repId);
  if (!rep) throw new Error('Rep not found');
  if (updates.name !== undefined) rep.name = updates.name.trim();
  if (updates.email !== undefined) rep.email = updates.email.trim();
  if (updates.teamId !== undefined) rep.teamId = updates.teamId || null;
  saveStore(store);
  return rep;
}

function deleteRep(repId) {
  const store = loadStore();
  store.reps = store.reps.filter(r => r.id !== repId);
  saveStore(store);
}

// ══════════════════════════════════════════════════════════════════════════════
//  UPLOADS (one per file upload per rep)
// ══════════════════════════════════════════════════════════════════════════════

function saveUpload({ repId, filename, leads, enrichStats, categoryStats }) {
  const store = loadStore();
  const rep = store.reps.find(r => r.id === repId);
  const team = rep?.teamId ? store.teams.find(t => t.id === rep.teamId) : null;

  const upload = {
    id: genId(),
    repId:         repId,
    repName:       rep?.name || 'Unknown',
    teamId:        rep?.teamId || null,
    teamName:      team?.name || null,
    filename:      filename,
    uploadedAt:    new Date().toISOString(),
    leadCount:     leads.length,
    enrichedCount: enrichStats?.enriched || 0,
    stats:         categoryStats || {},
    leads:         leads.map(l => ({
      name:              l.name || null,
      email:             l.email || null,
      companyName:       l.companyName || null,
      jobTitle:          l.jobTitle || null,
      numberOfEmployees: l.numberOfEmployees || null,
      country:           l.country || null,
      industry:          l.industry || null,
      techStack:         l.techStack || null,
      phone:             l.phone || null,
      score:             l.score ?? null,
      category:          l.category || null,
      priority:          l.priority || null,
      createdDate:       l.createdDate || null
    }))
  };

  store.uploads.push(upload);
  saveStore(store);
  return upload;
}

function getUploads({ repId, teamId, from, to } = {}) {
  const store = loadStore();
  let uploads = store.uploads;

  if (repId)  uploads = uploads.filter(u => u.repId === repId);
  if (teamId) uploads = uploads.filter(u => u.teamId === teamId);
  if (from)   uploads = uploads.filter(u => u.uploadedAt >= from);
  if (to)     uploads = uploads.filter(u => u.uploadedAt <= to);

  return uploads;
}

function getUpload(uploadId) {
  const store = loadStore();
  return store.uploads.find(u => u.id === uploadId) || null;
}

function deleteUpload(uploadId) {
  const store = loadStore();
  store.uploads = store.uploads.filter(u => u.id !== uploadId);
  saveStore(store);
}

// ══════════════════════════════════════════════════════════════════════════════
//  ANALYTICS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get aggregated stats for dashboard
 * @param {Object} filters - { repId, teamId, period: 'week'|'month'|'all', from, to }
 */
function getRepAnalytics(filters = {}) {
  const store = loadStore();
  let uploads = [...store.uploads];

  // Apply filters
  if (filters.repId)  uploads = uploads.filter(u => u.repId === filters.repId);
  if (filters.teamId) uploads = uploads.filter(u => u.teamId === filters.teamId);

  // Time-based filter
  const now = new Date();
  if (filters.period === 'week') {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    uploads = uploads.filter(u => new Date(u.uploadedAt) >= weekAgo);
  } else if (filters.period === 'month') {
    const monthAgo = new Date(now);
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    uploads = uploads.filter(u => new Date(u.uploadedAt) >= monthAgo);
  } else if (filters.from || filters.to) {
    if (filters.from) uploads = uploads.filter(u => u.uploadedAt >= filters.from);
    if (filters.to)   uploads = uploads.filter(u => u.uploadedAt <= filters.to);
  }

  // Aggregate all leads from filtered uploads
  const allLeads = uploads.flatMap(u => u.leads || []);

  // Category breakdown
  const categoryCount = {};
  allLeads.forEach(l => {
    const cat = l.category || 'Unscored';
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  });

  // Per-rep breakdown
  const repMap = {};
  uploads.forEach(u => {
    if (!repMap[u.repId]) {
      repMap[u.repId] = {
        repId: u.repId,
        repName: u.repName,
        teamName: u.teamName,
        totalLeads: 0,
        totalUploads: 0,
        categories: {},
        avgScore: 0,
        totalScore: 0
      };
    }
    const r = repMap[u.repId];
    r.totalUploads++;
    r.totalLeads += u.leadCount;
    (u.leads || []).forEach(l => {
      const cat = l.category || 'Unscored';
      r.categories[cat] = (r.categories[cat] || 0) + 1;
      r.totalScore += (l.score || 0);
    });
  });
  Object.values(repMap).forEach(r => {
    r.avgScore = r.totalLeads > 0 ? Math.round(r.totalScore / r.totalLeads) : 0;
  });

  // Per-team breakdown
  const teamMap = {};
  uploads.forEach(u => {
    const tid = u.teamId || '_none';
    const tname = u.teamName || 'No Team';
    if (!teamMap[tid]) {
      teamMap[tid] = { teamId: tid, teamName: tname, totalLeads: 0, totalUploads: 0, categories: {}, reps: new Set() };
    }
    const t = teamMap[tid];
    t.totalUploads++;
    t.totalLeads += u.leadCount;
    t.reps.add(u.repId);
    (u.leads || []).forEach(l => {
      const cat = l.category || 'Unscored';
      t.categories[cat] = (t.categories[cat] || 0) + 1;
    });
  });
  // Convert Set to count
  Object.values(teamMap).forEach(t => { t.repCount = t.reps.size; delete t.reps; });

  // Weekly trend (last 8 weeks)
  const weeklyTrend = [];
  for (let w = 7; w >= 0; w--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - (w * 7));
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weekUploads = store.uploads.filter(u => {
      const d = new Date(u.uploadedAt);
      return d >= weekStart && d < weekEnd &&
        (!filters.repId || u.repId === filters.repId) &&
        (!filters.teamId || u.teamId === filters.teamId);
    });

    const weekLeads = weekUploads.flatMap(u => u.leads || []);
    weeklyTrend.push({
      weekStart: weekStart.toISOString().split('T')[0],
      leads: weekLeads.length,
      uploads: weekUploads.length,
      coreICP: weekLeads.filter(l => l.category === 'Core ICP').length,
      strongICP: weekLeads.filter(l => l.category === 'Strong ICP').length
    });
  }

  // Geography distribution
  const geoCount = {};
  allLeads.forEach(l => {
    const country = l.country || 'Unknown';
    geoCount[country] = (geoCount[country] || 0) + 1;
  });

  return {
    totalUploads: uploads.length,
    totalLeads: allLeads.length,
    categoryCount,
    repBreakdown: Object.values(repMap).sort((a, b) => b.totalLeads - a.totalLeads),
    teamBreakdown: Object.values(teamMap).sort((a, b) => b.totalLeads - a.totalLeads),
    weeklyTrend,
    geoCount,
    highPriorityLeads: allLeads
      .filter(l => l.category === 'Core ICP' || l.category === 'Strong ICP')
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 20),
    recentUploads: uploads.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).slice(0, 10)
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  HUBSPOT LEADS STORE  (rep-tracker live data from HubSpot)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Upsert HubSpot-sourced scored contacts.
 * Matches on hubspotId; adds new ones, overwrites existing ones.
 */
function upsertHubspotLeads(newLeads) {
  const store = loadStore();
  if (!store.hubspotLeads) store.hubspotLeads = [];

  const byId = {};
  store.hubspotLeads.forEach(l => { byId[l.hubspotId] = l; });

  let added = 0, updated = 0;
  const syncTime = new Date().toISOString();

  for (const lead of newLeads) {
    if (!lead.hubspotId) continue;
    if (byId[lead.hubspotId]) {
      Object.assign(byId[lead.hubspotId], lead, { syncedAt: syncTime });
      updated++;
    } else {
      byId[lead.hubspotId] = { ...lead, syncedAt: syncTime };
      added++;
    }
  }

  store.hubspotLeads   = Object.values(byId);
  store.lastHubspotSync = syncTime;
  saveStore(store);
  return { added, updated, total: store.hubspotLeads.length };
}

/** Return all stored HubSpot leads (for re-scoring) */
function getAllHubspotLeads() {
  const store = loadStore();
  return store.hubspotLeads || [];
}

/** Bulk-update scores/categories on stored HubSpot leads */
function updateAllHubspotLeadScores(scoredLeads) {
  const store = loadStore();
  if (!store.hubspotLeads) return { rescored: 0 };

  const byId = {};
  store.hubspotLeads.forEach(l => { byId[l.hubspotId] = l; });

  const rescoreTime = new Date().toISOString();
  let rescored = 0;
  for (const sl of scoredLeads) {
    if (!sl.hubspotId || !byId[sl.hubspotId]) continue;
    byId[sl.hubspotId].score        = sl.score;
    byId[sl.hubspotId].category     = sl.category;
    byId[sl.hubspotId].priority     = sl.priority;
    byId[sl.hubspotId].breakdown    = sl.breakdown;
    byId[sl.hubspotId].lastScoredAt = rescoreTime;
    rescored++;
  }

  store.hubspotLeads = Object.values(byId);
  saveStore(store);
  return { rescored };
}

/** Return the score bucket label for a numeric score */
function scoreBucket(score) {
  if (score == null) return 'unscored';
  if (score >= 80) return 's80_100';
  if (score >= 65) return 's65_79';
  if (score >= 50) return 's50_64';
  return 's0_49';
}

/**
 * Aggregate analytics over stored HubSpot leads.
 * @param {Object} opts - { ownerId, dateFrom, dateTo }  (all optional)
 */
function getHubspotRepStats({ ownerId, dateFrom, dateTo } = {}) {
  const store = loadStore();
  let leads = store.hubspotLeads || [];

  // Date filter (by createdate)
  if (dateFrom) leads = leads.filter(l => l.createdate && l.createdate >= dateFrom);
  if (dateTo)   leads = leads.filter(l => l.createdate && l.createdate <= dateTo);

  // Owner filter
  if (ownerId)  leads = leads.filter(l => l.ownerId === ownerId);

  // Totals
  const total  = leads.length;
  const mqls   = leads.filter(l => l.mqlDate || l.lifecycleStage === 'marketingqualifiedlead').length;
  const scored = leads.filter(l => l.score != null);
  const avgScore = scored.length > 0
    ? Math.round(scored.reduce((s, l) => s + (l.score || 0), 0) / scored.length)
    : 0;

  // Category counts
  const categoryCount = {};
  leads.forEach(l => {
    const cat = l.category || 'Unscored';
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  });

  // Global score range distribution
  const scoreRanges = { s80_100: 0, s65_79: 0, s50_64: 0, s0_49: 0, unscored: 0 };
  leads.forEach(l => { scoreRanges[scoreBucket(l.score)]++; });

  // Per-owner breakdown
  const ownerMap = {};
  leads.forEach(l => {
    const key = l.ownerId || '_unknown';
    if (!ownerMap[key]) {
      ownerMap[key] = {
        ownerId:     l.ownerId,
        ownerName:   l.ownerName  || 'Unknown',
        ownerEmail:  l.ownerEmail || '',
        ownerTeams:  l.ownerTeams || '',
        totalLeads:  0,
        mqls:        0,
        categories:  {},
        scoreRanges: { s80_100: 0, s65_79: 0, s50_64: 0, s0_49: 0 },
        _totalScore: 0,
        _scoredCnt:  0,
        avgScore:    0
      };
    }
    const o = ownerMap[key];
    o.totalLeads++;
    if (l.mqlDate || l.lifecycleStage === 'marketingqualifiedlead') o.mqls++;
    const cat = l.category || 'Unscored';
    o.categories[cat] = (o.categories[cat] || 0) + 1;
    const bucket = scoreBucket(l.score);
    if (bucket !== 'unscored') o.scoreRanges[bucket]++;
    if (l.score != null) { o._totalScore += l.score; o._scoredCnt++; }
  });
  Object.values(ownerMap).forEach(o => {
    o.avgScore = o._scoredCnt > 0 ? Math.round(o._totalScore / o._scoredCnt) : 0;
    delete o._totalScore;
    delete o._scoredCnt;
  });

  // Weekly trend — last 8 weeks by createdate
  const now = new Date();
  const weeklyTrend = [];
  for (let w = 7; w >= 0; w--) {
    const wStart = new Date(now);
    wStart.setDate(wStart.getDate() - w * 7);
    wStart.setHours(0, 0, 0, 0);
    const wEnd = new Date(wStart);
    wEnd.setDate(wEnd.getDate() + 7);
    const ws = wStart.toISOString().split('T')[0];
    const we = wEnd.toISOString().split('T')[0];
    const wk = leads.filter(l => l.createdate && l.createdate >= ws && l.createdate < we);
    weeklyTrend.push({
      weekStart: ws,
      leads:     wk.length,
      coreICP:   wk.filter(l => l.category === 'Core ICP').length,
      strongICP: wk.filter(l => l.category === 'Strong ICP').length,
      mqls:      wk.filter(l => l.mqlDate || l.lifecycleStage === 'marketingqualifiedlead').length
    });
  }

  // Top leads (Core + Strong, sorted by score desc)
  const topLeads = leads
    .filter(l => l.category === 'Core ICP' || l.category === 'Strong ICP')
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 20);

  return {
    total, mqls, avgScore, categoryCount, scoreRanges,
    lastSync:       store.lastHubspotSync || null,
    ownerBreakdown: Object.values(ownerMap).sort((a, b) => b.totalLeads - a.totalLeads),
    weeklyTrend,
    topLeads
  };
}

module.exports = {
  getTeams, createTeam, deleteTeam,
  getReps, createRep, updateRep, deleteRep,
  saveUpload, getUploads, getUpload, deleteUpload,
  getRepAnalytics,
  upsertHubspotLeads, getAllHubspotLeads, updateAllHubspotLeadScores, getHubspotRepStats
};
