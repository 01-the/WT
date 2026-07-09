// scripts/test-parse.mjs — runs the production parser against fixture.html
import { readFile } from "node:fs/promises";
import { parseArticleHtml } from "./scrape.mjs";

const html = await readFile(new URL("./fixture.html", import.meta.url), "utf-8");
const result = parseArticleHtml(html, "https://example.com/fixture");
console.log(JSON.stringify(result, null, 2));

const checks = [
  ["title", result.title === "Make Wise Decisions Regarding Additional Education"],
  ["opening_song", result.opening_song === "Song 133 – Worship Jehovah During Youth"],
  ["closing_song", result.closing_song === "Song 45 – The Meditation of My Heart"],
  ["theme includes quote", result.theme.includes("shrewd one ponders")],
  ["theme has matching curly quotes", result.theme.startsWith("“") && result.theme.includes("”—PROV")],
  ["focus text", result.focus === "Factors and Bible principles to consider when deciding whether to obtain additional education."],
  ["subheadings count == 3", result.subheadings.length === 3],
  ["subheadings excludes boxes", !result.subheadings.some(s => /bible principles|how would you answer/i.test(s))],
  ["review count == 3", result.review_questions.length === 3],
  ["week_range", result.week_range === "JULY 20-26, 2026"],
  ["has_data", result.has_data === true],
];

console.log("\n--- Checks ---");
let allPass = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "PASS" : "FAIL"} - ${name}`);
  if (!pass) allPass = false;
}
if (!allPass) process.exit(1);
console.log("\nAll checks passed.");
