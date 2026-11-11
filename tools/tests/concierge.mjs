#!/usr/bin/env node
/* tools/tests/concierge.mjs — checks the voice concierge's brain and panel.
     node tools/serve.mjs --test   (in another terminal)
     node tools/tests/concierge.mjs [--shots folder]
   Sends sentences to the assistant as if they were typed or spoken and checks
   what it answers and what the page does (the booking form, rooms shown).
   The clock is fixed to Thursday 12 Nov 2026, 10:00 in Bangkok, so "tomorrow"
   is Friday 13 and "this weekend" is Fri 13 → Sun 15. It does not test the
   microphone or the spoken voice: try those by hand in Chrome.             */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { launch, BASE, arg } from "./_browser.mjs";

const require = createRequire(import.meta.url);
const NOW = "2026-11-12T10:00:00+07:00";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? "  → " + detail : ""}`);
};
const shots = arg("shots", "");
if (shots) fs.mkdirSync(shots, { recursive: true });
const browser = await launch();
let visitor = 0;

async function newPage(options = {}, when = NOW) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: "Asia/Bangkok", ...options });
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + e.blockedURI));
  });
  const page = await ctx.newPage();
  const ip = "10.1.0." + ++visitor;
  // The local server gets the same fixed clock as the page, on /api calls only.
  await page.route("**/api/**", (r) => r.continue({ headers: { ...r.request().headers(), "x-test-now": when, "x-test-ip": ip } }));
  await page.clock.install({ time: new Date(when) });
  page.__errors = [];
  page.on("pageerror", (e) => page.__errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") page.__errors.push(m.text()); });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-book-form]:not([hidden])");
  return { ctx, page };
}
const shot = (page, name) => (shots ? page.screenshot({ path: path.join(shots, name + ".png") }) : null);
const ask = (page, text) => page.evaluate((t) => window.ShopConcierge.ask(t), text);
// The "which rooms are free" answer arrives a moment later, as its own line.
async function askAndWait(page, text) {
  const a = await ask(page, text);
  await page.evaluate(() => window.ShopConcierge.settled());
  const last = await page.evaluate(() => { const l = [...document.querySelectorAll(".cg-line--agent")].pop(); return l.lastChild.textContent; });
  return { a, more: last === a ? "" : last };
}
const form = (page) => page.evaluate(() => ({
  checkIn: document.querySelector("[data-book-checkin]").value,
  nights: document.querySelector("[data-book-nights]").value,
  guests: document.querySelector("[data-book-guests]").value,
  room: (document.querySelector("input[name=book-room]:checked") || {}).value || "",
}));
const spot = (page) => page.evaluate(() => {
  const n = document.querySelector(".menu-item.is-spotlit .menu-item__name [lang=en], .sig-card.is-spotlit .sig-card__name [lang=en]");
  return n ? n.textContent : "";
});
// The fake clock runs the page's timers and animation frames; the real pause lets smooth scrolling finish.
const settle = async (page) => { await page.clock.runFor(200); await new Promise((r) => setTimeout(r, 900)); await page.clock.runFor(200); };
const inView = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }, sel);

await (await fetch(BASE + "api/__reset", { method: "POST" })).json().catch(() => { console.error("Start the server with:  node tools/serve.mjs --test"); process.exit(2); });

/* ------------------------------------------------- understanding dates */
{
  const { ctx, page } = await newPage();
  const stay = (t) => page.evaluate((x) => { const p = window.ShopConcierge.parseStay(x); return [p.checkIn, p.nights, p.guests, p.room && p.room.id].join("|"); }, t);
  const cases = [
    ["tomorrow for 2 nights, 2 adults", "2026-11-13|2|2|"],
    ["พรุ่งนี้ 2 คืน 2 คน", "2026-11-13|2|2|"],
    ["this weekend for two", "2026-11-13|2|2|"],
    ["สุดสัปดาห์นี้", "2026-11-13|2||"],
    ["next weekend", "2026-11-13|2||"],
    ["from friday to monday", "2026-11-13|3||"],
    ["ศุกร์ถึงอาทิตย์ 3 คน", "2026-11-13|2|3|"],
    ["วันเสาร์หน้า 1 คืน", "2026-11-14|1||"],
    ["next thursday, a week", "2026-11-19|7||"],
    ["dec 20 to dec 23", "2026-12-20|3||"],
    ["20 ธันวา 3 คืน", "2026-12-20|3||"],
    ["on the 5th for one night", "2026-12-05|1||"],
    ["วันที่ 30 สองคืน ผู้ใหญ่ 2 เด็ก 1", "2026-11-30|2|3|"],
    ["the deluxe tonight, just me", "2026-11-12||1|deluxe"],
    ["day after tomorrow, family suite", "2026-11-14|||family"],
    ["for 3 nights for 4 people", "|3|4|"],
    ["2 jan 2027 for 2 nights", "2027-01-02|2||"],
    ["extra night", "|||"],
  ];
  const wrong = [];
  for (const [t, want] of cases) { const got = await stay(t); if (got !== want) wrong.push(`"${t}" → ${got} (want ${want})`); }
  check(`dates, nights, guests and rooms are understood in Thai and English (${cases.length} sentences)`, !wrong.length, wrong.join("; "));
  await ctx.close();
}

/* ------------------------------------------------------- Thai, on a phone */
{
  const { ctx, page } = await newPage();
  check("the Talk button is on the page", await page.isVisible(".cg-launch"));
  await page.click(".cg-launch");
  check("the notice (automated assistant, how voice is processed) shows before anything starts", (await page.innerText(".cg-intro__consent")).length > 40);
  await settle(page);
  await shot(page, "phone-1-intro");
  await page.click("[data-cg-start=text]");
  check("starting shows a greeting", (await page.innerText(".cg-line--agent")).includes("สวัสดี"));
  check("the hotel's chips are shown", (await page.innerText(".cg-chips")).includes("ห้องไหนดี"));
  let off = await ask(page, "ทีมฟุตบอลไหนจะชนะ");
  check("TH: off-topic → says so and points to LINE (never a made-up answer)", /ตอบไม่ได้/.test(off) && /ไลน์/.test(off), off);

  let a = await ask(page, "ห้องไหนดี");
  await settle(page);
  check("TH: 'which room?' suggests the bestseller with its price and highlights its card", /ห้องการ์เดน/.test(a) && /1,800/.test(a) && (await spot(page)) === "Garden Room", a);
  const above = await page.evaluate(() => {
    const r = document.querySelector(".sig-card.is-spotlit").getBoundingClientRect();
    return r.top >= 0 && r.top < document.querySelector(".cg-panel").getBoundingClientRect().top;
  });
  check("the highlighted room is visible above the panel", above);

  a = await ask(page, "ห้องสำหรับครอบครัว 4 คน แนะนำห้องไหน");
  check("TH: 4 guests → the Family Suite", /แฟมิลี่สวีท/.test(a) && /3,900/.test(a), a);

  let r = await askAndWait(page, "จองห้อง 2 คืน พรุ่งนี้ 2 คน");
  await settle(page);
  let f = await form(page);
  check("TH: 'book 2 nights tomorrow for 2' fills in the form", f.checkIn === "2026-11-13" && f.nights === "2" && f.guests === "2", JSON.stringify(f));
  check("TH: …says it is checking those dates", /13 พฤศจิกายน/.test(r.a) && /15 พฤศจิกายน/.test(r.a), r.a);
  check("TH: …and then reads out which rooms are free with the total for the stay", /ว่างค่ะ/.test(r.more) && /3,600/.test(r.more) && /5,200/.test(r.more), r.more);
  check("the booking form is on screen", await inView(page, "#booking"));
  await shot(page, "phone-2-booking");

  r = await askAndWait(page, "เอาห้องดีลักซ์");
  f = await form(page);
  check("TH: choosing a room keeps the dates and selects it in the form", f.room === "deluxe" && f.checkIn === "2026-11-13" && f.nights === "2", JSON.stringify(f));
  check("TH: …and says its total", /ดีลักซ์/.test(r.more) && /5,200/.test(r.more) && /ยืนยันการจอง/.test(r.more), r.more);

  a = await ask(page, "เช็กอินกี่โมง");
  check("TH: FAQ from config.js (check-in time)", /14:00/.test(a) && /12:00/.test(a), a);
  a = await ask(page, "นวดแผนไทยเท่าไหร่");
  await settle(page);
  check("TH: an extra (Thai massage) with its price; the Spa tab opens and highlights it", /700/.test(a) && (await spot(page)) === "Thai Massage, 60 min" && (await page.getAttribute("#tab-spa", "aria-selected")) === "true", a);
  a = await ask(page, "มีที่จอดรถไหม");
  check("TH: parking", /จอดรถฟรี/.test(a), a);
  a = await ask(page, "รับสัตว์เลี้ยงไหม");
  check("TH: pets (FAQ)", /ไม่รับสัตว์เลี้ยง/.test(a), a);
  check("the page has no errors or CSP violations", !page.__errors.length && !(await page.evaluate(() => window.__csp.length)), page.__errors.join(" | "));
  await ctx.close();
}

/* ----------------------------------------------------- English, by voice-like turns */
{
  const { ctx, page } = await newPage();
  await page.click(".cg-launch");
  await page.click("[data-cg-start=text]");
  let a = await ask(page, "How much is the studio?");
  await settle(page);
  check("EN: switches the page to English", (await page.getAttribute("html", "lang")) === "en");
  check("EN: a room question gives size, sleeps, price, and highlights it", /32 square metres/.test(a) && /sleeps 3/.test(a) && /2,200/.test(a) && (await spot(page)) === "Studio", a);
  let r = await askAndWait(page, "yes please");
  check("EN: 'yes' after a room asks which dates", /Which day/.test(r.a) && !r.more, r.a);
  r = await askAndWait(page, "this Friday for 3 nights");
  let f = await form(page);
  check("EN: then 'this Friday for 3 nights' checks the studio for Fri 13 → Mon 16", f.checkIn === "2026-11-13" && f.nights === "3" && f.room === "studio" && /Monday 16 November/.test(r.a), JSON.stringify(f) + " " + r.a);
  check("EN: …and says it's free with the total (3 × 2,200 = 6,600)", /Studio is free/.test(r.more) && /6,600/.test(r.more), r.more);

  r = await askAndWait(page, "actually we're 4 people");
  f = await form(page);
  check("EN: 4 guests for a studio (sleeps 3) suggests the Family Suite instead", /sleeps 3/.test(r.a) && /Family Suite/.test(r.a) && f.guests === "4", r.a);

  r = await askAndWait(page, "book a room for 20 nights");
  check("EN: more than 14 nights → LINE", /up to 14 nights/.test(r.a), r.a);
  r = await askAndWait(page, "we are 7 people");
  check("EN: more than one room's worth of guests → LINE", /sleeps up to 4/.test(r.a), r.a);

  a = await ask(page, "What time is check-in?");
  check("EN: check-in time (FAQ)", /14:00/.test(a), a);
  a = await ask(page, "Is breakfast included?");
  check("EN: breakfast (FAQ)", /included/.test(a), a);
  a = await ask(page, "do you allow dogs?");
  check("EN: pets (FAQ, word match)", /can't take pets/.test(a), a);
  a = await ask(page, "what's the location like?");
  check("EN: 'location' is not mistaken for 'cat' (pets)", !/pets/.test(a), a);
  a = await ask(page, "what are your rates?");
  check("EN: all room rates", /1,800/.test(a) && /2,600/.test(a) && /2,200/.test(a) && /3,900/.test(a), a);
  a = await ask(page, "Any things to do nearby?");
  check("EN: experiences: the bestseller first", /Cooking Class/.test(a), a);
  a = await ask(page, "good afternoon");
  check("EN: 'good afternoon' is a greeting, not afternoon tea", /^Hi/.test(a), a);
  a = await ask(page, "How do I get there?");
  await settle(page);
  check("EN: directions open the map section", /Tha Phae Gate/.test(a) && (await inView(page, "#find")), a);
  // the map button moves focus; the panel keeps it
  check("EN: focus stays in the panel after the map opens", await page.evaluate(() => document.querySelector(".cg-panel").contains(document.activeElement)));
  a = await ask(page, "I want to cancel my booking");
  check("EN: cancelling points to the code + phone form", /booking code/.test(a), a);
  a = await ask(page, "who are you, are you a robot?");
  check("EN: says it is an automated assistant", /automated assistant/.test(a), a);
  a = await ask(page, "พูดภาษาไทยได้ไหม");
  check("switching back to Thai", (await page.getAttribute("html", "lang")) === "th" && /ได้ค่ะ/.test(a), a);
  await shot(page, "phone-3-english");
  check("no errors or CSP violations", !page.__errors.length && !(await page.evaluate(() => window.__csp.length)), page.__errors.join(" | "));
  await ctx.close();
}

/* ------------------------------------------------- sold out, then booked */
{
  // Both family suites taken Sat 14 → Sun 15 by other guests.
  for (const i of [1, 2]) {
    await fetch(BASE + "api/bookings", { method: "POST", headers: { "Content-Type": "application/json", "x-test-now": NOW, "x-test-ip": "10.7.0." + i },
      body: JSON.stringify({ room: "family", checkIn: "2026-11-14", nights: 1, guests: 4, name: "Other " + i, phone: "08877766" + i + "0" }) });
  }
  const { ctx, page } = await newPage();
  await page.click(".cg-launch");
  await page.click("[data-cg-start=text]");
  const r = await askAndWait(page, "Book the family suite on Saturday for 1 night");
  check("sold out: says the Family Suite is full and lists what is free with totals", /full/.test(r.more) && /Garden Room/.test(r.more) && /1,800/.test(r.more) && !/Family Suite at/.test(r.more), r.more);
  const r2 = await askAndWait(page, "ok the garden room then");
  const f = await form(page);
  check("…then the Garden Room is chosen for the same night", f.room === "garden" && f.checkIn === "2026-11-14" && /Garden Room is free/.test(r2.more), JSON.stringify(f) + " " + r2.more);
  await page.click("[data-cg-close]"); // the panel covers the bottom of a phone screen
  await page.fill("[data-book-name]", "Ploy");
  await page.fill("[data-book-phone]", "0812223333");
  await page.click("[data-book-submit]");
  await page.waitForSelector("[data-book-done]:not([hidden])");
  const code = (await page.innerText("[data-book-done-code]")).trim();
  await page.waitForFunction((c) => [...document.querySelectorAll(".cg-line--agent")].some((l) => l.textContent.includes(c)), code);
  check("confirming in the form is also announced in the chat with the code", true);
  await ctx.close();
}

/* ------------------------------------------------- no speech recognition */
{
  const { ctx, page } = await newPage({}, NOW);
  await ctx.close();
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Bangkok" });
  await c2.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
  const p2 = await c2.newPage();
  await p2.goto(BASE, { waitUntil: "networkidle" });
  await p2.click(".cg-launch");
  check("without speech recognition (e.g. Firefox): a text chat, and it says so", (await p2.innerText(".cg-intro")).includes("พิมพ์") && !(await p2.$(".cg-mic, [data-cg-start=voice]")));
  await c2.close();
}

/* ------------------------------------------------------------ accessibility */
{
  // bypassCSP: only so the test can inject axe-core; the page itself is unchanged.
  const { ctx, page } = await newPage({ bypassCSP: true });
  await page.click(".cg-launch");
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const run = () => page.evaluate(async () => (await window.axe.run(".cg-panel")).violations.map((v) => `${v.id} (${v.nodes.map((n) => n.target).join(", ")})`));
  const intro = await run();
  check("axe finds no accessibility violations in the intro view", !intro.length, intro.join("; "));
  await page.click("[data-cg-start=text]");
  await askAndWait(page, "จองห้องพรุ่งนี้ 2 คืน");
  const live = await run();
  check("axe finds no accessibility violations in the conversation", !live.length, live.join("; "));
  await page.keyboard.press("Escape");
  check("Escape closes the panel and gives focus back to the Talk button", (await page.isHidden(".cg-panel")) && (await page.evaluate(() => document.activeElement.classList.contains("cg-launch"))));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
