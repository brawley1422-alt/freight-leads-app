import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REPORTS_ROOT = path.join(process.cwd(), "reports");
const LOGS_ROOT = path.join(process.cwd(), "logs");

export function paths(slug: string, date: string) {
  const dir = path.join(REPORTS_ROOT, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(LOGS_ROOT, { recursive: true });
  return {
    md: path.join(dir, `${date}.md`),
    pdf: path.join(dir, `${date}.pdf`),
    log: path.join(LOGS_ROOT, `${slug}-${date}.log`),
  };
}

export function writeReport(file: string, md: string) {
  fs.writeFileSync(file, md);
}

export function renderPdf(mdFile: string, pdfFile: string): { ok: boolean; log: string } {
  const script = path.join(process.cwd(), "render_pdf.py");
  if (!fs.existsSync(script)) {
    return { ok: false, log: "render_pdf.py missing" };
  }
  const res = spawnSync("python3", [script, mdFile, pdfFile], { encoding: "utf8" });
  const log = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  return { ok: res.status === 0 && fs.existsSync(pdfFile), log };
}

export function emailPdf(
  pdfFile: string,
  subject: string,
  to?: string
): { ok: boolean; log: string } {
  // email-doc always delivers to the address baked into its config (JB's
  // inbox). The `to` parameter is accepted but only used to decide whether
  // we have a delivery path at all — if the recipient isn't the admin inbox
  // there's nothing we can do yet.
  const emailDoc = path.join(process.env.HOME ?? "", "bin", "email-doc");
  if (!fs.existsSync(emailDoc)) {
    return { ok: false, log: "~/bin/email-doc not found" };
  }
  const adminEmail = (process.env.ADMIN_EMAIL ?? "brawley1422@gmail.com").toLowerCase();
  if (to && to.toLowerCase() !== adminEmail) {
    return {
      ok: false,
      log: `email-doc can only deliver to ${adminEmail}; skipped for ${to}`,
    };
  }
  const res = spawnSync(emailDoc, [pdfFile, "--subject", subject], { encoding: "utf8" });
  const log = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  return { ok: res.status === 0, log };
}
