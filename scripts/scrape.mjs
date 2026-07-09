// scripts/scrape.mjs
// Fetches THIS WEEK's Watchtower Study article from wol.jw.org and
// writes clean JSON to data/watchtower.json. Run by the GitHub Action
// on a schedule. Node 18+ (has global fetch).

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = "https://wol.jw.org";
const MEETINGS_URL = `${BASE}/en/wol/meetings/r1/lp-e`; // "This Week" shortcut, always current
const UA = { "User-Agent": "Mozilla/5.0 (compatible; TRMNL-WatchtowerPlugin/1.0)" };
const OUT_PATH = path.join(process.cwd(), "data", "watchtower.json");

function decodeEntities(str) {
  return str
    .replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&#8220;|&ldquo;/g, "“")
    .replace(/&#8221;|&rdquo;/g, "”")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

function stripTags(html) {
  if (!html) return "";
  return decodeEntities(html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
}

async function getArticleUrl() {
  const res = await fetch(MEETINGS_URL, { headers: UA });
  if (!res.ok) throw new Error(`Meetings page fetch failed: ${res.status}`);
  const html = await res.text();

  const section = html.split(/Watchtower Study/i)[1];
  if (!section) throw new Error("Could not locate 'Watchtower Study' section on meetings page");

  const match = section.match(/href="([^"]+\/wol\/d\/[^"]+)"/i);
  if (!match) throw new Error("Could not find Watchtower Study article link");

  let href = match[1];
  if (href.startsWith("/")) href = BASE + href;
  return href;
}

// Pure function: HTML in, data out. No network calls — this is what gets
// unit-tested against scripts/fixture.html in scripts/test-parse.mjs.
export function parseArticleHtml(html, url) {
  // Allow for closing tags (e.g. </strong>) sitting between </a> and the
  // song title text — real wol.jw.org markup wraps "SONG 133" in <strong>.
  const songMatches = [...html.matchAll(/>SONG\s+(\d+)<\/a>(?:<\/[a-z0-9]+>)*\s*([^<]+)/gi)];
  const openingSong = songMatches[0]
    ? `Song ${songMatches[0][1]} – ${stripTags(songMatches[0][2])}`
    : null;
  const closingSong = songMatches.length > 1
    ? `Song ${songMatches[songMatches.length - 1][1]} – ${stripTags(songMatches[songMatches.length - 1][2])}`
    : null;

  const dateMatch = html.match(/>([A-Z][A-Z\u2013\u2014\s]+\d{1,2}(?:[\u2013\u2014-]\d{1,2})?,\s*\d{4})<\/(p|strong|span)>/);
  const weekRange = dateMatch ? stripTags(dateMatch[1]) : "";

  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : "";

  let theme = "";
  if (titleMatch) {
    const afterTitle = html.slice(titleMatch.index + titleMatch[0].length);
    const themeMatch = afterTitle.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (themeMatch) theme = stripTags(themeMatch[1]);
  }

  // FOCUS markup varies: sometimes "FOCUS: text" is one <p>, sometimes
  // "FOCUS" is its own <p> with the actual text in the next <p>. Try the
  // same-paragraph case first; if that captures nothing, fall through to
  // the next <p> after the label.
  let focus = "";
  const focusLabelMatch = html.match(/<p[^>]*>\s*(?:<strong>)?\s*FOCUS\s*(?:<\/strong>)?\s*:?\s*([\s\S]*?)<\/p>/i);
  if (focusLabelMatch) {
    const inline = stripTags(focusLabelMatch[1]);
    if (inline) {
      focus = inline;
    } else {
      const after = html.slice(focusLabelMatch.index + focusLabelMatch[0].length);
      const nextP = after.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      if (nextP) focus = stripTags(nextP[1]);
    }
  }

  const excluded = ["bible principles to consider", "how would you answer?", "how would you answer"];
  const subheadings = [];
  const h2Re = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  let hm;
  while ((hm = h2Re.exec(html)) !== null) {
    const text = stripTags(hm[1]);
    if (text && !excluded.includes(text.toLowerCase())) subheadings.push(text);
  }

  const review = [];
  const reviewIdx = html.search(/HOW WOULD YOU ANSWER/i);
  if (reviewIdx !== -1) {
    const after = html.slice(reviewIdx);
    const ulMatch = after.match(/<ul[^>]*>([\s\S]*?)<\/ul>/i);
    if (ulMatch) {
      const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let lm;
      while ((lm = liRe.exec(ulMatch[1])) !== null) {
        const text = stripTags(lm[1]);
        if (text) review.push(text);
      }
    }
  }

  return {
    has_data: Boolean(title && subheadings.length),
    week_range: weekRange,
    opening_song: openingSong,
    title,
    theme,
    focus,
    subheadings,
    review_questions: review,
    closing_song: closingSong,
    source_url: url,
    fetched_at: new Date().toISOString(),
  };
}

async function getArticle(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`Article fetch failed: ${res.status}`);
  const html = await res.text();
  return parseArticleHtml(html, url);
}

async function main() {
  let data;
  try {
    const articleUrl = await getArticleUrl();
    data = await getArticle(articleUrl);
  } catch (err) {
    // Don't wipe out last week's good data on a transient failure —
    // just log it. The Action step below will skip the commit if the
    // file didn't change, but on a genuine fetch error we still want
    // *something* valid served to TRMNL, so we bail out without writing.
    console.error("Scrape failed:", err);
    process.exitCode = 1;
    return;
  }

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
  console.log("Wrote", OUT_PATH);
  console.log(JSON.stringify(data, null, 2));
}

// Only run when executed directly (e.g. `node scrape.mjs`), not when
// imported by the test harness.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
