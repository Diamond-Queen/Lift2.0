/**
 * Environment variable validation
 * Runs at server startup to ensure all required variables are configured
 * Prevents undefined behavior at runtime
 */

const requiredEnvVars = {
  production: [
    'DATABASE_URL',
    'NEXTAUTH_URL',
    'NEXTAUTH_SECRET',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ],
  development: [
    'DATABASE_URL',
    'NEXTAUTH_URL',
    'NEXTAUTH_SECRET',
  ],
};

function validateEnvironment() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const required = requiredEnvVars[nodeEnv] || requiredEnvVars.development;
  
  const missing = [];
  const warnings = [];

  // Check required variables
  for (const varName of required) {
    if (!process.env[varName] || !process.env[varName].trim()) {
      missing.push(varName);
    }
  }

  // Check optional but important variables
  if (!process.env.OPENAI_API_KEY && !process.env.GROQ_API_KEY && !process.env.HUGGINGFACE_API_KEY) {
    warnings.push('No AI provider configured (OPENAI_API_KEY, GROQ_API_KEY, or HUGGINGFACE_API_KEY). AI features will be disabled.');
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    warnings.push('STRIPE_SECRET_KEY not configured. Subscription features will be disabled.');
  }

  // Report findings
  if (missing.length > 0) {
    console.error('\n❌ CRITICAL: Missing required environment variables:');
    missing.forEach(varName => console.error(`   - ${varName}`));
    console.error('\nApplication cannot start without these variables.');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️  Environment warnings:');
    warnings.forEach(msg => console.warn(`   - ${msg}`));
  }

  console.log(`✓ Environment validation passed (${nodeEnv} mode)`);
}

// Validate on import
if (typeof window === 'undefined') {
  // Server-side only
  validateEnvironment();
}

module.exports = { validateEnvironment };
