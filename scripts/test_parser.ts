import fs from "node:fs";
import path from "node:path";
import { parseReport } from "../generator/parse";

const file = process.argv[2] ?? path.join(process.env.HOME!, "freight-leads-daily/reports/2026-04-15.md");
const md = fs.readFileSync(file, "utf8");
const leads = parseReport(md);
console.log(`parsed ${leads.length} leads from ${file}`);
for (const l of leads) {
  console.log(
    `  #${l.rank}  ${l.company.padEnd(30)}  rev=${l.est_revenue ?? "?"}  site=${l.website ?? "?"}  li=${l.dm1_linkedin ? "y" : "n"}`
  );
}
