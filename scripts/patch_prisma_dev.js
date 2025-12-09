const fs = require('fs');
const path = require('path');

// This script is a safe, best-effort shim that wraps a direct require of the
// ESM entry in a try/catch and provides a clearer message if the package is
// ESM-only. It is intentionally conservative: it does not attempt an async
// dynamic-import fallback that could make module.exports a Promise (which
// would likely break callers). Instead it logs guidance and rethrows so the
// user sees a helpful error.

const target = path.join(process.cwd(), 'node_modules', '@prisma', 'dev', 'dist', 'index.cjs');
try {
  if (!fs.existsSync(target)) {
    console.log('[patch_prisma_dev] target not found, skipping:', target);
    process.exit(0);
  }

  const src = fs.readFileSync(target, 'utf8');
  const needle = "require('./index.js')";
  const occurrences = (src.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  if (occurrences !== 1) {
    console.log(`[patch_prisma_dev] expected exactly 1 occurrence of needle, found ${occurrences}. Skipping.`);
    process.exit(0);
  }

  // Replacement: wrap the require in a try/catch which logs a helpful
  // instruction if ERR_REQUIRE_ESM is encountered. Keep the behavior
  // synchronous so we don't change module.exports semantics.
  const replacement = `(() => { try { return require('./index.js') } catch(e) { if (e && e.code === 'ERR_REQUIRE_ESM') { console.error('[patch_prisma_dev] @prisma/dev appears ESM-only (ERR_REQUIRE_ESM). Consider upgrading Node or using ESM imports.'); } throw e; } })()`;

  const newSrc = src.replace(needle, replacement);

  // Backup original file if not already backed up
  const backup = target + '.orig';
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(target, backup);
    console.log('[patch_prisma_dev] backup created at', backup);
  }

  fs.writeFileSync(target, newSrc, 'utf8');
  console.log('[patch_prisma_dev] patched', target);
} catch (err) {
  console.error('[patch_prisma_dev] failed to patch @prisma/dev:', err && err.message ? err.message : err);
  // Don't fail install — the script is best-effort
  process.exit(0);
}
