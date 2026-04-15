import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Sends a magic sign-in link using JB's existing ~/bin/email-doc tool.
// Falls back to writing the link to data/magic-links.log when email-doc
// is unavailable (e.g., dev on a headless box or first-time setup).

export async function sendMagicLink(email: string, link: string): Promise<void> {
  const bodyFile = path.join(os.tmpdir(), `rlf-magic-${Date.now()}.md`);
  const body = `# Sign in to Resolve Lead Factory

Hi —

Click below to sign in. This link expires in 15 minutes.

[${link}](${link})

If you didn't request this, ignore this email.

— Resolve Lead Factory
`;
  fs.writeFileSync(bodyFile, body);

  const emailDoc = path.join(process.env.HOME ?? "", "bin", "email-doc");
  if (!fs.existsSync(emailDoc)) {
    const logFile = path.join(process.cwd(), "data", "magic-links.log");
    fs.appendFileSync(
      logFile,
      `[${new Date().toISOString()}] ${email} -> ${link}\n`
    );
    console.log(`[mailer] email-doc missing; link logged to ${logFile}`);
    return;
  }

  const res = spawnSync(
    emailDoc,
    [bodyFile, "--subject", "Sign in to Resolve Lead Factory", "--to", email],
    { encoding: "utf8" }
  );
  if (res.status !== 0) {
    console.error(`[mailer] email-doc failed: ${res.stderr}`);
    throw new Error("failed to send magic link");
  }
}
