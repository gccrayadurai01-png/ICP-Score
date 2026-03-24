/**
 * One-time setup: creates the three custom HubSpot properties.
 * Run with:  npm run setup
 */
require('dotenv').config();
const { ensureCustomProperties } = require('./hubspot');

(async () => {
  console.log('Setting up HubSpot custom properties...\n');
  try {
    await ensureCustomProperties();
    console.log('\nSetup complete.');
  } catch (err) {
    console.error('\nSetup failed:', err.message);
    process.exit(1);
  }
})();
