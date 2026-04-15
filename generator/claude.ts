import { spawn } from "node:child_process";

export type ClaudeResult = { stdout: string; stderr: string; code: number };

export function runClaude(prompt: string, opts: { timeoutMs?: number } = {}): Promise<ClaudeResult> {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--allowedTools",
      "WebSearch,WebFetch",
      "--dangerously-skip-permissions",
      prompt,
    ];
    const child = spawn("claude", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(
      () => {
        child.kill("SIGKILL");
        reject(new Error("claude -p timed out"));
      },
      opts.timeoutMs ?? 45 * 60 * 1000 // 45 min
    );
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? -1 });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Strip any preamble before the first markdown H1 ("# ").
export function stripPreamble(md: string): string {
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("# ")) {
      return lines.slice(i).join("\n");
    }
  }
  return md;
}
