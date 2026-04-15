import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Sends a magic sign-in link.
//
// Two important facts about the current setup:
//   1. ~/bin/email-doc always delivers to the address baked into its config
//      (JB's inbox). There is no per-recipient flag today. That's fine for
//      the v1 internal tool — JB is the only user we have real email wiring
//      for. Other agents will land in magic-links.log until a real multi-
//      recipient SMTP layer exists.
//   2. We NEVER throw from here. Login is a no-information-leak endpoint —
//      whether or not the email actually lands, the UI should always redirect
//      to /login?sent=1 so attackers can't enumerate emails. Failures are
//      logged to disk and to PM2 stderr.

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "brawley1422@gmail.com").toLowerCase();

export async function sendMagicLink(email: string, link: string): Promise<void> {
  // Always log locally — it's the paper trail and the dev fallback in one.
  const logFile = path.join(process.cwd(), "data", "magic-links.log");
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(
    logFile,
    `[${new Date().toISOString()}] ${email} -> ${link}\n`
  );

  // email-doc only sends to its configured address. If this magic link is
  // for someone other than the admin, we don't have a way to deliver it yet —
  // the log is all we can do. Return without firing the mailer.
  if (email.toLowerCase() !== ADMIN_EMAIL) {
    console.log(`[mailer] ${email} is not the admin inbox; link saved to ${logFile} only`);
    return;
  }

  const emailDoc = path.join(process.env.HOME ?? "", "bin", "email-doc");
  if (!fs.existsSync(emailDoc)) {
    console.log(`[mailer] email-doc missing; link logged to ${logFile}`);
    return;
  }

  const bodyFile = path.join(os.tmpdir(), `rlf-magic-${Date.now()}.md`);
  fs.writeFileSync(
    bodyFile,
    `# Sign in to Resolve Lead Factory

Click below to sign in. This link expires in 15 minutes.

[${link}](${link})

If you didn't request this, ignore this email.

— Resolve Lead Factory
`
  );

  try {
    const res = spawnSync(
      emailDoc,
      [bodyFile, "--subject", "Sign in to Resolve Lead Factory"],
      { encoding: "utf8" }
    );
    if (res.status !== 0) {
      console.error(`[mailer] email-doc failed: ${res.stderr?.trim()}`);
    }
  } catch (err) {
    console.error(`[mailer] email-doc threw: ${err}`);
  } finally {
    try {
      fs.unlinkSync(bodyFile);
    } catch {
      /* ignore */
    }
  }
}
