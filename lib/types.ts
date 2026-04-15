export type Agent = {
  id: number;
  slug: string;
  name: string;
  email: string;
  icp_text: string;
  verticals_json: string;
  delivery_hour: number;
  active: number;
  created_at: string;
};

export type Run = {
  id: number;
  agent_id: number;
  date: string;
  vertical: string;
  report_md: string | null;
  pdf_path: string | null;
  status: "pending" | "running" | "ok" | "error";
  error: string | null;
  created_at: string;
};

export type Lead = {
  id: number;
  run_id: number;
  rank: number;
  company: string;
  company_lower: string;
  website: string | null;
  hq: string | null;
  est_revenue: string | null;
  in_band: string | null;
  details_md: string | null;
  dm1_name: string | null;
  dm1_linkedin: string | null;
  status: "pending" | "contacted" | "bad_fit" | "won";
  notes: string | null;
  qual_score: number | null;
  qual_flag: string | null;
  dup_score: number | null;
  dup_of: string | null;
  created_at: string;
};
