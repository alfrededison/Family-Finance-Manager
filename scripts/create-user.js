// Create an account directly in D1 — the only way to add the first (super
// admin) user, since signup is invite-only and refuses SUPER_ADMIN_EMAILS.
//
//   npm run user:create -- <email> <name> [--remote]
//
// The password is prompted for, so it never lands in shell history.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { hashPassword } from '../functions/_auth.js';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const [email, name] = args.filter((a) => a !== '--remote');
if (!email || !name) {
  console.error('Usage: npm run user:create -- <email> <name> [--remote]');
  process.exit(1);
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const password = await promptHidden('Password (≥ 8 chars): ');
if (password.length < 8) {
  console.error('Password must be ≥ 8 chars');
  process.exit(1);
}

const dbName = readFileSync('wrangler.toml', 'utf8').match(/database_name\s*=\s*"([^"]+)"/)?.[1];
if (!dbName) {
  console.error('Could not read database_name from wrangler.toml');
  process.exit(1);
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const hash = await hashPassword(password);
const sql = `INSERT INTO users (email, name, password_hash) VALUES (${q(email.trim().toLowerCase())}, ${q(name.trim())}, ${q(hash)})`;

execFileSync('wrangler', ['d1', 'execute', dbName, remote ? '--remote' : '--local', '--command', sql], { stdio: 'inherit' });
