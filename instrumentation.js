// Next.js instrumentation hook — runs once at server startup before any request is handled.
// Validates required environment variables and exits immediately with a clear message if missing.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const PLACEHOLDERS = [
    'change-me', 'your-secret', 'placeholder', 'example',
    'generate_a_random', 'xxxxxxxx', 'secret-at-least',
  ];

  const errors = [];

  // ── DATABASE_URL ──────────────────────────────────────────────
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is missing — set your Railway PostgreSQL URL in .env');
  }

  // ── NEXTAUTH_SECRET ───────────────────────────────────────────
  const secret = process.env.NEXTAUTH_SECRET || '';
  if (!secret) {
    errors.push('NEXTAUTH_SECRET is missing — generate one with: openssl rand -base64 32');
  } else if (secret.length < 32) {
    errors.push(`NEXTAUTH_SECRET is too short (${secret.length} chars, need ≥32) — generate with: openssl rand -base64 32`);
  } else if (PLACEHOLDERS.some(p => secret.toLowerCase().includes(p))) {
    errors.push('NEXTAUTH_SECRET is a placeholder — generate a real one with: openssl rand -base64 32');
  }

  if (errors.length > 0) {
    console.error('\n╔══════════════════════════════════════════════════════════╗');
    console.error('║  STARTUP FAILED — Missing or invalid environment variables ║');
    console.error('╠══════════════════════════════════════════════════════════╣');
    for (const msg of errors) {
      console.error(`║  ✗ ${msg.padEnd(54)}║`);
    }
    console.error('╠══════════════════════════════════════════════════════════╣');
    console.error('║  Fix: set correct values in .env, then run:               ║');
    console.error('║  docker compose --env-file .env up -d                     ║');
    console.error('╚══════════════════════════════════════════════════════════╝\n');
    process.exit(1);
  }
}
