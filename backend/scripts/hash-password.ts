/**
 * Prints a bcrypt hash for ADMIN_PASSWORD_HASH.
 *
 *   npm run hash-password            # prompts (recommended: keeps it out of shell history)
 *   npm run hash-password -- <pw>    # non-interactive
 */
import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

const COST = 12;

function prompt(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  let password = process.argv[2];
  if (password) {
    console.error('Warning: passwords given as arguments can end up in shell history. Run without arguments to be prompted.');
  } else {
    password = await prompt('Admin password: ');
    const again = await prompt('Repeat password: ');
    if (password !== again) {
      console.error('Passwords do not match.');
      process.exit(1);
    }
  }
  if (password.length < 12) {
    console.error('Refusing: use at least 12 characters.');
    process.exit(1);
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    console.error('Note: bcrypt only uses the first 72 bytes of the password.');
  }
  const hash = await bcrypt.hash(password, COST);
  console.log(`\nAdd this line to backend/.env (keep the single quotes; $ must not be expanded):\n\nADMIN_PASSWORD_HASH='${hash}'\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
