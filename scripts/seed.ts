import fs from "node:fs";
import path from "node:path";
import { db } from "../db/client";
import { createAgent, getAgentByEmail } from "../lib/agents";

const v0Dir = path.join(process.env.HOME ?? "", "freight-leads-daily");
const verticalsPath = path.join(v0Dir, "verticals.txt");

const verticals = fs.existsSync(verticalsPath)
  ? fs.readFileSync(verticalsPath, "utf8").split("\n").map((s) => s.trim()).filter(Boolean)
  : [
      "Home goods and houseware",
      "Furniture and mattresses",
      "Pet products",
    ];

const JB_ICP = `US-based e-commerce / consumer brand companies
- Annual revenue: $25M–$100M
- Ships FULL truckload freight (real FTL volume, ~$25K–$100K/week)
- Bonus: ships into Amazon FCs, parcel hubs, or major retail DCs (Walmart, Target, Costco, Home Depot, Lowe's)
- Bonus: HQ or DC within ~100 miles of a major port (LA/LGB, NY/NJ, Savannah, Houston, Seattle, Charleston, Norfolk) or inland hub (Chicago, Dallas, Atlanta, Memphis, Columbus, Indianapolis)
- Prioritize visible signs of freight activity: warehouse job listings, logistics hires, Panjiva/FMCSA data, public case studies, Amazon Vendor Central references, retail partnerships

EXCLUSIONS
- Fortune 500 / >$200M revenue (Shein, Wayfair, Chewy tier)
- Pure digital / SaaS / services
- Sub-$25M micro-brands unlikely to move FTL
- Pure LTL / parcel-only shippers`;

function main() {
  db(); // init
  const email = "brawley1422@gmail.com";
  if (getAgentByEmail(email)) {
    console.log("JB already seeded — skipping");
    return;
  }
  const id = createAgent({
    slug: "jb",
    name: "JB (TooYeezy)",
    email,
    icp_text: JB_ICP,
    verticals_json: JSON.stringify(verticals),
    delivery_hour: 7,
    active: 1,
  });
  console.log(`seeded JB as agent #${id} with ${verticals.length} verticals`);
}

main();
