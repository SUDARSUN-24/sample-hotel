/* tools/tests/api.test.mjs — the hotel booking rules (backend/core.mjs).
     node --test tools/tests/api.test.mjs
   No browser and no network: the same code that runs on Netlify, with an
   in-memory store and a clock fixed to Thursday 12 Nov 2026, 10:00 Bangkok.
   Rooms (config.js): garden 1,800 × 5 · deluxe 2,600 × 5 · studio 2,200 × 2 (sleeps 3) · family 3,900 × 2 (sleeps 4). */
import test from "node:test";
import assert from "node:assert/strict";
import { createApi, memoryStore } from "../../backend/core.mjs";
import shop from "../../backend/shop.generated.mjs";

const THU = "2026-11-12";
const FRI = "2026-11-13";
function setup(at = `${THU}T10:00:00+07:00`) {
  const store = memoryStore();
  const clock = { now: new Date(at) };
  const api = createApi({ shop, store, adminKey: "staff-secret", now: () => clock.now });
  const get = (path, query = {}, extra = {}) => api({ method: "GET", path, query, ...extra });
  const post = (path, body = {}, extra = {}) => api({ method: "POST", path, body, ip: "1.1.1.1", ...extra });
  return { store, clock, api, get, post };
}
const guest = { name: "Mali", phone: "081-234-5678" };
const book = (t, over = {}) => t.post("/bookings", { room: "studio", checkIn: FRI, nights: 2, guests: 2, ...guest, ...over }, over.ip ? { ip: over.ip } : {});
const avail = async (t, q) => (await t.get("/availability", { checkIn: FRI, nights: "2", guests: "2", ...q })).body;
const left = async (t, id, q) => (await avail(t, q)).rooms.find((r) => r.id === id).left;
const staff = { key: "staff-secret" };

test("health says booking is on and there are no pre-orders", async () => {
  const t = setup();
  assert.deepEqual((await t.get("/health")).body, { ok: true, booking: true, orders: false });
});

test("the generated rooms match config.js", () => {
  assert.deepEqual(shop.rooms.map((r) => [r.id, r.price, r.sleeps, r.count]), [["garden", 1800, 2, 5], ["deluxe", 2600, 2, 5], ["studio", 2200, 3, 2], ["family", 3900, 4, 2]]);
});

test("availability: every room with the price for the whole stay", async () => {
  const t = setup();
  const body = await avail(t, { nights: "3" });
  assert.equal(body.checkIn, FRI);
  assert.equal(body.checkOut, "2026-11-16");
  assert.equal(body.nights, 3);
  const deluxe = body.rooms.find((r) => r.id === "deluxe");
  assert.deepEqual(deluxe, { id: "deluxe", price: 2600, total: 7800, sleeps: 2, left: 5, fits: true, available: true });
  const three = await avail(t, { guests: "3" });
  assert.deepEqual(three.rooms.filter((r) => r.available).map((r) => r.id), ["studio", "family"], "3 guests: only rooms that sleep 3+");
});

test("availability refuses bad, past and too-far dates, and too many nights", async () => {
  const t = setup();
  assert.equal((await avail(t, { checkIn: "13/11/2026" })).error, "bad_date");
  assert.equal((await avail(t, { checkIn: "2026-11-11" })).error, "past_date");
  assert.equal((await avail(t, { checkIn: "2027-05-12" })).error, "too_far", "more than 180 days ahead");
  assert.equal((await avail(t, { nights: "15" })).error, "bad_nights");
  assert.equal((await avail(t, { nights: "0" })).error, "bad_nights");
  assert.ok((await avail(t, { checkIn: THU })).rooms, "tonight is fine at 10:00");
  const late = setup(`${THU}T20:30:00+07:00`);
  assert.equal((await avail(late, { checkIn: THU })).error, "too_late_today", "same-day bookings close at 20:00");
});

test("a booking is confirmed with a code, priced by the server, and keeps the phone private", async () => {
  const t = setup();
  const { status, body } = await book(t, { room: "deluxe", nights: 3, total: 1, price: 1, note: "late arrival <b>22:00</b>" });
  assert.equal(status, 200);
  assert.match(body.booking.code, /^[A-Z2-9]{6}$/);
  assert.equal(body.booking.total, 7800, "the visitor can't send their own price");
  assert.equal(body.booking.checkOut, "2026-11-16");
  assert.deepEqual(body.booking.roomName, { th: "ห้องดีลักซ์วิวสระ", en: "Deluxe Pool View" });
  assert.equal(body.booking.phone, undefined, "the phone number is not echoed back");
  const saved = await t.store.get(`stay/${FRI}/${body.booking.code}`);
  assert.equal(saved.phone, "0812345678");
  assert.ok(!/[<>]/.test(saved.note), "angle brackets are stripped from notes");
});

test("rooms run out night by night, not stay by stay", async () => {
  const t = setup();
  // Two studios: one Fri→Sun, one Sat→Mon. Saturday night has both taken.
  assert.equal((await book(t, { phone: "0810000001" })).status, 200);
  assert.equal((await book(t, { checkIn: "2026-11-14", phone: "0810000002" })).status, 200);
  assert.equal(await left(t, "studio", { checkIn: FRI, nights: "1" }), 1, "Friday night: one left");
  assert.equal(await left(t, "studio", { checkIn: "2026-11-14", nights: "1" }), 0, "Saturday night: none");
  assert.equal(await left(t, "studio", { checkIn: FRI, nights: "3" }), 0, "a stay over Saturday can't have one");
  assert.equal(await left(t, "studio", { checkIn: "2026-11-16", nights: "2" }), 2, "after both have left");
  const full = await book(t, { checkIn: FRI, nights: 3, phone: "0810000003", ip: "3.3.3.3" });
  assert.equal(full.status, 409);
  assert.equal(full.body.error, "sold_out");
  assert.ok(full.body.message.th && full.body.message.en);
  // Check-out day frees the room: Sunday night only has the Sat→Mon guest.
  assert.equal((await book(t, { checkIn: "2026-11-15", nights: 1, phone: "0810000004", ip: "3.3.3.3" })).status, 200, "Sunday night: one was free");
});

test("bad bookings are refused with a message in both languages", async () => {
  const t = setup();
  const cases = [
    [{ room: "penthouse" }, "bad_room"], [{ guests: 3, room: "garden" }, "bad_guests"], [{ guests: 0 }, "bad_guests"], [{ guests: 5, room: "family" }, "bad_guests"],
    [{ nights: 20 }, "bad_nights"], [{ checkIn: "2026-11-01" }, "past_date"], [{ checkIn: "" }, "bad_date"],
    [{ name: "" }, "bad_name"], [{ phone: "12345" }, "bad_phone"], [{ website: "http://spam" }, "bad_request"],
  ];
  for (const [over, code] of cases) {
    const r = await book(t, over);
    assert.equal(r.body.error, code, JSON.stringify(over));
    assert.ok(r.body.message.th && r.body.message.en);
  }
  assert.equal((await t.store.list("stay/")).length, 0, "nothing was saved");
});

test("lookup and cancel need the code and the phone's last 4 digits", async () => {
  const t = setup();
  const code = (await book(t)).body.booking.code;
  assert.equal((await t.get("/lookup", { code, phone: "0000000000" })).status, 404);
  assert.equal((await t.get("/lookup", { code: "ZZZZZZ", phone: guest.phone })).status, 404);
  const found = await t.get("/lookup", { code: code.toLowerCase(), phone: "5678" });
  assert.equal(found.body.found.status, "confirmed");
  assert.equal(found.body.found.total, 4400);
  assert.equal((await t.post("/cancel", { code, phone: "0000" })).status, 404);
  assert.equal((await t.post("/cancel", { code, phone: guest.phone })).body.found.status, "cancelled");
  assert.equal(await left(t, "studio"), 2, "a cancelled booking frees the room");
});

test("free cancellation ends the day before arrival", async () => {
  const t = setup();
  const code = (await book(t)).body.booking.code; // arrives Friday
  t.clock.now = new Date(`${FRI}T08:00:00+07:00`);
  const r = await t.post("/cancel", { code, phone: guest.phone });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "too_late");
});

test("staff routes need the key; the day view shows arrivals, in house and departures", async () => {
  const t = setup();
  const thu = (await book(t, { room: "garden", checkIn: THU, nights: 2, phone: "0811111111" })).body.booking.code; // Thu→Sat
  const fri = (await book(t, { room: "family", checkIn: FRI, nights: 1, guests: 4, phone: "0822222222" })).body.booking.code; // Fri→Sat
  await book(t, { room: "deluxe", checkIn: "2026-11-11", nights: 2, phone: "0833333333" }).catch(() => {}); // past: refused
  assert.equal((await t.get("/admin/day", {}, { key: "" })).status, 401);
  assert.equal((await t.get("/admin/day", {}, { key: "wrong" })).status, 401);

  const day = (await t.get("/admin/day", { date: FRI }, staff)).body;
  assert.equal(day.date, FRI);
  assert.equal(day.today, THU);
  assert.deepEqual(day.arrivals.map((s) => s.code), [fri]);
  assert.deepEqual(day.inHouse.map((s) => s.code), [thu]);
  assert.deepEqual(day.departures, []);
  assert.deepEqual(day.summary, { arrivals: 1, departures: 0, occupied: 2, totalRooms: 14, revenue: 1800 + 3900 });
  assert.equal(day.arrivals[0].phone, "0822222222", "staff see the phone number");
  assert.deepEqual(day.rooms.map((r) => [r.id, r.taken]), [["garden", 1], ["deluxe", 0], ["studio", 0], ["family", 1]]);

  const sat = (await t.get("/admin/day", { date: "2026-11-14" }, staff)).body;
  assert.equal(sat.departures.length, 2);
  assert.equal(sat.summary.occupied, 0);

  const moved = await t.post("/admin/status", { code: thu, status: "checked-in" }, staff);
  assert.equal(moved.body.record.status, "checked-in");
  assert.equal((await t.post("/admin/status", { code: thu, status: "seated" }, staff)).body.error, "bad_status");
  assert.equal((await t.post("/admin/status", { code: thu, status: "checked-in" })).status, 401, "status changes need the key too");
  assert.equal((await t.post("/cancel", { code: thu, phone: "0811111111" })).body.error, "too_late", "a checked-in stay can't be cancelled online");
  await t.post("/admin/status", { code: fri, status: "no-show" }, staff);
  assert.equal(await left(t, "family", { nights: "1" }), 2, "a no-show frees the room");
});

test("too many wrong staff keys from one visitor are blocked", async () => {
  const t = setup();
  for (let i = 0; i < 10; i++) assert.equal((await t.get("/admin/day", {}, { key: "guess" + i, ip: "9.9.9.9" })).status, 401);
  assert.equal((await t.get("/admin/day", {}, { key: "guess", ip: "9.9.9.9" })).status, 429);
  assert.equal((await t.get("/admin/day", {}, { key: "staff-secret", ip: "9.9.9.9" })).status, 200, "the right key still works");
});

test("one visitor can make 6 bookings an hour, then is asked to wait", async () => {
  const t = setup();
  for (let i = 0; i < 6; i++) assert.equal((await book(t, { room: "garden", checkIn: `2026-11-${20 + i}`, nights: 1 })).status, 200);
  assert.equal((await book(t, { room: "garden", checkIn: "2026-11-27", nights: 1 })).status, 429);
  assert.equal((await book(t, { room: "garden", checkIn: "2026-11-27", nights: 1, ip: "2.2.2.2" })).status, 200, "another visitor is not affected");
  t.clock.now = new Date(`${THU}T11:01:00+07:00`);
  assert.equal((await book(t, { room: "garden", checkIn: "2026-11-28", nights: 1 })).status, 200, "the limit resets the next hour");
  assert.ok(!(await t.store.list("rate/")).some((k) => k.includes("1.1.1.1")), "addresses are stored only as hashes");
});

test("records are deleted 30 days after check-out when staff open the dashboard", async () => {
  const t = setup();
  const code = (await book(t)).body.booking.code; // Fri 13 → Sun 15 Nov
  t.clock.now = new Date("2026-12-14T10:00:00+07:00"); // 29 days after check-out
  await t.get("/admin/day", {}, staff);
  assert.ok(await t.store.get(`stay/${FRI}/${code}`), "kept at 29 days");
  t.clock.now = new Date("2026-12-16T10:00:00+07:00"); // 31 days after
  await t.get("/admin/day", {}, staff);
  assert.equal(await t.store.get(`stay/${FRI}/${code}`), null);
  assert.equal(await t.store.get(`code/${code}`), null);
});

test("unknown routes and broken bodies do not crash", async () => {
  const t = setup();
  assert.equal((await t.get("/nope")).status, 404);
  assert.equal((await t.api({ method: "POST", path: "/bookings", body: null })).status, 400);
  assert.equal((await t.api({ method: "POST", path: "/bookings", body: [] })).status, 400);
  assert.equal((await t.get("/orders")).status, 404, "no pre-order route on the hotel");
});
