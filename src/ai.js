'use strict';

const EXTRACTION_PROMPT = `
Extract ALL contacts/leads from the document text above.

For each lead, extract these fields — use null if a field is not found:
  - name          : Full name of the contact
  - email         : Email address
  - jobTitle      : Job title or role
  - companyName   : Company or organisation name
  - numberOfEmployees : Number of employees as an integer (e.g. 500), null if unknown
  - country       : Full country name in English (e.g. "United States", "United Kingdom")
  - industry      : Industry or sector (e.g. "Computer Software", "Financial Services")
  - techStack     : Technology tools / software used, as a comma-separated string
  - phone         : Phone number
  - leadStatus    : Lead status if mentioned (e.g. "New", "Qualified")

Return ONLY a valid JSON array — no markdown, no explanation, no code fences.
Start directly with [ and end with ].

Example output:
[{"name":"Jane Smith","email":"jane@acme.com","jobTitle":"IT Director","companyName":"Acme Corp","numberOfEmployees":500,"country":"United States","industry":"Computer Software","techStack":"Microsoft 365, Slack","phone":"+1 555 0100","leadStatus":"New"}]

If no leads are found, return: []
`.trim();

/**
 * Analyse a PDF buffer and return an array of extracted lead objects.
 * Uses pdf-parse for text extraction + Claude Opus 4.6 for intelligent parsing.
 *
 * @param {Buffer} pdfBuffer
 * @param {string} [filename]
 * @returns {Promise<Array>}
 */
async function analyzeLeadsPDF(pdfBuffer, filename = 'leads.pdf') {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not configured. Add it to your .env file.'
    );
  }

  // ── 1. Extract text from PDF ──────────────────────────────────────────────
  let pdfText;
  try {
    const pdfParse = require('pdf-parse');
    const data     = await pdfParse(pdfBuffer);
    pdfText        = data.text || '';
  } catch (e) {
    throw new Error(`Failed to read PDF: ${e.message}`);
  }

  if (!pdfText || pdfText.trim().length < 20) {
    throw new Error(
      'No extractable text found in the PDF. ' +
      'The file may be a scanned image — please use a text-based PDF.'
    );
  }

  // Trim to stay comfortably within the 200K context window
  const MAX_CHARS = 180_000;
  const truncated = pdfText.length > MAX_CHARS
    ? pdfText.slice(0, MAX_CHARS) + '\n\n[... document truncated for length ...]'
    : pdfText;

  // ── 2. Send to Claude Opus 4.6 ────────────────────────────────────────────
  const Anthropic = require('@anthropic-ai/sdk');
  const client    = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model:      'claude-opus-4-6',
    max_tokens: 8192,
    thinking:   { type: 'adaptive' },
    system: (
      'You are a precise data extraction specialist. ' +
      'Your only job is to read documents and return structured JSON. ' +
      'Never add explanations, markdown, or any text outside the JSON array.'
    ),
    messages: [{
      role: 'user',
      content:
        `=== PDF: ${filename} ===\n\n` +
        truncated +
        `\n\n=== END OF DOCUMENT ===\n\n` +
        EXTRACTION_PROMPT
    }]
  });

  // ── 3. Parse response ─────────────────────────────────────────────────────
  // Skip thinking blocks — only collect text blocks
  let text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Strip any accidental markdown code fences
  text = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Extract the outermost JSON array
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    console.error('[ai.js] Unexpected Claude response:', text.slice(0, 500));
    throw new Error(
      'Claude did not return a JSON array. ' +
      'The PDF may not contain recognisable lead data.'
    );
  }

  let leads;
  try {
    leads = JSON.parse(match[0]);
  } catch (e) {
    throw new Error(`Failed to parse JSON from Claude response: ${e.message}`);
  }

  if (!Array.isArray(leads)) {
    throw new Error('Parsed response is not an array.');
  }

  return leads;
}

module.exports = { analyzeLeadsPDF };
