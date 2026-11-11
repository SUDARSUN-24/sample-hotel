/* =============================================================================
   backend/core.mjs — the hotel's booking system (all the rules, no hosting code).
   -----------------------------------------------------------------------------
   Used in two places with the same code:
     • netlify/functions/api.mjs  — live, storing data in Netlify Blobs (free),
     • tools/serve.mjs            — on your computer, storing data in memory.
   Room types, prices and how many rooms exist come from
   backend/shop.generated.mjs, which `node tools/bake.mjs` writes from
   site/config.js. So prices are worked out on the server: a visitor cannot
   send a made-up total.

   Routes (all under /api):
     GET  /health                               is the backend there?
     GET  /availability?checkIn=&nights=&guests=   which rooms are free, and the price
     POST /bookings                             book a stay
     GET  /lookup?code=&phone=                  a guest checks their booking
     POST /cancel                               a guest cancels it
     GET  /admin/day?date=                      staff: arrivals, in house, departures
     POST /admin/status                         staff: change a status
   Staff routes need the header  x-admin-key  (the ADMIN_KEY setting).

   A stay covers the nights from checkIn up to (not including) checkOut. A room
   type is free for a stay when, on every one of those nights, fewer rooms of
   that type are taken than the hotel has.

   Personal data kept: name, phone number, optional note. No payment details:
   guests pay at the hotel. Records are deleted 30 days after check-out.
   ========================================================================== */
import crypto from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
const KEEP_DAYS = 30;
const WRITES_PER_HOUR = 6;       // new bookings from one visitor
const ADMIN_TRIES_PER_HOUR = 10; // wrong staff keys from one visitor

export const STAY_STATUS = ["confirmed", "checked-in", "checked-out", "no-show", "cancelled"];

const pad = (n) => String(n).padStart(2, "0");
const toMin = (hhmm) => parseInt(hhmm.slice(0, 2), 10) * 60 + parseInt(hhmm.slice(3), 10);
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
const addDays = (date, n) => new Date(Date.parse(date + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const clean = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

class ApiError extends Error {
  constructor(status, code, th, en) {
    super(en);
    this.status = status;
    this.code = code;
    this.th = th;
    this.en = en;
  }
}
const fail = (status, code, th, en) => { throw new ApiError(status, code, th, en); };

export function createApi({ shop, store, adminKey, now = () => new Date() }) {
  const rules = shop.booking;

  /* -------------------------------------------------------------------- time */
  // "Now" in the hotel's own time zone, whatever the server's clock is set to.
  function hotelNow() {
    const parts = {};
    new Intl.DateTimeFormat("en-CA", {
      timeZone: shop.timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now()).forEach((p) => { parts[p.type] = p.value; });
    return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10) };
  }

  // Checks the dates of a stay and returns { checkIn, nights, checkOut }.
  function stayDates(input) {
    const t = hotelNow();
    const checkIn = input.checkIn;
    const nights = parseInt(input.nights, 10);
    if (!isDate(checkIn)) fail(400, "bad_date", "วันเข้าพักไม่ถูกต้อง", "That check-in date isn't valid.");
    if (!(nights >= 1 && nights <= rules.maxNights)) {
      fail(400, "bad_nights", `จองออนไลน์ได้ 1–${rules.maxNights} คืน พักนานกว่านี้ทักไลน์ได้เลย`, `Online booking is for 1–${rules.maxNights} nights. For a longer stay, message us on LINE.`);
    }
    if (checkIn < t.date) fail(400, "past_date", "วันเข้าพักผ่านมาแล้ว", "That check-in date has passed.");
    if (checkIn === t.date && t.minutes > toMin(rules.lastSameDay)) {
      fail(400, "too_late_today", `จองเข้าพักวันนี้ได้ถึง ${rules.lastSameDay} น. กรุณาโทรหาโรงแรม`, `Same-day bookings close at ${rules.lastSameDay}. Please call the hotel.`);
    }
    if (checkIn > addDays(t.date, rules.daysAhead)) {
      fail(400, "too_far", `จองล่วงหน้าได้ไม่เกิน ${rules.daysAhead} วัน`, `You can book up to ${rules.daysAhead} days ahead.`);
    }
    return { checkIn, nights, checkOut: addDays(checkIn, nights) };
  }

  /* ------------------------------------------------------------ availability */
  const active = (s) => s.status !== "cancelled" && s.status !== "no-show";
  // Every booking that overlaps the nights [from, to). Keys are stay/<checkIn>/<code>,
  // so only bookings that started within maxNights before `to` can overlap.
  async function staysBetween(from, to) {
    const earliest = addDays(from, -rules.maxNights);
    const keys = (await store.list("stay/")).filter((k) => { const d = k.split("/")[1]; return d >= earliest && d < to; });
    const all = await Promise.all(keys.map((k) => store.get(k)));
    return all.filter((s) => s && s.checkOut > from && s.checkIn < to);
  }
  // Rooms of a type left for a whole stay = the fewest left on any of its nights.
  function roomsLeft(room, stay, bookings) {
    let left = room.count;
    for (let night = stay.checkIn; night < stay.checkOut; night = addDays(night, 1)) {
      const taken = bookings.filter((s) => active(s) && s.room === room.id && s.checkIn <= night && night < s.checkOut).length;
      left = Math.min(left, room.count - taken);
    }
    return Math.max(0, left);
  }

  /* ---------------------------------------------------------- shared helpers */
  function person(body) {
    const name = clean(body.name, 60);
    const digits = String(body.phone == null ? "" : body.phone).replace(/\D/g, "");
    if (name.length < 1) fail(400, "bad_name", "กรุณาใส่ชื่อ", "Please enter a name.");
    if (digits.length < 9 || digits.length > 15) fail(400, "bad_phone", "กรุณาใส่เบอร์โทรให้ถูกต้อง", "Please enter a valid phone number.");
    return { name, phone: digits, note: clean(body.note, 300), lang: body.lang === "en" ? "en" : "th" };
  }
  async function newCode() {
    for (let i = 0; i < 6; i++) {
      const code = Array.from(crypto.randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
      if (!(await store.get(`code/${code}`))) return code;
    }
    fail(503, "busy", "ระบบไม่ว่าง ลองใหม่อีกครั้ง", "The system is busy. Please try again.");
  }
  // The visitor's address is only kept as a salted hash, and only for an hour.
  const visitor = (ip) => crypto.createHash("sha256").update(`${adminKey || "local"}|${ip || "unknown"}`).digest("hex").slice(0, 24);
  const hourStamp = () => Math.floor(now().getTime() / 3600000);
  async function limit(kind, ip, max) {
    const key = `rate/${hourStamp()}/${kind}/${visitor(ip)}`;
    const seen = (await store.get(key)) || { n: 0 };
    if (seen.n >= max) fail(429, "slow_down", "ทำรายการบ่อยเกินไป กรุณาลองใหม่ภายหลังหรือทักไลน์โรงแรม", "Too many requests. Please try later, or message the hotel on LINE.");
    await store.set(key, { n: seen.n + 1 });
  }
  const publicView = (s) => ({
    code: s.code, status: s.status, room: s.room, roomName: s.roomName, checkIn: s.checkIn, checkOut: s.checkOut,
    nights: s.nights, guests: s.guests, name: s.name, total: s.total,
  });

  async function findByCode(body) {
    const code = clean(body.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const digits = String(body.phone == null ? "" : body.phone).replace(/\D/g, "");
    const miss = () => fail(404, "not_found", "ไม่พบการจอง กรุณาตรวจรหัสและเบอร์โทร", "We couldn't find that booking. Please check the code and phone number.");
    if (code.length < 4 || digits.length < 4) miss();
    const index = await store.get(`code/${code}`);
    const record = index && (await store.get(index.key));
    // The phone number is the second half of the "password": the last 4 digits must match.
    if (!record || record.phone.slice(-4) !== digits.slice(-4)) miss();
    return { key: index.key, record };
  }

  /* ------------------------------------------------------------------ routes */
  const routes = {
    "GET /health": async () => ({ ok: true, booking: !!rules.enabled, orders: false }),

    "GET /availability": async ({ query }) => {
      if (!rules.enabled) fail(404, "off", "ปิดรับจองออนไลน์", "Online booking is off.");
      const stay = stayDates(query);
      const guests = Math.max(1, parseInt(query.guests, 10) || 2);
      const bookings = await staysBetween(stay.checkIn, stay.checkOut);
      return {
        ...stay, guests,
        rooms: shop.rooms.map((room) => {
          const left = roomsLeft(room, stay, bookings);
          return { id: room.id, price: room.price, total: room.price * stay.nights, sleeps: room.sleeps, left, fits: room.sleeps >= guests, available: left > 0 && room.sleeps >= guests };
        }),
      };
    },

    "POST /bookings": async ({ body, ip }) => {
      if (!rules.enabled) fail(404, "off", "ปิดรับจองออนไลน์", "Online booking is off.");
      if (body.website) fail(400, "bad_request", "ส่งข้อมูลไม่สำเร็จ", "That didn't go through."); // hidden field: only bots fill it
      const stay = stayDates(body);
      const room = shop.rooms.find((r) => r.id === body.room);
      if (!room) fail(400, "bad_room", "กรุณาเลือกห้อง", "Please choose a room.");
      const guests = parseInt(body.guests, 10);
      if (!(guests >= 1 && guests <= room.sleeps)) {
        fail(400, "bad_guests", `${room.th} พักได้สูงสุด ${room.sleeps} ท่าน`, `The ${room.en} sleeps up to ${room.sleeps}.`);
      }
      const who = person(body);
      await limit("write", ip, WRITES_PER_HOUR);
      if (roomsLeft(room, stay, await staysBetween(stay.checkIn, stay.checkOut)) < 1) {
        fail(409, "sold_out", `${room.th} เต็มแล้วในช่วงวันนั้น กรุณาเลือกห้องหรือวันอื่น`, `The ${room.en} is fully booked for those dates. Please choose another room or other dates.`);
      }
      const code = await newCode();
      const record = {
        code, status: "confirmed", room: room.id, roomName: { th: room.th, en: room.en }, ...stay, guests,
        price: room.price, total: room.price * stay.nights, ...who, createdAt: now().toISOString(),
      };
      const key = `stay/${stay.checkIn}/${code}`;
      await store.set(key, record);
      await store.set(`code/${code}`, { key });
      return { booking: publicView(record) };
    },

    "GET /lookup": async ({ query }) => ({ found: publicView((await findByCode(query)).record) }),

    "POST /cancel": async ({ body }) => {
      const { key, record } = await findByCode(body);
      if (record.status !== "confirmed") {
        if (record.status === "cancelled") return { found: publicView(record) };
        fail(409, "too_late", "การจองนี้ยกเลิกออนไลน์ไม่ได้แล้ว กรุณาติดต่อโรงแรม", "This booking can no longer be cancelled online. Please contact the hotel.");
      }
      // Free cancellation until the day before arrival.
      if (hotelNow().date >= record.checkIn) {
        fail(409, "too_late", "ยกเลิกออนไลน์ได้ถึงหนึ่งวันก่อนเข้าพัก กรุณาติดต่อโรงแรม", "Online cancellation closes the day before arrival. Please contact the hotel.");
      }
      record.status = "cancelled";
      record.cancelledAt = now().toISOString();
      await store.set(key, record);
      return { found: publicView(record) };
    },

    "GET /admin/day": async ({ query }) => {
      const date = isDate(query.date) ? query.date : hotelNow().date;
      await purge();
      // Everything touching this day: staying tonight, or leaving this morning.
      const stays = (await staysBetween(addDays(date, -1), addDays(date, 1))).sort((a, b) => (a.roomName.en + a.createdAt).localeCompare(b.roomName.en + b.createdAt));
      const arrivals = stays.filter((s) => s.checkIn === date);
      const departures = stays.filter((s) => s.checkOut === date);
      const inHouse = stays.filter((s) => s.checkIn < date && s.checkOut > date);
      const tonight = stays.filter((s) => active(s) && s.checkIn <= date && s.checkOut > date);
      const totalRooms = shop.rooms.reduce((n, r) => n + r.count, 0);
      return {
        date, today: hotelNow().date, shop: shop.name, arrivals, inHouse, departures,
        rooms: shop.rooms.map((r) => ({ id: r.id, th: r.th, en: r.en, count: r.count, taken: tonight.filter((s) => s.room === r.id).length })),
        summary: {
          arrivals: arrivals.filter(active).length,
          departures: departures.filter(active).length,
          occupied: tonight.length,
          totalRooms,
          revenue: tonight.reduce((n, s) => n + s.price, 0), // room revenue for this night
        },
      };
    },

    "POST /admin/status": async ({ body }) => {
      const index = await store.get(`code/${clean(body.code, 12).toUpperCase()}`);
      const record = index && (await store.get(index.key));
      if (!record) fail(404, "not_found", "ไม่พบการจอง", "Not found.");
      if (!STAY_STATUS.includes(body.status)) fail(400, "bad_status", "สถานะไม่ถูกต้อง", "That status isn't valid.");
      record.status = body.status;
      record.updatedAt = now().toISOString();
      await store.set(index.key, record);
      return { record };
    },
  };

  // Delete bookings KEEP_DAYS after check-out, at most once a day (runs when staff open the dashboard).
  async function purge() {
    const today = hotelNow().date;
    const meta = await store.get("meta/purge");
    if (meta && meta.date === today) return;
    await store.set("meta/purge", { date: today });
    const cutoff = addDays(today, -KEEP_DAYS);
    for (const key of await store.list("stay/")) {
      const [, checkIn, code] = key.split("/");
      if (checkIn >= cutoff) continue; // cannot be old enough yet
      const record = await store.get(key);
      if (!record || record.checkOut < cutoff) { await store.delete(key); await store.delete(`code/${code}`); }
    }
    const hour = hourStamp();
    for (const key of await store.list("rate/")) {
      if (parseInt(key.split("/")[1], 10) < hour) await store.delete(key);
    }
  }

  function isAdmin(key) {
    if (!adminKey || typeof key !== "string") return false;
    const a = crypto.createHash("sha256").update(key).digest();
    const b = crypto.createHash("sha256").update(adminKey).digest();
    return crypto.timingSafeEqual(a, b); // same time whether the key is nearly right or not
  }

  // One request in, { status, body } out.
  return async function handle({ method, path, query = {}, body = {}, ip = "", key = "" }) {
    try {
      const route = routes[`${method} ${path}`];
      if (!route) fail(404, "no_route", "ไม่พบหน้านี้", "Not found.");
      if (path.startsWith("/admin/")) {
        if (!isAdmin(key)) {
          await limit("admin", ip, ADMIN_TRIES_PER_HOUR);
          fail(401, "unauthorized", "รหัสพนักงานไม่ถูกต้อง", "The staff key isn't right.");
        }
      }
      if (body === null || typeof body !== "object" || Array.isArray(body)) fail(400, "bad_request", "ข้อมูลไม่ถูกต้อง", "Bad request.");
      return { status: 200, body: await route({ query, body, ip }) };
    } catch (err) {
      if (err instanceof ApiError) return { status: err.status, body: { error: err.code, message: { th: err.th, en: err.en } } };
      console.error("[api]", err);
      return { status: 500, body: { error: "server", message: { th: "ระบบขัดข้อง กรุณาลองใหม่หรือทักไลน์โรงแรม", en: "Something went wrong. Please try again, or message the hotel on LINE." } } };
    }
  };
}

// A store that lives in memory: for the local server and the tests.
export function memoryStore() {
  const data = new Map();
  return {
    async get(key) { return data.has(key) ? JSON.parse(data.get(key)) : null; },
    async set(key, value) { data.set(key, JSON.stringify(value)); },
    async delete(key) { data.delete(key); },
    async list(prefix) { return Array.from(data.keys()).filter((k) => k.startsWith(prefix)).sort(); },
    clear() { data.clear(); },
  };
}
