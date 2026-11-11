/* =============================================================================
   concierge.js — the voice concierge: a guest taps a button and talks to the
   hotel in Thai or English. It answers out loud, and the PAGE reacts while it
   talks (shows a room, opens the map, switches language, fills in the
   booking form and says which rooms are free and what the stay costs).
   -----------------------------------------------------------------------------
   It is free and has no account and no API key:
     • hearing  = the browser's own speech recognition (Chrome, Edge, Safari),
     • speaking = the browser's own voices,
     • thinking = the small rule-based "brain" in section 5, which only knows
       what is in config.js (rooms, prices, extras, directions, your FAQ)
       plus live availability from the booking backend (booking.js).
   So it never invents a price, but it is not a chatbot: it understands
   questions about the hotel and booking a room, and says so when it doesn't.
   Browsers without speech recognition (e.g. Firefox) get the same assistant
   as a text chat. Nothing is booked automatically: the guest types a name
   and phone in the form and taps "Confirm booking".
   Contents
     1. Setup + strings            5. The brain (understand + answer)
     2. Rooms, extras + matching   6. Voice (listen + speak)
     3. Panel (the UI)             7. Wiring
     4. Page actions + dates
   ========================================================================== */
(function () {
  "use strict";

  const C = window.SHOP_CONFIG;
  const R = window.ShopRender;
  const H = window.ShopHours;
  const cfg = C && C.concierge;
  if (!C || !R || !H || !cfg || !cfg.enabled) return;

  const html = document.documentElement;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const lang = () => (html.lang === "en" ? "en" : "th");
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  const shop = R.both(C.business.name);
  const me = R.both(cfg.agentName || { th: "ผู้ช่วยของโรงแรม", en: "the hotel assistant" });

  /* ------------------------------------------------------------- 1. Strings */
  const T = {
    launch: { th: "คุยกับโรงแรม", en: "Talk to us" },
    title: { th: "ผู้ช่วยของโรงแรม", en: "Hotel concierge" },
    close: { th: "ปิด", en: "Close" },
    intro: {
      th: "ถามเรื่องห้องพัก ราคา ห้องว่าง หรือเส้นทาง หรือให้ช่วยจองห้องได้เลย พูดหรือพิมพ์ก็ได้",
      en: "Ask about rooms, prices, free dates or directions, or book a room. Speak or type.",
    },
    consent: {
      th: "ผู้ช่วยอัตโนมัติ ไม่ใช่พนักงาน เมื่อใช้เสียง เบราว์เซอร์ของคุณจะแปลงเสียงเป็นข้อความ (อาจส่งเสียงไปยังผู้ให้บริการเบราว์เซอร์ เช่น Google หรือ Apple) โรงแรมไม่ได้บันทึกเสียงไว้",
      en: "An automated assistant, not a person. With voice, your browser turns speech into text (it may send audio to the browser's provider, such as Google or Apple). The hotel keeps no recording.",
    },
    start: { th: "เริ่มพูด", en: "Start talking" },
    startText: { th: "พิมพ์แทน", en: "Type instead" },
    noVoice: { th: "เบราว์เซอร์นี้ไม่รองรับการพูด พิมพ์ถามได้เลย", en: "This browser can't listen, so please type." },
    micBlocked: { th: "ใช้ไมโครโฟนไม่ได้ พิมพ์ถามได้เลย", en: "The microphone isn't available, so please type." },
    listening: { th: "กำลังฟังอยู่ พูดได้เลย", en: "Listening, go ahead" },
    speaking: { th: "กำลังพูด", en: "Speaking" },
    idle: { th: "แตะไมค์เพื่อพูด หรือพิมพ์", en: "Tap the mic to talk, or type" },
    textMode: { th: "พิมพ์ถามได้เลย", en: "Type your question" },
    placeholder: { th: "พิมพ์ข้อความ…", en: "Type a message…" },
    send: { th: "ส่ง", en: "Send" },
    mic: { th: "พูด", en: "Talk" },
    micStop: { th: "หยุดฟัง", en: "Stop listening" },
    soundOn: { th: "เสียงตอบ: เปิด", en: "Voice replies: on" },
    soundOff: { th: "เสียงตอบ: ปิด", en: "Voice replies: off" },
    you: { th: "คุณ", en: "You" },
    chips: [
      { th: "ห้องไหนดี", en: "Which room suits me?" },
      { th: "คืนพรุ่งนี้มีห้องว่างไหม", en: "Any rooms free tomorrow?" },
      { th: "จองห้องสุดสัปดาห์นี้ 2 คน", en: "Book this weekend for 2" },
      { th: "เช็กอินกี่โมง", en: "What time is check-in?" },
      { th: "ไปโรงแรมยังไง", en: "How do I get there?" },
    ],
  };

  /* ------------------------------------------- 2. Rooms, extras + matching */
  // Keep letters, digits and Thai vowel/tone marks; drop spaces and punctuation.
  const norm = (s) => String(s || "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}\p{M}]+/gu, "");
  // Words too general to identify one room or extra on their own.
  const WEAK = new Set([
    "ห้อง", "วิว", "สระ", "แขก", "อาหาร", "สำหรับ", "นาที", "ชั่วโมง", "ครึ่ง", "วัน", "ชุด", "ต่อ", "ไทย", "ริม",
    "room", "rooms", "view", "pool", "the", "and", "with", "for", "min", "hours", "half", "day", "set", "visitors", "fresh",
    "thai", "soi", "afternoon", "morning", "evening",
  ].map(norm));
  const thaiWords = (() => {
    try {
      const seg = new Intl.Segmenter("th", { granularity: "word" });
      return (s) => Array.from(seg.segment(s)).filter((p) => p.isWordLike).map((p) => p.segment);
    } catch (e) {
      return (s) => [s]; // very old browser: only full names match
    }
  })();
  // Thai has no spaces, so Thai words match anywhere; English words must be whole words ("spa", not "space").
  const wordList = (n, aliases) =>
    Array.from(new Set(thaiWords(n.th).concat(n.en.split(/[^A-Za-z]+/), aliases || []).map(norm).filter((w) => w.length >= 3 && !WEAK.has(w))))
      .map((w) => ({ w, re: /^[a-z]+$/.test(w) ? new RegExp(`\\b${w}(s|es)?\\b`) : null }));

  // Room types, from config.js section 9: the same prices the page shows.
  const ROOM_ALIASES = { family: ["ครอบครัว"], deluxe: ["balcony", "ระเบียง"] };
  const rooms = ((C.signature && C.signature.items) || []).map((it) => {
    const n = R.both(it.name);
    return {
      id: it.id, th: n.th, en: n.en, price: it.price, sleeps: it.sleeps, count: it.count, size: it.size, badges: it.badges || [],
      desc: it.desc ? R.both(it.desc) : null, where: "room", full: [norm(n.th), norm(n.en)], words: wordList(n, (it.aliases || []).concat(ROOM_ALIASES[it.id] || [])),
    };
  });
  // Extras (dining, spa, experiences), from config.js section 10.
  const extras = [];
  C.menu.categories.forEach((cat) => cat.items.forEach((it) => {
    const n = R.both(it.name);
    extras.push({ th: n.th, en: n.en, price: it.price, category: cat.id, badges: it.badges || [], desc: it.desc ? R.both(it.desc) : null, where: "menu", full: [norm(n.th), norm(n.en)], words: wordList(n, it.aliases) });
  }));

  // Best match in a list for a piece of text, or null. A full name beats single words.
  function best(list, text) {
    const q = norm(text);
    const plain = String(text || "").toLowerCase();
    if (!q) return null;
    let found = null;
    let top = 0;
    list.forEach((item) => {
      let score = 0;
      if (item.full.some((f) => f && q.includes(f))) score = 100 + item.full[0].length;
      else item.words.forEach(({ w, re }) => { if (re ? re.test(plain) : q.includes(w)) score += w.length; });
      if (score && item.badges.includes("bestseller")) score += 0.5;
      if (score > top) { found = item; top = score; }
    });
    return top >= 3 ? found : null;
  }
  const findRoom = (text) => best(rooms, text);
  const findExtra = (text) => best(extras, text);

  /* ----------------------------------------------------------- 3. The panel */
  const el = (tag, cls, inner) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (inner !== undefined) node.innerHTML = inner;
    return node;
  };
  const icon = (name) => `<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
  const label = (node, text) => {
    // Same pattern as the rest of the site: both languages stored, main.js swaps them.
    node.setAttribute("data-aria-label-th", text.th);
    node.setAttribute("data-aria-label-en", text.en);
    node.setAttribute("aria-label", text[lang()]);
  };
  const MIC = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>`;

  const launch = el("button", "cg-launch", `<span class="cg-launch__dot" aria-hidden="true"></span>${MIC}<span>${R.t(T.launch)}</span>`);
  launch.type = "button";
  launch.setAttribute("aria-haspopup", "dialog");
  launch.setAttribute("aria-expanded", "false");

  const panel = el("section", "cg-panel");
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  label(panel, T.title);
  panel.innerHTML =
    `<div class="cg-head">` +
      `<div class="cg-orb" aria-hidden="true"><span></span></div>` +
      `<div class="cg-head__text"><p class="cg-title">${R.t(T.title)}</p><p class="cg-status" data-cg-status role="status"></p></div>` +
      `<button type="button" class="icon-btn cg-close" data-cg-close>${icon("close")}</button>` +
    `</div>` +
    `<div class="cg-intro" data-cg-intro>` +
      `<p class="cg-intro__lead">${R.t(T.intro)}</p>` +
      `<p class="cg-intro__consent">${R.t(T.consent)}</p>` +
      `<div class="cg-intro__actions">` +
        (SR ? `<button type="button" class="btn btn--primary cg-start" data-cg-start="voice">${MIC}<span>${R.t(T.start)}</span></button>` : "") +
        `<button type="button" class="${SR ? "cg-link" : "btn btn--primary cg-start"}" data-cg-start="text">${R.t(SR ? T.startText : T.textMode)}</button>` +
      `</div>` +
      (SR ? "" : `<p class="cg-intro__consent">${R.t(T.noVoice)}</p>`) +
    `</div>` +
    `<div class="cg-live" data-cg-live hidden>` +
      `<div class="cg-scroll" data-cg-scroll tabindex="0">` +
        `<ol class="cg-log" data-cg-log aria-live="polite"></ol>` +
      `</div>` +
      `<div class="cg-chips" data-cg-chips></div>` +
      `<div class="cg-input">` +
        (SR ? `<button type="button" class="cg-mic" data-cg-mic aria-pressed="false">${MIC}</button>` : "") +
        `<input type="text" class="cg-input__field" data-cg-field autocomplete="off" enterkeyhint="send" maxlength="200">` +
        `<button type="button" class="cg-input__send" data-cg-send>${icon("arrow-up")}</button>` +
      `</div>` +
      (synth ? `<div class="cg-foot"><button type="button" class="cg-link" data-cg-sound aria-pressed="true"></button></div>` : "") +
    `</div>`;

  const ui = {
    status: $("[data-cg-status]", panel), intro: $("[data-cg-intro]", panel), live: $("[data-cg-live]", panel),
    scroll: $("[data-cg-scroll]", panel), log: $("[data-cg-log]", panel),
    chips: $("[data-cg-chips]", panel), field: $("[data-cg-field]", panel), send: $("[data-cg-send]", panel),
    mic: $("[data-cg-mic]", panel), sound: $("[data-cg-sound]", panel), close: $("[data-cg-close]", panel),
  };
  label(ui.close, T.close);
  label(ui.send, T.send);
  label(ui.field, T.placeholder);
  if (ui.mic) label(ui.mic, T.mic);
  T.chips.forEach((chip) => {
    const b = el("button", "cg-chip", R.t(chip));
    b.type = "button";
    b.addEventListener("click", () => ask(chip[lang()]));
    ui.chips.appendChild(b);
  });
  document.body.append(launch, panel);

  function setStatus(text, state) {
    ui.status.innerHTML = text ? R.t(text) : "";
    panel.dataset.state = state || "";
    launch.dataset.state = state || "";
  }
  function addLine(who, text) {
    if (!text) return null;
    const li = el("li", `cg-line cg-line--${who}`);
    if (who === "note") li.innerHTML = R.t(text);
    else {
      const tag = el("span", "visually-hidden");
      tag.textContent = (who === "user" ? T.you[lang()] : T.title[lang()]) + ": ";
      li.append(tag, document.createTextNode(text)); // textContent: what people say is never treated as HTML
    }
    ui.log.appendChild(li);
    while (ui.log.children.length > 40) ui.log.firstElementChild.remove();
    ui.scroll.scrollTop = ui.scroll.scrollHeight;
    return li;
  }

  /* ---------------------------------------------- 4. Page actions + dates */
  // Scroll so the target sits just under the header (the panel covers the
  // bottom of a phone screen, so the top is the part the guest can see).
  function scrollToEl(node) {
    if (!node) return;
    const top = node.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? "auto" : "smooth" });
  }
  let spotTimer;
  function spotlight(node) {
    if (!node) return;
    $$(".is-spotlit").forEach((n) => n.classList.remove("is-spotlit"));
    node.classList.add("is-in", "is-spotlit"); // is-in: make sure a scroll-reveal item is visible
    clearTimeout(spotTimer);
    spotTimer = setTimeout(() => node.classList.remove("is-spotlit"), 6000);
  }
  const enName = (node) => (($("[lang=en]", node) || node).textContent || "").trim();

  const page = {
    section(sel) {
      const node = $(sel);
      scrollToEl(node);
      if (sel === "#hours") spotlight($(".hours__table tr.is-today"));
    },
    item(item) {
      let node = null;
      if (item.where === "menu") {
        const tab = document.getElementById(`tab-${item.category}`);
        if (tab && tab.getAttribute("aria-selected") !== "true") tab.click(); // reuse main.js tabs
        node = $$(".menu-item", document.getElementById(`panel-${item.category}`) || document).find((n) => enName($(".menu-item__name", n)) === item.en);
      } else {
        node = $$(".sig-card").find((n) => enName($(".sig-card__name", n)) === item.en);
      }
      // Wait one frame so a tab that was just switched has its final layout.
      if (node) requestAnimationFrame(() => { scrollToEl(node); spotlight(node); });
    },
    map() {
      const box = $("[data-map]");
      if (!box) return page.section("#find");
      const btn = $("[data-map-load]", box);
      const focused = document.activeElement;
      if (btn && !btn.hidden) btn.click(); // reuse main.js: loads the map preview
      // main.js moves focus into the map; give it back so typing and Escape keep working.
      if (focused && panel.contains(focused)) focused.focus({ preventScroll: true });
      scrollToEl(box);
    },
    lang(next) {
      const btn = $(`[data-set-lang="${next}"]`);
      if (btn && lang() !== next) btn.click(); // reuse main.js: saves the choice, updates the page
    },
  };

  // What the backend offers (filled in once booking.js has asked it).
  let backend = { online: false, booking: false };
  if (window.ShopApi) window.ShopApi.ready.then((h) => { backend = h; });

  const pad = (n) => String(n).padStart(2, "0");
  const money = (n) => Number(n).toLocaleString("en-US");
  const baht = (n, L) => `${money(n)} ${L === "th" ? "บาท" : "baht"}`;
  const DAY_MS = 86400000;
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const addDays = (date, n) => iso(Date.parse(date + "T00:00:00Z") + n * DAY_MS);
  const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY_MS);
  const weekday = (date) => new Date(date + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  function hotelToday() {
    if (window.ShopApi) return window.ShopApi.hotelToday();
    const p = {};
    new Intl.DateTimeFormat("en-CA", { timeZone: C.hours.timeZone || "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
    return `${p.year}-${p.month}-${p.day}`;
  }
  const dateSay = (date, L) =>
    new Intl.DateTimeFormat(L === "th" ? "th-TH-u-ca-gregory" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(date + "T00:00:00Z"));

  /* ------------------------------------------------------------ 5. The brain
     reply(text) reads one thing the guest said, does something on the page,
     and returns the sentence to say back. It is plain keyword matching, in
     this order: language → check/cancel a booking → booking a stay (dates,
     nights, guests, room; the answer about free rooms comes a moment later
     from the backend) → one room → which room → the hotel's own FAQ
     (config.js) → extras → directions, front desk hours and the rest →
     "I'm not sure".                                                          */
  const has = (text, re) => re.test(text);
  const NUM = {
    หนึ่ง: 1, นึง: 1, สอง: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9, สิบ: 10,
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };
  const NUM_WORD = `\\d{1,2}|${Object.keys(NUM).join("|")}`;
  const num = (token) => {
    const t = String(token || "").toLowerCase().trim();
    return /^\d+$/.test(t) ? parseInt(t, 10) : NUM[t] || null;
  };

  const MONTHS_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const MONTH_EN_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const MONTHS_TH = ["มกรา", "กุมภา", "มีนา", "เมษา", "พฤษภา", "มิถุนา", "กรกฎา", "สิงหา", "กันยา", "ตุลา", "พฤศจิกา", "ธันวา"];
  const MONTHS_TH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const MONTH_TH_RE = `(${MONTHS_TH.join("|")}|${MONTHS_TH_SHORT.map((m) => m.replace(/\./g, "\\.")).join("|")})`;
  const monthIndex = (word) => {
    const w = word.toLowerCase();
    const en = MONTHS_EN.findIndex((m) => w.startsWith(m));
    if (en >= 0) return en;
    const th = MONTHS_TH.findIndex((m) => w.startsWith(m));
    return th >= 0 ? th : MONTHS_TH_SHORT.indexOf(word);
  };
  const DAYS_EN = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const DAYS_TH = ["วันอาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];

  // The next date (from `from`, or the day after it when `strict`) that is weekday `d`.
  function nextWeekday(from, d, strict) {
    for (let i = strict ? 1 : 0; i < 8; i++) { const x = addDays(from, i); if (weekday(x) === d) return x; }
    return from;
  }
  // The next date on or after `from` that falls on day-of-month `n`.
  function nextDayOfMonth(from, n) {
    for (let i = 0; i < 62; i++) { const x = addDays(from, i); if (+x.slice(8) === n) return x; }
    return "";
  }
  function monthDay(today, m, d) {
    if (m < 0 || !(d >= 1 && d <= 31)) return "";
    let year = +today.slice(0, 4);
    let date = `${year}-${pad(m + 1)}-${pad(d)}`;
    if (date < today) date = `${year + 1}-${pad(m + 1)}-${pad(d)}`;
    return iso(Date.parse(date + "T00:00:00Z")).slice(5) === date.slice(5) ? date : ""; // 31 Feb → nothing
  }

  // Every date mentioned, in the order said: "from Friday to Sunday" → [fri, sun].
  // Each pattern blanks out what it used, so "day after tomorrow" is not also "tomorrow".
  function findDates(text, today) {
    let s = text.toLowerCase().replace(/ถึง\s*อาทิตย์/g, "ถึงวันอาทิตย์"); // "ศุกร์ถึงอาทิตย์": Friday to Sunday
    const hits = [];
    const scan = (re, toDate) => {
      s = s.replace(re, (...args) => {
        const m = args.slice(0, -2);
        const at = args[args.length - 2];
        const date = toDate(m, at);
        if (date) hits.push({ at, date });
        return date ? " ".repeat(m[0].length) : m[0];
      });
    };
    const after = (at) => { const prev = hits.filter((h) => h.at < at).sort((a, b) => b.at - a.at)[0]; return prev ? prev.date : null; };
    scan(/มะรืน(นี้)?|day after tomorrow/g, () => addDays(today, 2));
    scan(/พรุ่งนี้|tomorrow/g, () => addDays(today, 1));
    scan(/วันนี้|คืนนี้|today|tonight|this evening/g, () => today);
    scan(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => monthDay(today, +m[2] - 1, +m[3]) || "");
    scan(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?${MONTH_EN_RE}\\b`, "g"), (m) => monthDay(today, monthIndex(m[2]), +m[1]));
    scan(new RegExp(`\\b${MONTH_EN_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "g"), (m) => monthDay(today, monthIndex(m[1]), +m[2]));
    scan(new RegExp(`(?:วันที่\\s*)?(\\d{1,2})\\s*${MONTH_TH_RE}`, "g"), (m) => monthDay(today, monthIndex(m[2]), +m[1]));
    // Weekdays. In Thai, อาทิตย์ alone also means "week", so Sunday needs วัน in front.
    const wk = (re, dayOf) => scan(re, (m, at) => {
      const prev = after(at);
      return nextWeekday(prev || today, dayOf(m), !!prev || /next|หน้า/.test(m[0]));
    });
    wk(/(?:next |this |on |coming )?\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thur?s?|fri|sat)\b/g, (m) => DAYS_EN.indexOf(m[1].slice(0, 3)));
    wk(/(?:วัน)?(จันทร์|อังคาร|พุธ|พฤหัส(?:บดี)?|ศุกร์|เสาร์)(?:\s*(?:นี้|หน้า))?|วันอาทิตย์(?:\s*(?:นี้|หน้า))?/g, (m) => DAYS_TH.findIndex((d) => m[0].includes(d)));
    scan(/วันที่\s*(\d{1,2})|(?:on|from|until|till|to) the (\d{1,2})(?:st|nd|rd|th)?\b|\b(\d{1,2})(?:st|nd|rd|th)\b/g, (m, at) => {
      const prev = after(at);
      return nextDayOfMonth(prev ? addDays(prev, 1) : today, +(m[1] || m[2] || m[3]));
    });
    return hits.sort((a, b) => a.at - b.at).map((h) => h.date);
  }

  // Everything about a stay in one sentence: dates, nights, guests, room.
  function parseStay(text) {
    const q = String(text || "").toLowerCase();
    const today = hotelToday();
    const out = { checkIn: "", nights: null, guests: null, room: findRoom(q) };
    const weekend = /(next |this |coming )?weekend|เสาร์อาทิตย์(นี้|หน้า)?|สุดสัปดาห์(นี้|หน้า)?/.exec(q);
    const dates = findDates(weekend ? q.replace(weekend[0], " ") : q, today);
    if (weekend && !dates.length) {
      const next = /next|หน้า/.test(weekend[0]);
      const nowDay = weekday(today);
      if (next && [5, 6, 0].includes(nowDay)) out.checkIn = nextWeekday(today, 5, true); // said during a weekend: the one after
      else if (!next && nowDay === 6) out.checkIn = today;                                  // on a Saturday, "this weekend" is tonight
      else out.checkIn = nextWeekday(today, 5, false);
      out.nights = weekday(out.checkIn) === 6 ? 1 : 2;
    }
    if (dates[0]) out.checkIn = dates[0];
    let m;
    if ((m = new RegExp(`(?<![a-z])(${NUM_WORD}|a)\\s*(คืน|nights?)`, "i").exec(q))) out.nights = m[1] === "a" ? 1 : num(m[1]);
    else if (/คืนเดียว|คืนนึง|overnight|just tonight/.test(q)) out.nights = 1;
    else if ((m = new RegExp(`(?<![a-z])(${NUM_WORD}|a)\\s*(อาทิตย์|สัปดาห์|weeks?)`, "i").exec(q))) out.nights = 7 * (m[1] === "a" ? 1 : num(m[1]));
    else if (/fortnight/.test(q)) out.nights = 14;
    if (!out.nights && dates[1] && dates[1] > dates[0]) out.nights = daysBetween(dates[0], dates[1]);
    // Guests: "2 คน", "3 adults and 1 child", "for two", "just me", "with my wife".
    const thaiFirst = Array.from(q.matchAll(new RegExp(`(?:ผู้ใหญ่|เด็ก)\\s*(${NUM_WORD})`, "g"))).map((p) => p[1]); // "ผู้ใหญ่ 2 เด็ก 1"
    const parts = thaiFirst.length ? thaiFirst
      : Array.from(q.matchAll(new RegExp(`(?<![a-z])(${NUM_WORD})\\s*(คน|ท่าน|people|persons|guests?|adults?|kids?|children|child|ผู้ใหญ่|เด็ก|pax|of us)`, "gi"))).map((p) => p[1]);
    if (parts.length) out.guests = parts.reduce((n, p) => n + (num(p) || 0), 0) || null;
    else if ((m = new RegExp(`\\bfor (${NUM_WORD})\\b(?!\\s*(nights?|weeks?|days?|คืน))`, "i").exec(q))) out.guests = num(m[1]);
    else if (/คนเดียว|just me|by myself|\bsolo\b|\balone\b/.test(q)) out.guests = 1;
    else if (/สองคน|\bcouple\b|ฮันนีมูน|honeymoon|with my (wife|husband|partner|girlfriend|boyfriend|friend)|กับแฟน/.test(q)) out.guests = 2;
    return out;
  }
  const hasStay = (p) => !!(p.checkIn || p.nights);

  const ctx = { offer: null, stay: null, booking: false }; // what the conversation is about
  let followUp = Promise.resolve();
  const roomLine = (r, L) => (L === "th" ? `${r.th} คืนละ ${baht(r.price, L)}` : `the ${r.en} at ${baht(r.price, L)} a night`);
  const roomsList = (list, L) => list.map((r) => roomLine(r, L)).join(L === "th" ? " " : ", ");
  const describeRoom = (r, L) =>
    L === "th"
      ? `${r.th} ขนาด ${r.size} ตารางเมตร พักได้ ${r.sleeps} ท่าน คืนละ ${baht(r.price, L)} รวมอาหารเช้าค่ะ ${r.desc ? r.desc.th : ""} อยากให้เช็กห้องว่างไหมคะ`.replace(/\s+/g, " ")
      : `The ${r.en} is ${r.size} square metres, sleeps ${r.sleeps}, and costs ${baht(r.price, L)} a night with breakfast. ${r.desc ? r.desc.en.replace(/\.?$/, ".") : ""} Shall I check which dates are free?`.replace(/\s+/g, " ");

  // Which room suits what was said: group size first, then what they care about.
  function suggestRoom(q, guests) {
    const by = (id) => rooms.find((r) => r.id === id);
    const fits = rooms.filter((r) => !guests || r.sleeps >= guests);
    if (!fits.length) return null;
    const pick = (id) => (by(id) && fits.includes(by(id)) ? by(id) : null);
    if (has(q, /ถูก|ประหยัด|cheap|budget|least expensive|lowest/i)) return fits.slice().sort((a, b) => a.price - b.price)[0];
    if (has(q, /ครอบครัว|ลูก|เด็ก|family|kids|children/i)) return pick("family") || fits.slice().sort((a, b) => b.sleeps - a.sleeps)[0];
    if (has(q, /วิว|ระเบียง|อ่าง|โรแมนติก|ฮันนีมูน|view|balcony|bath|romantic|honeymoon|special|luxur|best/i)) return pick("deluxe") || fits[0];
    if (has(q, /พักยาว|ทำงาน|โต๊ะ|long stay|longer|work|desk|remote/i)) return pick("studio") || fits[0];
    if (guests && guests >= 3) return fits.slice().sort((a, b) => a.sleeps - b.sleeps || a.price - b.price)[0];
    return fits.find((r) => r.badges.includes("bestseller")) || fits[0];
  }

  function reply(raw, L) {
    const text = String(raw || "").trim();
    const q = text.toLowerCase();
    const say = (th, en) => (L === "th" ? th : en);

    /* Language */
    if (has(q, /ภาษาอังกฤษ|speak english|in english|english please/i)) { page.lang("en"); return "Sure, English it is. How can I help?"; }
    if (has(q, /ภาษาไทย|พูดไทย|speak thai|in thai/i)) { page.lang("th"); return "ได้ค่ะ คุยภาษาไทยกันนะคะ มีอะไรให้ช่วยคะ"; }

    /* Check or cancel a booking: the form on the page needs the code + phone */
    if (has(q, /(ยกเลิก|เช็[คก]|ตรวจ(สอบ)?|เลื่อน|เปลี่ยน)(การ|วัน)?จอง|เปลี่ยนวัน|เลื่อนวัน|(cancel|check|change|move|find) (my |the |a |our )?(booking|reservation|stay)/i)) {
      page.section("#booking");
      const box = $("[data-manage]");
      if (box && !box.hidden) box.open = true;
      return say("ตรวจสอบหรือยกเลิกได้ที่หน้าจองเลยค่ะ ใส่รหัสการจองกับเบอร์โทรที่ใช้จอง ยกเลิกฟรีได้ถึงหนึ่งวันก่อนเข้าพัก ถ้าอยากเปลี่ยนวัน ทักไลน์โรงแรมได้เลยนะคะ",
        "You can check or cancel it in the booking section with your booking code and the phone number you used. Cancellation is free until the day before arrival. To change dates, message the hotel on LINE.");
    }

    const stay = parseStay(q);
    const room = stay.room;
    const yes = has(q, /^(ได้|โอเค|ตกลง|ใช่|เอา|จัดไป|ค่ะ|ครับ|ok|okay|yes|yeah|yep|sure|please|go ahead|book it|let'?s do it)/i);
    const bookWords = has(q, /จอง|อยากพัก|จะพัก|ขอพัก|ไปพัก|มาพัก|ห้องว่าง|ว่างไหม|ว่างมั้ย|ว่างอยู่|ยังว่าง|มีห้องไหม|เหลือห้อง|\bbook|reserv|\bstay\b|availab|vacanc|any rooms?|rooms? (free|left)|\bfree (on|tonight|tomorrow|this|next|that)|\bcheck (in|ing in) (on|this|next|tomorrow)/i);
    const priceWords = has(q, /เท่าไหร่|เท่าไร|ราคา|กี่บาท|how much|price|cost|total/i);

    // The hotel's own questions and answers, from config.js. Thai keys match
    // anywhere; English keys as words ("cat" is not in "location"; "allerg" is in "allergy").
    const qn = norm(q);
    const keyHit = (k) => {
      if (!/^[a-z][a-z -]*$/i.test(k)) return qn.includes(norm(k));
      const word = k.toLowerCase().replace(/[-\s]+/g, "[-\\s]?");
      return new RegExp(`\\b${word}${k.length < 5 ? "(s|es)?\\b" : ""}`).test(q);
    };
    const faq = (cfg.faq || []).find((f) => (f.keys || []).some(keyHit));
    const offered = yes && ctx.offer && ctx.offer.where === "room" ? ctx.offer : null;

    /* "Yes" right after describing a room: check dates for it */
    if (offered && !hasStay(stay)) return bookRoom(stay, L, offered);

    /* Booking a stay. Dates alone ("breakfast tomorrow?") are not a booking,
       unless a booking is already under way or a room or price is mentioned. */
    if (bookWords || (!faq && hasStay(stay) && (room || priceWords || ctx.booking || yes)) || (ctx.booking && !faq && (room || stay.guests) && !priceWords)) {
      return bookRoom(stay, L, room || offered);
    }

    /* One room */
    if (room) {
      ctx.offer = room;
      page.item(room);
      return describeRoom(room, L);
    }

    /* Which room? */
    const extraCat = has(q, /นวด|สปา|massage|\bspa\b/i) ? "spa" : has(q, /กิจกรรม|เที่ยว|ทัวร์|ทำอะไรดี|things to do|activit|\btours?\b|excursion|what to do/i) ? "trips"
      : has(q, /ร้านอาหาร|หิว|กินอะไร|เครื่องดื่ม|ค็อกเทล|restaurant|hungry|\beat\b|drinks?\b|cocktail|\bbar\b|dinner|lunch/i) ? "dining" : "";
    if (!extraCat && has(q, /ห้องไหน|ห้องแบบไหน|แนะนำ|ห้องอะไรดี|which room|what room|recommend|suggest|best room|room for|suit/i)) {
      const pick = suggestRoom(q, stay.guests);
      if (!pick) return tooMany(L);
      ctx.offer = pick;
      page.item(pick);
      const why = stay.guests ? say(`สำหรับ ${stay.guests} ท่าน `, `For ${stay.guests} ${stay.guests === 1 ? "guest" : "guests"}, `) : "";
      return say(
        `${why}แนะนำ${pick.th}ค่ะ คืนละ ${baht(pick.price, L)} พักได้ ${pick.sleeps} ท่าน ${pick.desc ? pick.desc.th : ""} อยากให้เช็กวันว่างไหมคะ`.replace(/\s+/g, " "),
        `${why ? `${why}I'd suggest` : "I'd suggest"} the ${pick.en}: ${baht(pick.price, L)} a night, sleeps ${pick.sleeps}. ${pick.desc ? pick.desc.en.replace(/\.?$/, ".") : ""} Shall I check which dates are free?`.replace(/\s+/g, " "));
    }

    /* The hotel's own questions and answers */
    if (faq) return R.both(faq.answer)[L];

    /* One extra (a dish, a massage, a tour) */
    const extra = findExtra(q);
    if (extra) {
      ctx.offer = extra;
      page.item(extra);
      const desc = extra.desc ? extra.desc[L] : "";
      return say(
        `${extra.th} ${baht(extra.price, L)}ค่ะ ${desc} จองได้ที่เคาน์เตอร์หรือทางไลน์ ${C.contact.line.id} ค่ะ`.replace(/\s+/g, " "),
        `The ${extra.en} is ${baht(extra.price, L)}. ${desc ? desc.replace(/\.?$/, ".") : ""} You can book it at the front desk or on LINE at ${C.contact.line.id}.`.replace(/\s+/g, " "));
    }
    if (extraCat) {
      const cat = C.menu.categories.find((c) => c.id === extraCat);
      const list = extras.filter((x) => x.category === extraCat);
      const stars = list.filter((x) => x.badges.includes("bestseller"));
      const pick = stars[0] || list[0];
      if (!pick) return say("ยังไม่มีบริการแบบนั้นค่ะ", "We don't offer that at the moment.");
      ctx.offer = pick;
      page.item(pick);
      const others = list.filter((x) => x !== pick).slice(0, 2);
      return say(
        `${R.both(cat.name).th}ที่โรงแรม แนะนำ${pick.th} ${baht(pick.price, L)}ค่ะ${others.length ? ` มี${others.map((o) => o.th).join(" ")}ด้วย` : ""} จองได้ที่เคาน์เตอร์หรือทางไลน์ค่ะ`,
        `For ${R.both(cat.name).en.toLowerCase()}, try the ${pick.en}, ${baht(pick.price, L)}.${others.length ? ` There's also the ${others.map((o) => o.en).join(" and the ")}.` : ""} Book at the front desk or on LINE.`);
    }

    /* All the rooms and prices */
    if (has(q, /ห้อง|ราคา|เท่าไหร่|เท่าไร|กี่บาท|คืนละ|\brooms?\b|\brates?\b|how much|price|cost|per night/i)) {
      page.section("#signature");
      return say(
        `มี ${rooms.length} แบบค่ะ ${roomsList(rooms, L)} ทุกห้องรวมอาหารเช้าและภาษีแล้ว อยากให้เช็กห้องว่างวันไหนคะ`,
        `We have ${rooms.length} kinds of room: ${roomsList(rooms, L)}. Every rate includes breakfast and tax. Which dates shall I check?`);
    }

    /* Parking and directions */
    if (has(q, /จอด|parking|\bpark\b/i) && C.location.parking) { page.section("#find"); return say(`${R.both(C.location.parking).th}ค่ะ`, `${R.both(C.location.parking).en}.`); }
    if (has(q, /อยู่ไหน|อยู่ที่ไหน|อยู่ตรงไหน|ที่อยู่|ไปยังไง|ไปโรงแรม|เส้นทาง|แผนที่|เดินทาง|\b(where|address|directions?|map|location|located|get there|find you|how (do|can) i get)\b/i)) {
      page.map();
      const transit = C.location.transit ? R.both(C.location.transit) : null;
      return say(
        `โรงแรมอยู่${R.both(C.location.address).th.split(" ").slice(0, 2).join(" ")}ค่ะ${transit ? ` ${transit.th.replace(/\s*·\s*/g, " ")}` : ""} เปิดแผนที่กับวิธีเดินทางให้บนหน้าจอแล้วค่ะ`,
        `We're in ${R.both(C.location.address).en.split(",")[0].replace(/^A /, "a ")}.${transit ? ` ${transit.en.replace(/\s*·\s*/g, ". ")}.` : ""} I've opened the map and directions on your screen.`);
    }

    /* Front desk hours */
    if (has(q, /เปิด|ปิด|กี่โมง|เวลา|เคาน์เตอร์|ต้อนรับ|ดึก|\b(open|opening|close[sd]?|closing|hours|what time|reception|front desk|late|arrive)\b/i)) {
      page.section("#hours");
      const today = C.hours.weekly[H.getStatus(C.hours).todayKey] || [];
      const range = today.map(([a, b]) => `${a} ${L === "th" ? "ถึง" : "to"} ${b}`).join(", ");
      return say(
        `เคาน์เตอร์ต้อนรับเปิด ${range || "ตามเวลาบนหน้าจอ"} ค่ะ เช็กอินได้ตั้งแต่ ${C.booking.checkIn} น. ถ้าจะมาถึงดึกกว่านั้น แจ้งทางไลน์ไว้ได้เลยนะคะ`,
        `The front desk is open ${range || "at the times on your screen"}. Check-in is from ${C.booking.checkIn}. If you'll arrive later than that, just tell us on LINE.`);
    }

    /* Contact, the hotel, photos, reviews */
    if (has(q, /ไลน์|line|โทร|เบอร์|ติดต่อ|อีเมล|\b(phone|call|contact|number|email)\b/i)) {
      page.section("#contact");
      return say(`ทักไลน์ ${C.contact.line.id} หรือโทร ${C.contact.phoneDisplay} ได้เลยค่ะ ช่องทางติดต่ออยู่บนหน้าจอแล้วค่ะ`, `Message us on LINE at ${C.contact.line.id} or call ${C.contact.phoneDisplay}. The contact details are on your screen.`);
    }
    if (has(q, /เรื่องราว|ประวัติ|เจ้าของ|\b(story|history|about|owner|who (runs|owns))\b/i) && C.story) {
      page.section("#story");
      return R.both(C.story.body[0])[L];
    }
    if (has(q, /รูป|ภาพ|บรรยากาศ|\b(photos?|pictures?|gallery|look like|atmosphere|vibe)\b/i)) { page.section("#gallery"); return say("นี่คือบรรยากาศรอบโรงแรมค่ะ แตะที่รูปเพื่อดูใหญ่ได้เลย", "Here's what it looks like around the hotel. Tap a photo to see it larger."); }
    if (has(q, /รีวิว|\breviews?\b/i)) { page.section("#reviews"); return say("นี่คือสิ่งที่แขกพูดถึงเราค่ะ", "Here's what guests say about us."); }

    /* Small talk */
    if (has(q, /คุณคือใคร|เป็นใคร|เป็น ?ai|เป็นคนไหม|who are you|are you (a |an )?(human|person|robot|ai|bot)/i)) {
      return say(`${me.th}เป็นผู้ช่วยอัตโนมัติของ${shop.th}ค่ะ ตอบได้เรื่องห้องพัก ราคา ห้องว่าง เส้นทาง และช่วยกรอกแบบฟอร์มจองค่ะ`, `I'm ${me.en}, an automated assistant for ${shop.en}. I can help with rooms, prices, free dates and directions, and fill in the booking form for you.`);
    }
    if (has(q, /ขอบคุณ|ขอบใจ|thank/i)) return say("ยินดีค่ะ มีอะไรให้ช่วยอีกไหมคะ", "You're welcome. Anything else?");
    if (has(q, /บาย|ลาก่อน|\b(bye|goodbye|see you)\b/i)) return say("ขอบคุณค่ะ แล้วพบกันที่โรงแรมนะคะ", "Thank you. See you at the hotel.");
    if (has(q, /สวัสดี|หวัดดี|ดีค่ะ|ดีครับ|\b(hi|hello|hey|good (morning|afternoon|evening))\b/i)) return greeting(L);
    if (yes && ctx.offer && ctx.offer.where === "menu") return say(`จอง${ctx.offer.th}ได้ที่เคาน์เตอร์หรือทางไลน์ ${C.contact.line.id} ค่ะ`, `You can book the ${ctx.offer.en} at the front desk or on LINE at ${C.contact.line.id}.`);

    /* Not understood: say so, and say what it can do */
    return say(
      "ขอโทษค่ะ เรื่องนี้ยังตอบไม่ได้ ถามเรื่องห้องพัก ราคา ห้องว่าง หรือเส้นทางได้ค่ะ ถ้าเป็นเรื่องอื่น ทักไลน์โรงแรมได้เลยนะคะ",
      "Sorry, I can't help with that one. I can tell you about rooms, prices, free dates and directions, or help you book. For anything else, please message the hotel on LINE.");
  }

  const maxSleeps = () => Math.max(...rooms.map((r) => r.sleeps));
  const tooMany = (L) => {
    page.section("#contact");
    return L === "th"
      ? `ห้องหนึ่งพักได้ไม่เกิน ${maxSleeps()} ท่านค่ะ ถ้ามากันหลายคนและอยากจองหลายห้อง ทักไลน์ ${C.contact.line.id} ได้เลยนะคะ`
      : `One room sleeps up to ${maxSleeps()}. For a bigger group needing several rooms, please message us on LINE at ${C.contact.line.id}.`;
  };

  // "จองห้องดีลักซ์ ศุกร์นี้ 2 คืน 2 คน" → fill in the booking form, then (when the
  // backend answers) say which rooms are free and what the stay costs.
  function bookRoom(p, L, roomHint) {
    const say = (th, en) => (L === "th" ? th : en);
    const api = window.ShopApi;
    const b = C.booking || {};
    if (!api || !backend.booking || !b.enabled) {
      page.section("#contact");
      return say(`จองห้องได้ทางไลน์ ${C.contact.line.id} หรือโทร ${C.contact.phoneDisplay} ค่ะ`, `You can book a room on LINE at ${C.contact.line.id} or by phone on ${C.contact.phoneDisplay}.`);
    }
    const prev = ctx.stay || {};
    const stay = {
      checkIn: p.checkIn || prev.checkIn || "",
      nights: p.nights || prev.nights || null,
      guests: p.guests || prev.guests || null,
      room: p.room || roomHint || prev.room || null,
    };
    if (stay.guests && stay.guests > maxSleeps()) { ctx.stay = Object.assign(stay, { guests: null }); return tooMany(L); }
    const maxNights = b.maxNights || 14;
    if (stay.nights && stay.nights > maxNights) {
      ctx.stay = Object.assign(stay, { nights: null });
      return say(`จองออนไลน์ได้ไม่เกิน ${maxNights} คืนค่ะ ถ้าพักนานกว่านั้น ทักไลน์ ${C.contact.line.id} ได้เลย มีราคาพักยาวให้ค่ะ`, `Online booking is for up to ${maxNights} nights. For a longer stay, message us on LINE at ${C.contact.line.id}.`);
    }
    if (stay.room && stay.guests && stay.room.sleeps < stay.guests) {
      const alt = suggestRoom("", stay.guests);
      stay.room = null;
      ctx.stay = stay;
      ctx.booking = true;
      page.section("#booking");
      api.prefill({ checkIn: stay.checkIn, nights: stay.nights, guests: stay.guests });
      const asked = p.room || roomHint || prev.room;
      return say(`${asked.th}พักได้ ${asked.sleeps} ท่านค่ะ สำหรับ ${stay.guests} ท่าน แนะนำ${alt.th} คืนละ ${baht(alt.price, L)}ค่ะ เอาห้องนี้ไหมคะ`,
        `The ${asked.en} sleeps ${asked.sleeps}. For ${stay.guests}, I'd suggest the ${alt.en} at ${baht(alt.price, L)} a night. Would you like that one?`);
    }
    ctx.stay = stay;
    ctx.booking = true;
    ctx.offer = stay.room;
    page.section("#booking");
    const run = api.prefill({ room: stay.room && stay.room.id, checkIn: stay.checkIn, nights: stay.nights, guests: stay.guests });

    if (!stay.checkIn) {
      // No date yet: ask for one. The form keeps what we know.
      return say(
        `ได้เลยค่ะ${stay.room ? ` ${stay.room.th}` : ""} จะเข้าพักวันไหน กี่คืนคะ เช่น ศุกร์นี้ 2 คืน`,
        `Happy to help${stay.room ? ` with the ${stay.room.en}` : ""}. Which day would you like to arrive, and for how many nights? For example, "this Friday for 2 nights".`);
    }
    const nights = stay.nights || parseInt(($("[data-book-nights]") || {}).value, 10) || 1;
    const out = addDays(stay.checkIn, nights);
    followUp = run.then((r) => speechDone.then(() => { // after "let me check" has been said
      const note = availabilityNote(r, stay, L);
      if (!note) return;
      addLine("agent", note);
      speak(note, L, () => { if (voiceMode && !panel.hidden) listen(); });
    }));
    pauseListening = true; // the answer comes with the follow-up: listen after that
    return say(
      `ขอเช็กห้องว่าง ${dateSay(stay.checkIn, L)} ถึง ${dateSay(out, L)} ${nights} คืน${stay.guests ? ` ${stay.guests} ท่าน` : ""}ให้นะคะ`,
      `Let me check ${dateSay(stay.checkIn, L)} to ${dateSay(out, L)}, ${nights} ${nights === 1 ? "night" : "nights"}${stay.guests ? ` for ${stay.guests}` : ""}.`);
  }

  // What to say once the backend has answered: the chosen room's price, or what's free instead.
  function availabilityNote(r, stay, L) {
    const say = (th, en) => (L === "th" ? th : en);
    if (!r || !r.ok) return "";
    if (r.error) return r.message || say("เช็กห้องว่างไม่ได้ค่ะ ลองเลือกวันในหน้าจองอีกครั้งนะคะ", "I couldn't check those dates. Please try choosing them in the form.");
    const byId = (id) => rooms.find((x) => x.id === id);
    const free = r.rooms.filter((x) => x.available).map((x) => Object.assign({}, byId(x.id), { total: x.total, left: x.left }));
    const nightsSay = say(`${r.nights} คืน`, `${r.nights} ${r.nights === 1 ? "night" : "nights"}`);
    const finish = say("ใส่ชื่อกับเบอร์โทรในแบบฟอร์ม แล้วกดยืนยันการจองได้เลยค่ะ จ่ายเงินที่โรงแรมตอนเช็กอิน", "Add your name and phone in the form and tap Confirm booking. You pay at the hotel when you check in.");
    if (stay.room) {
      const info = r.room;
      if (info && info.available) {
        const few = info.left === 1 ? say(" เหลือห้องสุดท้ายแล้วค่ะ", " It's the last one.") : "";
        return say(`${stay.room.th}ว่างค่ะ ${nightsSay} รวม ${baht(info.total, L)} รวมอาหารเช้าแล้ว${few} เลือกห้องไว้ให้แล้ว ${finish}`,
          `Good news: the ${stay.room.en} is free. ${nightsSay} comes to ${baht(info.total, L)}, breakfast included.${few} I've selected it for you. ${finish}`);
      }
      if (!free.length) return none(L);
      return say(`${stay.room.th}เต็มแล้วในวันนั้นค่ะ ที่ยังว่างคือ ${free.map((x) => `${x.th} รวม ${baht(x.total, L)}`).join(" ")} สนใจห้องไหนคะ`,
        `Sorry, the ${stay.room.en} is full on those dates. Still free: ${free.map((x) => `the ${x.en} at ${baht(x.total, L)} in total`).join(", ")}. Which would you like?`);
    }
    if (!free.length) return none(L);
    const list = free.map((x) => (L === "th" ? `${x.th} รวม ${baht(x.total, L)}` : `the ${x.en} at ${baht(x.total, L)}`));
    return say(`ว่างค่ะ ${nightsSay}มี ${list.join(" ")} ทุกห้องรวมอาหารเช้า สนใจห้องไหนคะ`,
      `Yes, we have rooms. For ${nightsSay}: ${list.join(", ")}, breakfast included. Which room would you like?`);
  }
  const none = (L) => (L === "th"
    ? `ขอโทษค่ะ วันนั้นห้องเต็มทุกแบบแล้ว ลองเปลี่ยนวัน หรือทักไลน์ ${C.contact.line.id} ให้เราช่วยหาได้นะคะ`
    : `Sorry, we're fully booked on those dates. Try other dates, or message us on LINE at ${C.contact.line.id} and we'll help.`);

  // A booking was confirmed in the form: say so in the chat too.
  window.addEventListener("shop:booked", (e) => {
    ctx.booking = false;
    ctx.stay = null;
    ctx.offer = null;
    const b = e.detail || {};
    if (!ui.live.hidden && b.code) {
      addLine("agent", lang() === "th" ? `จองเรียบร้อยแล้วค่ะ รหัสการจอง ${b.code} แล้วพบกันที่โรงแรมนะคะ` : `You're booked. Your code is ${b.code}. See you at the hotel.`);
    }
  });

  const greeting = (L) =>
    L === "th"
      ? `สวัสดีค่ะ ${me.th}จาก${shop.th}ค่ะ ถามเรื่องห้องพัก ราคา ห้องว่าง หรือเส้นทางได้เลย หรือบอกวันที่อยากพักมาได้เลยค่ะ`
      : `Hi, I'm ${me.en} from ${shop.en}. Ask me about rooms, prices, free dates or directions, or just tell me when you'd like to stay.`;

  /* ------------------------------------------------- 6. Voice: listen + speak */
  let rec = null;
  let listening = false;
  let voiceMode = false;   // true: after each answer, listen again by itself
  let pauseListening = false; // true: an answer is still coming (free rooms), so wait for it
  let soundOn = true;
  let quiet = 0;           // times in a row the mic heard nothing
  let interim = null;
  let speechDone = Promise.resolve(); // resolves when the current answer has been said
  function pickVoice(L) {
    const voices = synth ? synth.getVoices() : [];
    const want = L === "th" ? "th" : "en";
    return voices.find((v) => v.lang.toLowerCase().startsWith(want) && /female|google|premium|natural|kanya|samantha/i.test(v.name)) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(want)) || null;
  }
  if (synth) synth.getVoices(); // some browsers load the voice list only after the first request

  const restStatus = () => setStatus(listening ? T.listening : SR ? T.idle : T.textMode, listening ? "listening" : "idle");
  function speak(text, L, done) {
    let said;
    speechDone = new Promise((resolve) => { said = resolve; });
    const finish = () => { restStatus(); said(); done && done(); };
    const voice = soundOn && synth ? pickVoice(L) : null;
    if (!voice) return finish(); // sound off, or this device has no voice for the language: text only
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/"/g, ""));
    u.voice = voice;
    u.lang = voice.lang;
    let ended = false;
    const end = () => { if (!ended) { ended = true; finish(); } };
    u.onend = end;
    u.onerror = end;
    setStatus(T.speaking, "speaking");
    synth.speak(u);
  }

  function listen() {
    if (!SR || listening || panel.hidden) return;
    if (synth) synth.cancel(); // talking over the assistant interrupts it
    rec = new SR();
    rec.lang = lang() === "th" ? "th-TH" : "en-US";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onstart = () => { listening = true; micState(); restStatus(); };
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else live += e.results[i][0].transcript;
      }
      if (live && !finalText) { // show the words as they are heard
        if (!interim) { interim = addLine("user", live); interim.classList.add("is-interim"); }
        else interim.lastChild.textContent = live;
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { voiceMode = false; addLine("note", T.micBlocked); }
      else if (e.error === "no-speech") quiet++;
      else if (e.error !== "aborted") voiceMode = false; // network or audio problem: wait for a tap
    };
    rec.onend = () => {
      listening = false;
      micState();
      if (interim) { interim.remove(); interim = null; }
      if (finalText.trim()) { quiet = 0; ask(finalText.trim()); }
      else if (voiceMode && quiet < 2 && !panel.hidden) listen(); // heard nothing: try once more, then wait for a tap
      else { voiceMode = false; restStatus(); }
    };
    try { rec.start(); } catch (e) { listening = false; }
  }
  function stopListening() {
    if (rec && listening) { try { rec.abort(); } catch (e) { /* already stopped */ } }
  }
  function micState() {
    if (!ui.mic) return;
    ui.mic.setAttribute("aria-pressed", String(listening));
    label(ui.mic, listening ? T.micStop : T.mic);
  }

  // One turn: what the visitor said (spoken, typed or a chip) → answer on screen and out loud.
  function ask(text) {
    const said = String(text || "").trim();
    if (!said) return "";
    if (ui.live.hidden) showLive();
    // Answer in the language the visitor used, and switch the page to match.
    const L = /[ก-๙]/.test(said) ? "th" : /[a-z]/i.test(said) ? "en" : lang();
    addLine("user", said);
    if (L !== lang()) page.lang(L);
    let answer;
    try { answer = reply(said, L); } catch (err) {
      console.warn("[concierge]", err);
      answer = L === "th" ? "ขอโทษค่ะ มีข้อผิดพลาด ลองถามใหม่อีกครั้งนะคะ" : "Sorry, something went wrong. Please try again.";
    }
    addLine("agent", answer);
    // When more is coming (which rooms are free), listen again only after that.
    const more = pauseListening;
    pauseListening = false;
    speak(answer, L, () => { if (!more && voiceMode && !panel.hidden) listen(); });
    return answer;
  }

  /* ---------------------------------------------------------------- 7. Wiring */
  function showLive() {
    ui.intro.hidden = true;
    ui.live.hidden = false;
  }
  function start(mode) {
    showLive();
    voiceMode = mode === "voice" && !!SR;
    quiet = 0;
    const hello = greeting(lang());
    addLine("agent", hello);
    speak(hello, lang(), () => { if (voiceMode && !panel.hidden) listen(); });
    if (!voiceMode) ui.field.focus({ preventScroll: true });
  }
  function openPanel() {
    panel.hidden = false;
    launch.setAttribute("aria-expanded", "true");
    html.classList.add("is-concierge-open");
    (ui.intro.hidden ? ui.field : $("[data-cg-start]", panel)).focus({ preventScroll: true });
    if (ui.intro.hidden) restStatus();
  }
  function closePanel() {
    voiceMode = false;
    stopListening();
    if (synth) synth.cancel();
    panel.hidden = true;
    launch.setAttribute("aria-expanded", "false");
    html.classList.remove("is-concierge-open");
    setStatus(null, "");
    launch.focus({ preventScroll: true });
  }
  function sendText() {
    const text = ui.field.value.trim();
    if (!text) return;
    ui.field.value = "";
    voiceMode = false; // typing: don't start listening after the answer
    stopListening();
    ask(text);
  }
  function setSound() {
    if (!ui.sound) return;
    ui.sound.innerHTML = R.t(soundOn ? T.soundOn : T.soundOff);
    ui.sound.setAttribute("aria-pressed", String(soundOn));
  }
  const syncLang = () => { ui.field.placeholder = T.placeholder[lang()]; };
  syncLang();
  setSound();
  // main.js swaps aria-labels when the language changes; placeholders are ours to swap.
  new MutationObserver(syncLang).observe(html, { attributes: true, attributeFilter: ["lang"] });

  launch.addEventListener("click", () => (panel.hidden ? openPanel() : closePanel()));
  ui.close.addEventListener("click", closePanel);
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });
  $$("[data-cg-start]", panel).forEach((b) => b.addEventListener("click", () => start(b.dataset.cgStart)));
  ui.send.addEventListener("click", sendText);
  ui.field.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); sendText(); } });
  if (ui.mic) ui.mic.addEventListener("click", () => {
    if (listening) { voiceMode = false; stopListening(); }
    else { voiceMode = true; quiet = 0; listen(); }
  });
  if (ui.sound) ui.sound.addEventListener("click", () => { soundOn = !soundOn; if (!soundOn && synth) synth.cancel(); setSound(); });
  window.addEventListener("pagehide", () => { stopListening(); if (synth) synth.cancel(); });

  // For the automated tests (tools/tests/concierge.mjs).
  window.ShopConcierge = {
    ask, rooms, extras, findRoom, findExtra, parseStay, findDates,
    settled: () => followUp,          // resolves once the "which rooms are free" answer is in
    context: () => ({ booking: ctx.booking, stay: ctx.stay && Object.assign({}, ctx.stay, { room: ctx.stay.room && ctx.stay.room.id }) }),
  };
})();
