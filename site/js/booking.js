/* =============================================================================
   booking.js — the browser side of the hotel's booking system.
   -----------------------------------------------------------------------------
   Talks to the backend at /api (see backend/core.mjs):
     • shows which rooms are free for the chosen dates, with the total price,
       and sends the booking,
     • lets a guest check or cancel a booking with code + phone,
     • gives the voice concierge (concierge.js) a helper through
       window.ShopApi: fill in the form from what the guest said.
   If the backend does not answer (for example on a host without functions),
   the form stays hidden and the "book on LINE" message stays: nothing breaks.
   ========================================================================== */
(function () {
  "use strict";

  const C = window.SHOP_CONFIG;
  const R = window.ShopRender;
  if (!C || !R) return;
  const html = document.documentElement;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const lang = () => (html.lang === "en" ? "en" : "th");
  const zone = (C.hours && C.hours.timeZone) || "Asia/Bangkok";
  const rooms = C.signature.items;
  const money = (n) => n.toLocaleString("en-US");

  /* ------------------------------------------------------------ the backend */
  async function call(method, path, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch("/api" + path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (!/json/.test(res.headers.get("content-type") || "")) throw new Error("no backend");
      const data = await res.json();
      return res.ok ? data : { error: data.error || "error", message: data.message };
    } catch (e) {
      return { error: "offline", message: { th: "เชื่อมต่อระบบไม่ได้ ลองใหม่อีกครั้งหรือทักไลน์โรงแรม", en: "Couldn't reach the booking system. Please try again, or message the hotel on LINE." } };
    } finally {
      clearTimeout(timer);
    }
  }
  // Asked once per page view: is there a backend?
  const health = call("GET", "/health").then((h) => ({ booking: !!h.booking, orders: false, online: !h.error }));

  /* ------------------------------------------------------------------ dates */
  const iso = (d) => d.toISOString().slice(0, 10);
  function hotelToday() {
    const p = {};
    new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
    return `${p.year}-${p.month}-${p.day}`;
  }
  const addDays = (date, n) => iso(new Date(Date.parse(date + "T00:00:00Z") + n * 86400000));
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
  function dateLabel(date, L) {
    return new Intl.DateTimeFormat(L === "th" ? "th-TH-u-ca-gregory" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
      .format(new Date(date + "T00:00:00Z"));
  }
  const nightsText = (n) => ({ th: `${n} คืน`, en: `${n} ${n === 1 ? "night" : "nights"}` });

  const STATUS = {
    confirmed: { th: "ยืนยันแล้ว", en: "Confirmed" }, "checked-in": { th: "เช็กอินแล้ว", en: "Checked in" },
    "checked-out": { th: "เช็กเอาต์แล้ว", en: "Checked out" }, "no-show": { th: "ไม่มาเข้าพัก", en: "No-show" }, cancelled: { th: "ยกเลิกแล้ว", en: "Cancelled" },
  };

  /* ------------------------------------------------------------- the form */
  const root = $("[data-book]");
  const ui = root && {
    offline: $("[data-book-offline]", root), form: $("[data-book-form]", root), done: $("[data-book-done]", root),
    checkIn: $("[data-book-checkin]", root), nights: $("[data-book-nights]", root), guests: $("[data-book-guests]", root),
    dates: $("[data-book-dates]", root), options: $$("[data-room-opt]", root),
    name: $("[data-book-name]", root), phone: $("[data-book-phone]", root), note: $("[data-book-note]", root),
    website: $("[data-book-website]", root), error: $("[data-book-error]", root), submit: $("[data-book-submit]", root),
    doneWhen: $("[data-book-done-when]", root), doneCode: $("[data-book-done-code]", root), again: $("[data-book-again]", root),
    manage: $("[data-manage]", root), mCode: $("[data-manage-code]", root), mPhone: $("[data-manage-phone]", root),
    mCheck: $("[data-manage-check]", root), mResult: $("[data-manage-result]", root), mCancel: $("[data-manage-cancel]", root),
  };
  const S = R.strings(C);
  let wantedRoom = "";  // a room asked for before availability arrived (a "Book this room" button, or the concierge)
  let loadId = 0;
  let lastAvailability = null;

  const chosenRoom = () => { const r = $("input[name=book-room]:checked", root); return r ? r.value : ""; };
  function chooseRoom(id) {
    const input = $(`input[name=book-room][value="${id}"]`, root);
    if (input && !input.disabled) { input.checked = true; return true; }
    return false;
  }

  function showDates() {
    const d = ui.checkIn.value;
    const n = parseInt(ui.nights.value, 10);
    if (!isDate(d)) { ui.dates.textContent = ""; return; }
    const out = addDays(d, n);
    ui.dates.innerHTML = R.t({
      th: `${dateLabel(d, "th")} → ${dateLabel(out, "th")} · ${nightsText(n).th}`,
      en: `${dateLabel(d, "en")} → ${dateLabel(out, "en")} · ${nightsText(n).en}`,
    });
  }

  // Ask the server which rooms are free for these dates and fill in each room's line.
  async function loadRooms() {
    const id = ++loadId;
    showDates();
    showError(null);
    if (!isDate(ui.checkIn.value)) return null;
    ui.options.forEach((o) => { $("[data-room-left]", o).innerHTML = R.t(S.bookLoading); $("[data-room-total]", o).textContent = ""; });
    const data = await call("GET", `/availability?checkIn=${encodeURIComponent(ui.checkIn.value)}&nights=${encodeURIComponent(ui.nights.value)}&guests=${encodeURIComponent(ui.guests.value)}`);
    if (id !== loadId) return null; // a newer request replaced this one
    lastAvailability = data.error ? null : data;
    if (data.error) {
      showError(data.message);
      ui.options.forEach((o) => { $("input", o).disabled = true; $("input", o).checked = false; $("[data-room-left]", o).textContent = "–"; o.classList.add("is-off"); });
      return null;
    }
    const keep = wantedRoom || chosenRoom();
    wantedRoom = "";
    ui.options.forEach((o) => {
      const r = data.rooms.find((x) => x.id === o.dataset.roomOpt);
      const input = $("input", o);
      input.disabled = !r.available;
      if (!r.available) input.checked = false;
      o.classList.toggle("is-off", !r.available);
      $("[data-room-left]", o).innerHTML = R.t(
        !r.fits ? { th: `พักได้ไม่เกิน ${r.sleeps} ท่าน`, en: `Sleeps up to ${r.sleeps} only` }
          : r.left === 0 ? { th: "เต็มแล้ว", en: "Fully booked" }
            : r.left <= 2 ? { th: `เหลือ ${r.left} ห้อง`, en: `${r.left} left` }
              : { th: "ว่าง", en: "Available" });
      $("[data-room-total]", o).innerHTML = `<strong>฿${money(r.total)}</strong> <span>${R.t({ th: `${data.nights} คืน`, en: nightsText(data.nights).en })}</span>`;
    });
    if (keep) chooseRoom(keep);
    return data;
  }

  function showError(message) {
    ui.error.innerHTML = message ? R.t(message) : "";
  }

  async function submit() {
    showError(null);
    const room = chosenRoom();
    if (!isDate(ui.checkIn.value)) { ui.checkIn.focus(); return showError({ th: "กรุณาเลือกวันเข้าพัก", en: "Please choose a check-in date." }); }
    if (!room) return showError({ th: "กรุณาเลือกห้อง", en: "Please choose a room." });
    if (!ui.name.value.trim()) { ui.name.focus(); return showError({ th: "กรุณาใส่ชื่อ", en: "Please enter a name." }); }
    if (ui.phone.value.replace(/\D/g, "").length < 9) { ui.phone.focus(); return showError({ th: "กรุณาใส่เบอร์โทรให้ถูกต้อง", en: "Please enter a valid phone number." }); }
    ui.submit.disabled = true;
    const data = await call("POST", "/bookings", {
      room, checkIn: ui.checkIn.value, nights: ui.nights.value, guests: ui.guests.value,
      name: ui.name.value, phone: ui.phone.value, note: ui.note.value, website: ui.website.value, lang: lang(),
    });
    ui.submit.disabled = false;
    if (data.error) {
      if (data.error === "sold_out") await loadRooms();
      return showError(data.message);
    }
    const b = data.booking;
    ui.doneWhen.innerHTML = R.t(summary(b));
    ui.doneCode.textContent = b.code;
    ui.form.hidden = true;
    ui.done.hidden = false;
    ui.done.focus({ preventScroll: true });
    ui.mCode.value = b.code;
    ui.mPhone.value = ui.phone.value;
    window.dispatchEvent(new CustomEvent("shop:booked", { detail: b }));
  }
  const summary = (b) => ({
    th: `${b.roomName.th} · ${dateLabel(b.checkIn, "th")} → ${dateLabel(b.checkOut, "th")} (${b.nights} คืน) · ${b.guests} ท่าน · รวม ${money(b.total)} บาท · ชื่อ ${b.name}`,
    en: `${b.roomName.en} · ${dateLabel(b.checkIn, "en")} → ${dateLabel(b.checkOut, "en")} (${nightsText(b.nights).en}) · ${b.guests} ${b.guests === 1 ? "guest" : "guests"} · ${money(b.total)} THB in total · ${b.name}`,
  });

  /* ---------------------------------------------------- check or cancel */
  async function manage(cancel) {
    ui.mCancel.hidden = true;
    ui.mResult.innerHTML = R.t(S.bookLoading);
    const data = cancel
      ? await call("POST", "/cancel", { code: ui.mCode.value, phone: ui.mPhone.value })
      : await call("GET", `/lookup?code=${encodeURIComponent(ui.mCode.value)}&phone=${encodeURIComponent(ui.mPhone.value)}`);
    if (data.error) { ui.mResult.innerHTML = R.t(data.message); return; }
    const f = data.found;
    const status = STATUS[f.status] || { th: f.status, en: f.status };
    const text = summary(f);
    ui.mResult.innerHTML = R.t({ th: `${text.th} · สถานะ: ${status.th}`, en: `${text.en} · Status: ${status.en}` });
    ui.mCancel.hidden = f.status !== "confirmed";
    if (cancel && !ui.form.hidden) loadRooms(); // the room is free again
  }

  /* ---------------------------------------------------------------- start */
  const ready = health.then((h) => {
    if (!root || !h.booking) return h;
    ui.offline.hidden = true;
    ui.form.hidden = false;
    ui.manage.hidden = false;
    const today = hotelToday();
    ui.checkIn.min = today;
    ui.checkIn.max = addDays(today, parseInt(root.dataset.days, 10) || 180);
    ui.checkIn.value = addDays(today, 1); // tomorrow: a sensible start
    loadRooms();
    [ui.checkIn, ui.nights, ui.guests].forEach((f) => f.addEventListener("change", loadRooms));
    ui.submit.addEventListener("click", submit);
    ui.again.addEventListener("click", () => { ui.done.hidden = true; ui.form.hidden = false; loadRooms(); });
    ui.mCheck.addEventListener("click", () => manage(false));
    ui.mCancel.addEventListener("click", () => manage(true));
    initQuick(today);
    return h;
  });

  // The small "check availability" bar under the hero: fills in the real form, then goes there.
  function initQuick(today) {
    const form = $("[data-quick]");
    if (!form) return;
    const date = $("[data-quick-checkin]", form);
    date.min = ui.checkIn.min;
    date.max = ui.checkIn.max;
    date.value = ui.checkIn.value;
    form.hidden = false;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const checkIn = isDate(date.value) && date.value >= today ? date.value : ui.checkIn.value;
      window.ShopApi.prefill({
        checkIn,
        nights: parseInt($("[data-quick-nights]", form).value, 10),
        guests: parseInt($("[data-quick-guests]", form).value, 10),
      });
      // Focus first (without scrolling), then scroll: focusing during a smooth scroll stops it.
      ui.checkIn.focus({ preventScroll: true });
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("booking").scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
    });
  }

  // "Book this room" on a room card: choose it in the form, then let the link scroll there.
  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-book-room]");
    if (!link || !root) return;
    if (!ui.done.hidden) { ui.done.hidden = true; ui.form.hidden = false; }
    if (!chooseRoom(link.dataset.bookRoom)) wantedRoom = link.dataset.bookRoom;
  });

  /* ---------------------------------------------- helper for the concierge */
  window.ShopApi = {
    ready,                       // resolves to { online, booking }
    dateLabel, hotelToday, addDays, isDate,
    // Put what the guest said into the booking form. Returns what the server says about it.
    async prefill({ room, checkIn, nights, guests }) {
      const h = await ready;
      if (!root || !h.booking) return { ok: false };
      if (!ui.done.hidden) { ui.done.hidden = true; ui.form.hidden = false; }
      if (checkIn && isDate(checkIn)) ui.checkIn.value = checkIn;
      if (nights) ui.nights.value = String(Math.max(1, Math.min(ui.nights.options.length, nights)));
      if (guests) ui.guests.value = String(Math.max(1, Math.min(ui.guests.options.length, guests)));
      if (room) wantedRoom = room;
      const data = await loadRooms();
      if (!data) return { ok: true, error: true, message: ui.error.textContent };
      const info = room ? data.rooms.find((r) => r.id === room) : null;
      return { ok: true, nights: data.nights, guests: data.guests, checkIn: data.checkIn, checkOut: data.checkOut, room: info, rooms: data.rooms, chosen: chosenRoom() };
    },
  };
})();
