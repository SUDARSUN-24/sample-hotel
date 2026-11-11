#!/usr/bin/env node
/* tools/tests/booking.mjs — the hotel booking system in a real browser, end to
   end: the form, free rooms and prices, check/cancel, "Book this room", the
   front desk dashboard, and the fallback when there is no backend.
     node tools/serve.mjs --test     (in another terminal; --test lets the tests set the clock)
     node tools/tests/booking.mjs [--shots folder]
   The clock (browser and server) is fixed to Thursday 12 Nov 2026, 10:00 Bangkok. */
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
const shot = (page, name, opts = {}) => (shots ? page.screenshot({ path: path.join(shots, name + ".png"), ...opts }) : null);
const browser = await launch();
let visitor = 0;
const desktop = { viewport: { width: 1100, height: 900 }, isMobile: false, hasTouch: false };

async function newPage(options = {}, url = BASE) {
  const { noApi, ...rest } = options;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: "Asia/Bangkok", ...rest });
  const ip = "10.0.0." + ++visitor;
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + e.blockedURI));
  });
  const page = await ctx.newPage();
  if (noApi) await page.route("**/api/**", (r) => r.fulfill({ status: 404, contentType: "text/html", body: "<h1>Not found</h1>" }));
  // Each test page is its own "visitor", with the server on the same fixed clock (sent on /api calls only).
  else await page.route("**/api/**", (r) => r.continue({ headers: { ...r.request().headers(), "x-test-now": NOW, "x-test-ip": ip } }));
  await page.clock.install({ time: new Date(NOW) });
  page.__errors = [];
  page.on("pageerror", (e) => page.__errors.push(e.message));
  // "Failed to load resource" is the browser noting a refused request (400/401/404/409): expected here.
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) page.__errors.push(m.text()); });
  await page.goto(url, { waitUntil: "networkidle" });
  return { ctx, page };
}
const clean = async (page) => !page.__errors.length && !(await page.evaluate(() => window.__csp.length));
const problems = async (page) => page.__errors.concat(await page.evaluate(() => window.__csp)).join(" | ");
const optText = (page, id) => page.innerText(`[data-room-opt="${id}"]`);
const waitRooms = (page) => page.waitForFunction(() => {
  const o = document.querySelectorAll("[data-room-opt] [data-room-total]");
  return o.length && Array.from(o).every((n) => n.textContent.trim());
});
const api = (pathname, body, ip = "10.9.9.9") => fetch(BASE + "api" + pathname, {
  method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "x-test-now": NOW, "x-test-ip": ip }, body: body ? JSON.stringify(body) : undefined,
}).then((r) => r.json());

await (await fetch(BASE + "api/__reset", { method: "POST" })).json().catch(() => { console.error("Start the server with:  node tools/serve.mjs --test"); process.exit(2); });

/* ------------------------------------------------------- booking a stay */
let bookingCode = "";
{
  const { ctx, page } = await newPage();
  await page.waitForSelector("[data-book-form]:not([hidden])");
  check("with a backend, the booking form replaces the LINE message", await page.isHidden("[data-book-offline]"));
  check("the check-in date starts at tomorrow", (await page.inputValue("[data-book-checkin]")) === "2026-11-13");
  check("dates in the past can't be picked", (await page.getAttribute("[data-book-checkin]", "min")) === "2026-11-12");
  await waitRooms(page);
  check("each room shows its total for the stay", /1,800/.test(await optText(page, "garden")) && /3,900/.test(await optText(page, "family")), await optText(page, "garden"));
  check("the dates line shows check-in → check-out", /13 Nov|13 พ\.ย\./.test(await page.innerText("[data-book-dates]")), await page.innerText("[data-book-dates]"));

  await page.selectOption("[data-book-nights]", "3");
  await page.waitForFunction(() => /7,800/.test(document.querySelector('[data-room-opt="deluxe"]').textContent));
  check("changing the nights updates the totals (3 × 2,600 = 7,800)", true);
  await page.selectOption("[data-book-guests]", "3");
  await page.waitForFunction(() => document.querySelector('[data-room-opt="garden"] input').disabled);
  check("3 guests: rooms that sleep 2 can't be chosen, and say why", /2/.test(await optText(page, "garden")) && !(await page.isDisabled('[data-room-opt="studio"] input')));
  await page.selectOption("[data-book-guests]", "2");
  await page.waitForFunction(() => !document.querySelector('[data-room-opt="garden"] input').disabled);

  await page.click("[data-book-submit]");
  check("submitting without a room says so", /room|ห้อง/i.test(await page.innerText("[data-book-error]")));
  await page.check('[data-room-opt="deluxe"] input');
  await page.click("[data-book-submit]");
  check("submitting without a name says so", /name|ชื่อ/i.test(await page.innerText("[data-book-error]")));
  await page.fill("[data-book-name]", "Somchai");
  await page.fill("[data-book-phone]", "081 555 1234");
  await page.fill("[data-book-note]", "Arriving around 21:00");
  await shot(page, "1-form");
  await page.click("[data-book-submit]");
  await page.waitForSelector("[data-book-done]:not([hidden])");
  bookingCode = (await page.innerText("[data-book-done-code]")).trim();
  check("the booking is confirmed with a code", /^[A-Z2-9]{6}$/.test(bookingCode), bookingCode);
  const when = await page.innerText("[data-book-done-when]");
  check("the confirmation shows the room, dates and total", /Deluxe|ดีลักซ์/.test(when) && /7,800/.test(when), when);
  await shot(page, "2-done");

  await page.click("[data-book-again]");
  await waitRooms(page);
  const left = await page.evaluate(() => fetch("/api/availability?checkIn=2026-11-13&nights=3&guests=2").then((r) => r.json()).then((d) => d.rooms.find((r) => r.id === "deluxe").left));
  check("booking again: 4 of the 5 deluxe rooms are still free, so it can be chosen", left === 4 && !(await page.isDisabled('[data-room-opt="deluxe"] input')), String(left));

  // Check, then cancel, with the code and phone (filled in for us after booking).
  check("after booking, the check/cancel box is pre-filled", (await page.inputValue("[data-manage-code]")) === bookingCode);
  await page.evaluate(() => { document.querySelector("[data-manage]").open = true; });
  await page.click("[data-manage-check]");
  await page.waitForFunction(() => /Confirmed|ยืนยันแล้ว/.test(document.querySelector("[data-manage-result]").textContent));
  check("checking shows the booking and a cancel button", await page.isVisible("[data-manage-cancel]"));
  check("the page has no errors or CSP violations", await clean(page), await problems(page));
  await ctx.close();
}

/* ------------------------------------------- "Book this room" on a room card */
{
  const { ctx, page } = await newPage();
  await page.waitForSelector("[data-book-form]:not([hidden])");
  await waitRooms(page);
  await page.click('[data-book-room="family"]');
  await page.waitForFunction(() => document.querySelector('[data-room-opt="family"] input').checked);
  check("'Book this room' on the Family Suite chooses it in the form", true);
  await page.waitForTimeout(300);
  const inView = await page.evaluate(() => { const r = document.querySelector("#booking").getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
  check("…and scrolls to the form", inView);
  await ctx.close();
}

/* ------------------------------------------------------------- sold out */
{
  // Both family suites booked Fri→Sun by other guests.
  for (const [i, ip] of [[1, "10.8.0.1"], [2, "10.8.0.2"]]) {
    const r = await api("/bookings", { room: "family", checkIn: "2026-11-13", nights: 2, guests: 4, name: "Guest " + i, phone: "08900000" + i + "0" }, ip);
    if (!r.booking) console.log("setup failed", r);
  }
  const { ctx, page } = await newPage();
  await page.waitForSelector("[data-book-form]:not([hidden])");
  await waitRooms(page);
  check("sold out: the Family Suite says fully booked and can't be chosen", (await page.isDisabled('[data-room-opt="family"] input')) && /Fully booked|เต็มแล้ว/.test(await optText(page, "family")), await optText(page, "family"));
  await page.fill("[data-book-checkin]", "2026-11-15");
  await page.dispatchEvent("[data-book-checkin]", "change");
  await page.waitForFunction(() => !document.querySelector('[data-room-opt="family"] input').disabled);
  check("from Sunday (their check-out day) it is free again", true);
  await ctx.close();
}

/* ----------------------------------------------------- the front desk */
{
  const { ctx, page } = await newPage(desktop, BASE + "admin.html");
  check("the dashboard asks for the staff key first", (await page.isVisible("[data-login]")) && (await page.isHidden("[data-board]")));
  await page.fill("[data-key]", "wrong-key");
  await page.click("[data-signin]");
  await page.waitForFunction(() => document.querySelector("[data-login-error]").textContent.length > 0);
  check("a wrong key is refused", await page.isHidden("[data-board]"));
  await page.fill("[data-key]", "local-admin");
  await page.click("[data-signin]");
  await page.waitForSelector("[data-board]:not([hidden])");
  check("today (Thursday) has no arrivals yet", /No arrivals/.test(await page.innerText("[data-arrivals]")));
  await page.click("[data-next]");
  await page.waitForFunction(() => document.querySelector("[data-date]").value === "2026-11-13");
  await page.waitForFunction(() => document.querySelectorAll("[data-arrivals] .admin__card").length >= 3);
  const arrivals = await page.innerText("[data-arrivals]");
  check("Friday: the booking from the form is an arrival, with name, phone and note", arrivals.includes(bookingCode) && /Somchai/.test(arrivals) && /0815551234/.test(arrivals) && /21:00/.test(arrivals), arrivals.slice(0, 300));
  const tiles = await page.innerText(".admin__tiles");
  check("the tiles count arrivals and rooms taken tonight", /3/.test(await page.innerText('[data-sum="arrivals"]')) && /3 \/ 14/.test(await page.innerText('[data-sum="occupied"]')), tiles);
  check("the room line shows the family suites as full", /Family Suite[\s\S]*0 \/ 2/.test(await page.innerText("[data-rooms]")), await page.innerText("[data-rooms]"));
  const card = page.locator("[data-arrivals] .admin__card", { hasText: bookingCode });
  await card.getByRole("button", { name: /Check in/ }).click();
  await page.waitForFunction((code) => Array.from(document.querySelectorAll("[data-arrivals] .admin__card")).some((c) => c.textContent.includes(code) && /Checked in/.test(c.textContent)), bookingCode);
  check("'Check in' moves the guest to checked in", true);
  await shot(page, "3-admin", { fullPage: true });
  // Saturday: the family suites are in house; Monday the deluxe guest leaves.
  await page.click("[data-next]");
  await page.waitForFunction(() => document.querySelector("[data-date]").value === "2026-11-14");
  check("Saturday: Friday's guests are in house", (await page.$$("[data-inhouse] .admin__card")).length === 3);
  await page.fill("[data-date]", "2026-11-16");
  await page.dispatchEvent("[data-date]", "change");
  await page.waitForFunction(() => document.querySelector("[data-date]").value === "2026-11-16" && document.querySelectorAll("[data-departures] .admin__card").length === 1);
  const leaving = page.locator("[data-departures] .admin__card", { hasText: bookingCode });
  await leaving.getByRole("button", { name: /Check out/ }).click();
  await page.waitForFunction(() => /Checked out/.test(document.querySelector("[data-departures]").textContent));
  check("Monday: the deluxe guest is a departure and can be checked out", true);
  const lookup = await api(`/lookup?code=${bookingCode}&phone=1234`);
  check("the guest's own lookup now says checked out", lookup.found && lookup.found.status === "checked-out", JSON.stringify(lookup));
  await page.click("[data-signout]");
  check("signing out hides everything again", (await page.isHidden("[data-board]")) && (await page.evaluate(() => sessionStorage.getItem("shop-admin-key"))) === null);
  check("the dashboard has no errors or CSP violations", await clean(page), await problems(page));
  await ctx.close();
}

/* ----------------------------------------------- no backend (static host) */
{
  const { ctx, page } = await newPage({ noApi: true });
  await page.waitForTimeout(300);
  check("without a backend the 'book on LINE' message stays and the form stays hidden", (await page.isVisible("[data-book-offline]")) && (await page.isHidden("[data-book-form]")));
  await page.click(".cg-launch");
  await page.click("[data-cg-start=text]");
  const a = await page.evaluate(() => window.ShopConcierge.ask("book a room tomorrow for 2 nights"));
  check("…and the concierge sends room bookings to LINE", /LINE/.test(a), a);
  check("no errors besides the refused /api calls", !(await page.evaluate(() => window.__csp.length)) && !page.__errors.length, await problems(page));
  await ctx.close();
}

/* ------------------------------------------------------------ accessibility */
{
  // bypassCSP: only so the test can inject axe-core; the page itself is unchanged.
  const { ctx, page } = await newPage({ bypassCSP: true });
  await page.waitForSelector("[data-book-form]:not([hidden])");
  await waitRooms(page);
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  let v = await page.evaluate(async () => (await window.axe.run("#booking")).violations.map((x) => `${x.id} (${x.nodes.map((n) => n.target).join(", ")})`));
  check("axe finds no accessibility violations in the booking section", !v.length, v.join("; "));
  await ctx.close();
  const admin = await newPage({ bypassCSP: true, ...desktop }, BASE + "admin.html");
  await admin.page.fill("[data-key]", "local-admin");
  await admin.page.click("[data-signin]");
  await admin.page.waitForSelector("[data-board]:not([hidden])");
  await admin.page.click("[data-next]");
  await admin.page.waitForFunction(() => document.querySelectorAll("[data-arrivals] .admin__card").length >= 1);
  await admin.page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  v = await admin.page.evaluate(async () => (await window.axe.run()).violations.map((x) => `${x.id} (${x.nodes.map((n) => n.target).join(", ")})`));
  check("axe finds no accessibility violations on the dashboard", !v.length, v.join("; "));
  await admin.ctx.close();
}

// The "check availability" bar under the hero fills in the booking form and goes there.
{
  const { ctx, page } = await newPage(desktop);
  await page.waitForSelector("[data-quick]:not([hidden])");
  check("the quick bar shows once the booking system answers", true);
  await page.fill("[data-quick-checkin]", "2026-11-20");
  await page.selectOption("[data-quick-nights]", "3");
  await page.selectOption("[data-quick-guests]", "3");
  await page.click(".quick__go");
  await waitRooms(page);
  check("the quick bar copies dates, nights and guests into the form",
    (await page.inputValue("[data-book-checkin]")) === "2026-11-20" && (await page.inputValue("[data-book-nights]")) === "3" && (await page.inputValue("[data-book-guests]")) === "3");
  const arrived = await page.waitForFunction(() => Math.abs(document.querySelector("#booking").getBoundingClientRect().top) < 30, null, { timeout: 5000 }).then(() => true, () => false);
  check("the quick bar scrolls to the booking form and focuses check-in", arrived && (await page.evaluate(() => document.activeElement.id)) === "book-checkin");
  check("no console errors or CSP violations with the quick bar", await clean(page), await problems(page));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
