/* =============================================================================
   admin.js — the front desk dashboard (admin.html): one day's arrivals,
   guests in house and departures, with buttons to check guests in and out.
   -----------------------------------------------------------------------------
   The staff key is typed in once and kept only for this browser tab
   (sessionStorage). Every request sends it in the x-admin-key header; the
   server (backend/core.mjs) checks it. The board refreshes every 30 seconds.
   Everything from guests (names, notes) is written with textContent, never
   as HTML.
   ========================================================================== */
(function () {
  "use strict";
  const $ = (sel, root = document) => root.querySelector(sel);
  const ui = {
    shop: $("[data-shop]"), login: $("[data-login]"), key: $("[data-key]"), signin: $("[data-signin]"), loginError: $("[data-login-error]"),
    signout: $("[data-signout]"), board: $("[data-board]"), date: $("[data-date]"), prev: $("[data-prev]"), next: $("[data-next]"),
    today: $("[data-today]"), updated: $("[data-updated]"), rooms: $("[data-rooms]"),
    arrivals: $("[data-arrivals]"), inHouse: $("[data-inhouse]"), departures: $("[data-departures]"),
  };
  const KEY = "shop-admin-key";
  let key = "";
  try { key = sessionStorage.getItem(KEY) || ""; } catch (e) { /* storage blocked: type the key each time */ }
  let today = "";
  let timer = 0;

  const STATUS = {
    confirmed: "ยืนยันแล้ว · Confirmed", "checked-in": "เช็กอินแล้ว · Checked in", "checked-out": "เช็กเอาต์แล้ว · Checked out",
    "no-show": "ไม่มา · No-show", cancelled: "ยกเลิก · Cancelled",
  };
  const ALL = ["confirmed", "checked-in", "checked-out", "no-show", "cancelled"];
  // The usual next step, depending on which list the card is in: [new status, button text].
  const NEXT = {
    arrivals: { confirmed: [["checked-in", "เช็กอิน · Check in"], ["no-show", "ไม่มา · No-show"]] },
    inHouse: { confirmed: [["checked-in", "เช็กอิน · Check in"]] },
    departures: { "checked-in": [["checked-out", "เช็กเอาต์ · Check out"]], confirmed: [["checked-out", "เช็กเอาต์ · Check out"]] },
  };

  async function call(method, path, body) {
    let data = {};
    try {
      const res = await fetch("/api" + path, {
        method,
        headers: Object.assign({ "x-admin-key": key }, body ? { "Content-Type": "application/json" } : {}),
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      data = await res.json();
      if (!res.ok && !data.error) data.error = "error";
    } catch (e) {
      data = { error: "offline", message: { th: "เชื่อมต่อระบบไม่ได้", en: "Couldn't reach the backend." } };
    }
    return data;
  }
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const addDays = (date, n) => new Date(Date.parse(date + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const short = (date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(date + "T00:00:00Z"));
  const money = (n) => `฿${Number(n).toLocaleString("en-US")}`;

  function card(r, list) {
    const li = el("li", `admin__card is-${r.status}`);
    const top = el("div", "admin__card-top");
    top.append(el("strong", "admin__time", `${r.roomName.th} · ${r.roomName.en}`), el("span", "admin__status", STATUS[r.status] || r.status), el("span", "admin__code", r.code));
    li.appendChild(top);
    li.appendChild(el("p", "admin__main", `${r.name} · ${r.guests} ท่าน/guests`));
    li.appendChild(el("p", "admin__stay", `${short(r.checkIn)} → ${short(r.checkOut)} · ${r.nights} คืน/nights · ${money(r.total)}`));
    const phone = el("a", "admin__phone", r.phone);
    phone.href = "tel:" + r.phone;
    li.appendChild(phone);
    if (r.note) li.appendChild(el("p", "admin__note", r.note));

    const actions = el("div", "admin__actions");
    ((NEXT[list] || {})[r.status] || []).forEach(([status, text], i) => {
      const b = el("button", i === 0 ? "btn btn--primary" : "btn btn--ghost", text);
      b.type = "button";
      b.addEventListener("click", () => setStatus(r.code, status));
      actions.appendChild(b);
    });
    // Any status, for corrections (e.g. cancelled by phone).
    const select = el("select", "field__input admin__select");
    select.setAttribute("aria-label", `สถานะ · Status ${r.code}`);
    ALL.forEach((s) => {
      const o = el("option", "", STATUS[s]);
      o.value = s;
      o.selected = s === r.status;
      select.appendChild(o);
    });
    select.addEventListener("change", () => setStatus(r.code, select.value));
    actions.appendChild(select);
    li.appendChild(actions);
    return li;
  }

  function fill(list, records, empty, name) {
    list.textContent = "";
    if (!records.length) list.appendChild(el("li", "admin__empty", empty));
    records.forEach((r) => list.appendChild(card(r, name)));
  }

  async function load(date) {
    const data = await call("GET", "/admin/day" + (date ? `?date=${encodeURIComponent(date)}` : ""));
    if (data.error) {
      if (data.error === "unauthorized" || data.error === "slow_down") signOut((data.message || {}).th + " · " + (data.message || {}).en);
      else ui.updated.textContent = (data.message || {}).th || "Error";
      return;
    }
    today = data.today;
    ui.login.hidden = true;
    ui.board.hidden = false;
    ui.signout.hidden = false;
    ui.shop.textContent = data.shop;
    ui.date.value = data.date;
    const s = data.summary;
    $('[data-sum="arrivals"]').textContent = s.arrivals;
    $('[data-sum="departures"]').textContent = s.departures;
    $('[data-sum="occupied"]').textContent = `${s.occupied} / ${s.totalRooms}`;
    $('[data-sum="revenue"]').textContent = money(s.revenue);
    ui.rooms.textContent = "";
    data.rooms.forEach((r) => {
      const li = el("li", `admin__room${r.taken >= r.count ? " is-full" : ""}`);
      li.append(el("span", "", `${r.th} · ${r.en}`), el("strong", "", `ว่าง/free ${r.count - r.taken} / ${r.count}`));
      ui.rooms.appendChild(li);
    });
    fill(ui.arrivals, data.arrivals, "ไม่มีแขกเข้าพัก · No arrivals", "arrivals");
    fill(ui.inHouse, data.inHouse, "ไม่มีแขกพักอยู่ · Nobody in house", "inHouse");
    fill(ui.departures, data.departures, "ไม่มีแขกเช็กเอาต์ · No departures", "departures");
    ui.updated.textContent = "อัปเดต · Updated " + new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  }
  async function setStatus(code, status) {
    const data = await call("POST", "/admin/status", { code, status });
    if (data.error) ui.updated.textContent = (data.message || {}).th || "Error";
    load(ui.date.value);
  }

  function signIn() {
    key = ui.key.value.trim();
    if (!key) return;
    try { sessionStorage.setItem(KEY, key); } catch (e) { /* fine */ }
    ui.loginError.textContent = "";
    start();
  }
  function signOut(message) {
    key = "";
    try { sessionStorage.removeItem(KEY); } catch (e) { /* fine */ }
    clearInterval(timer);
    ui.board.hidden = true;
    ui.signout.hidden = true;
    ui.login.hidden = false;
    ui.key.value = "";
    ui.loginError.textContent = message || "";
  }
  function start() {
    load(ui.date.value);
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden && key) load(ui.date.value); }, 30000);
  }

  ui.signin.addEventListener("click", signIn);
  ui.key.addEventListener("keydown", (e) => { if (e.key === "Enter") signIn(); });
  ui.signout.addEventListener("click", () => signOut(""));
  ui.date.addEventListener("change", () => load(ui.date.value));
  ui.prev.addEventListener("click", () => load(addDays(ui.date.value || today, -1)));
  ui.next.addEventListener("click", () => load(addDays(ui.date.value || today, 1)));
  ui.today.addEventListener("click", () => load(""));
  if (key) start();
})();
