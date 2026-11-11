# Sample Hotel: one-page website with real booking and a voice concierge

A fast, bilingual (Thai first, English second) one-page site for a small hotel or guesthouse. A
first-time visitor on a phone can see the rooms, **check which rooms are free for their dates, see
the total, and book**, or just **talk to the hotel**. They can ask "do you have a room this weekend
for two?" and get an answer out loud.

- Plain HTML, CSS and JavaScript. **No frameworks, no trackers, no CDN, no paid APIs.**
- **Everything hotel-specific is in one file: [`site/config.js`](site/config.js).**
- A real booking backend that costs nothing (Netlify Functions + Netlify Blobs, free plan).
- A free voice concierge that runs in the visitor's browser (no account, no API key).
- **Live demo:** https://sample-hotel-demo.netlify.app (front desk: `/admin.html`)

All content is fictional demo content for "Sample Hotel" in Chiang Mai. Put a real hotel's details
in only with the owner's permission.

```
sample-hotel/
├── site/                  ← THE WEBSITE (what visitors download)
│   ├── config.js          ← edit this for each hotel
│   ├── index.html         ← page skeleton (filled from config by the bake step)
│   ├── admin.html         ← the front desk dashboard (needs the staff key)
│   ├── 404.html           ← "page not found" (generated)
│   ├── vercel.json        ← security headers if you host on Vercel (static only)
│   ├── css/  js/  assets/ ← styles, scripts, fonts, photos
│   └── robots.txt, sitemap.xml, site.webmanifest, icons (generated)
├── backend/
│   ├── core.mjs           ← the booking rules (availability, bookings, cancel, front desk)
│   └── shop.generated.mjs ← rooms, prices and booking settings (generated from config.js)
├── netlify/functions/api.mjs ← runs core.mjs on Netlify at /api/*, data in Netlify Blobs
├── netlify.toml           ← tells Netlify where the site and backend are; security headers
├── images-src/            ← original photos (NOT uploaded; tools/images.py makes web versions)
├── tools/
│   ├── images.py          ← resize photos, make AVIF/WebP, placeholders, favicons, OG image
│   ├── bake.mjs           ← copy config.js content into the HTML (for Google + link previews)
│   ├── serve.mjs          ← local server with the same backend (data in memory)
│   └── tests/             ← backend rules, booking, concierge, click-through, Lighthouse + axe
├── README.md              ← you are here
├── HOW_IT_WORKS.md        ← every file explained, for learning
└── CREDITS.md             ← photo, font and code credits
```

**You need:** [Node.js](https://nodejs.org) 22+ and, only for new photos, Python 3.10+ with
`pip install pillow` (Pillow 11.3 or newer, for AVIF).

---

## Preview it on your computer

```bash
npm install            # once: the one backend package
node tools/serve.mjs
```

Then open http://localhost:8080. The booking system works too, with the data kept in memory
(it is empty again after a restart). The front desk is http://localhost:8080/admin.html with the
staff key `local-admin`.

---

## What a guest can do

- **See the rooms** (section "Rooms"): photo, size, how many it sleeps, price per night, and
  "Book this room".
- **Book a stay** (section "Book your stay"): choose a check-in date, nights and guests. Every
  room shows whether it is free for **every** night of the stay and the total price. Rooms that
  are full, or too small for the group, can't be chosen. Name and phone, then **Confirm booking**:
  confirmed at once with a code. Payment is at the hotel on arrival; the site never asks for a card.
- **Check or cancel** a booking with the code and the phone number. Free cancellation until the
  day before arrival.
- **Talk to the hotel** (button "Talk to us", see below).
- See dining, spa and experiences with prices, the map and directions from the airport, the story,
  the gallery and reviews.

## What the front desk can do (`/admin.html`)

Sign in with the staff key. One day at a time:

- tiles: **arrivals**, **departures**, **rooms occupied tonight** (e.g. 9 / 14) and **room revenue
  tonight**,
- free rooms of each type tonight,
- three lists: **arriving today**, **in house**, **leaving today**, each with the name, phone (tap
  to call), dates, total and the guest's note,
- buttons: **Check in**, **No-show**, **Check out**, plus a menu to set any status (for example,
  cancelled by phone). A no-show or cancelled booking frees the room for those nights at once.

It refreshes every 30 seconds.

---

## Voice concierge (free)

A "Talk to us" button: guests speak or type in Thai or English, the assistant answers out loud, and
the page reacts while it talks. It shows the room it is describing, opens the map, switches
language, and **fills in the booking form and then says which rooms are free and what the stay
costs**:

> "จองห้อง 2 คืน พรุ่งนี้ 2 คน" → fills in the form, then: "ว่างค่ะ 2 คืนมี ห้องการ์เดน รวม 3,600 บาท …"
>
> "Book the family suite on Saturday for 1 night" → "Sorry, the Family Suite is full on those
> dates. Still free: the Garden Room at 1,800 baht in total, …" → "ok the garden room then" → selected.

It understands dates the way people say them: today/tonight, tomorrow, the day after tomorrow,
weekdays ("this Friday", "ศุกร์หน้า"), "this weekend", "from Friday to Monday", "20 ธันวา",
"dec 20 to dec 23", "the 5th". It also understands nights, weeks and guests ("2 คน", "ผู้ใหญ่ 2
เด็ก 1", "for two", "just me"). It recommends a room for the group ("family of 4", "cheapest",
"with a view") and answers the hotel's FAQ (check-in time, breakfast, pool, Wi-Fi, payment,
cancellation, pets, children, airport, allergies). It also covers extras, directions, parking and
front desk hours.

It costs nothing and needs no account, API key or server: hearing and speaking use the visitor's
own browser, and the answers come only from `config.js` plus live availability from the backend.
It is keyword matching, not AI: it never invents a price, and says so when it does not understand.
**Nothing is booked by voice**: the guest types their name and phone in the form and confirms.

- Voice input works in Chrome, Edge and Safari. Other browsers (Firefox) get the same assistant
  as a text chat.
- Spoken replies need a voice for the language on the visitor's device. If there is no Thai voice,
  Thai replies are shown as text only.
- With voice, the browser may send audio to its own provider (Google, Apple) to turn it into text.
  The panel says so before the microphone starts. For a real hotel, mention it in the privacy notice.
- Add the hotel's own questions and answers in `concierge.faq` in `config.js`.
- Turn it off with `concierge.enabled: false`.

---

## Booking system: what you should know

- **Rooms** come from `signature.items` in `config.js`: `id`, `price` per night, `sleeps`, and
  `count` (how many rooms of that type exist). Booking settings are in `booking`: `maxNights`,
  `daysAhead`, `checkIn`/`checkOut` times, `lastSameDay` (latest time to book for tonight).
  After changing them run `node tools/bake.mjs` (it writes `backend/shop.generated.mjs`) and deploy.
- **Prices are worked out on the server** from that file: a visitor cannot send their own total.
- **Personal data**: a name, phone number and optional note per booking, deleted 30 days after
  check-out. A real hotel must say so in its privacy notice, and the owner is responsible for it.
- **The staff key is a password.** Anyone with it can see guests' names and phone numbers. Keep it
  out of the code and out of chats; change it with `netlify env:set ADMIN_KEY` and deploy again.
- **Limits**: one visitor can make 6 bookings an hour; 10 wrong staff keys an hour are blocked.
  Visitor addresses are stored only as salted hashes, for an hour.
- **One room per booking.** For several rooms or more than `maxNights`, the site says to use LINE.
- **No payments, no notifications.** There is no email, SMS or LINE message to the hotel or the
  guest; the front desk sees bookings on the dashboard.
- **Two people booking the very last room in the same second** could both get through: the free
  storage has no locking. For a 14-room hotel that is rare; the dashboard shows it if it happens.
- **On a host without the backend** (for example Vercel, static only) the form turns into "book on
  LINE" by itself, and the concierge sends room bookings to LINE.

---

## Rebrand for a new hotel

| Step | |
| --- | --- |
| **Collect** | Hotel name (Thai and English), address, map pin, front desk hours, phone, LINE link, Instagram, room types with prices and how many of each, extras, 10–15 photos, and the owner's OK. |
| **Edit `site/config.js`** | From top to bottom. Every place that needs changing is marked `CHANGE-ME`. |
| **Photos** | Put them in `images-src/` with the names used in `config.photos`, then run `python tools/images.py`. |
| **Bake** | `node tools/bake.mjs`. Read the "Please check" list it prints. |
| **Check** | http://localhost:8080 on desktop *and* on your phone (same Wi-Fi: `http://<your-PC-IP>:8080`). Make a test booking and see it in `/admin.html`. |
| **Deploy** | See below, then test the live link on a phone. |

**Change the colors:** set `theme:` in config.js to `"tropicalDusk"`, `"warmClassic"` or
`"modernMinimal"`. Or copy one, rename it, change the hex colors, then run
`node tools/tests/contrast.mjs` to confirm text stays readable (4.5:1).

**Map pin:** in Google Maps, right-click the hotel and click the numbers at the top of the menu.
**LINE link:** in LINE Official Account Manager, use the "Add friend" URL (`https://line.me/R/ti/p/@yourid`).

### CHANGE-ME checklist

- [ ] `site.url` (no `/` at the end) and `site.demoNotice: false`
- [ ] `business.name` (th + en), `monogram`, `tagline`, `eyebrow`
- [ ] `contact.phone` (`+66…`), `phoneDisplay`, `contact.line` (**scan the QR on the page to test it**), `instagram`
- [ ] `location.address`, **`geo`** (check the pin!), `steps`, `transit`, `parking`
- [ ] `hours`: front desk hours
- [ ] `photos`: alt text in both languages for every photo
- [ ] `signature.items` (rooms: price, sleeps, count, size) and `menu.categories` (extras)
- [ ] `booking` settings and the cancellation wording in `booking.note` and `concierge.faq`
- [ ] `concierge.faq`: only true answers
- [ ] `story`: 2–3 true sentences from the owner
- [ ] `reviews`: **real reviews only**. Set `isSample: false` only when they are real
- [ ] `seo.title` and `seo.description`
- [ ] Demo photos replaced; `images.py` and `bake.mjs` run with no warnings
- [ ] A new `ADMIN_KEY` set on the host

**About reviews:** never invent testimonials. That misleads guests and breaks consumer protection
rules. Use reviews the hotel really received, with permission or clearly attributed. While
`isSample` is `true`, the page shows a visible "sample text" label. Reviews are never added to
Google structured data.

**Photos:** never hotlink photos from other websites, and never show a real hotel with photos of
another place. `images.py` makes AVIF + WebP at several widths, a tall phone crop of the hero,
blurred placeholders, the link-preview image and the favicons.

---

## Deploy to Netlify (website + booking backend)

Deploy from the **project folder** with Netlify's command-line tool. Dragging the `site` folder
onto Netlify publishes the pages without the backend.

```bash
npm install                                          # once
npx netlify-cli login                                # once, opens the browser
npx netlify-cli sites:create --name <hotel-name>     # once (or: npx netlify-cli link)
npx netlify-cli env:set ADMIN_KEY "<a long secret>"  # once: the staff key for /admin.html
node tools/bake.mjs
npx netlify-cli deploy --prod
```

1. Put the address in `site.url` in `config.js`, bake, and deploy again.
2. Check it: `https://<address>/api/health` should answer `{"ok":true,"booking":true,...}` and
   `curl -I https://<address>` should show `content-security-policy`.
3. Optional: **Domain management → Add a domain** for the hotel's own domain (free HTTPS).

**Updating later (this copy is connected to GitHub and Netlify):** the working folder is
`C:\Projects\sample-hotel`. Edit, check it locally (`npm run serve`), then

```bash
git add -A
git commit -m "What you changed"
git push
```

The push updates GitHub (`SUDARSUN-24/sample-hotel`), and Netlify then builds and publishes the
site by itself within a minute or two (it runs `node tools/bake.mjs` first, so config edits always
apply). Watch it under **Deploys** in the Netlify dashboard. Nothing goes live until you push.
After changing `ADMIN_KEY`, push or redeploy: functions read it at deploy time.

> **Note (November 2026):** Netlify's free plan adds a "Hosted on Netlify" badge script to every
> page. This site's security policy blocks it, so the badge doesn't show, but the browser console
> logs 2 errors and Lighthouse Best Practices drops to about 92.

**Vercel** works for the pages only (no backend): see `site/vercel.json`. The booking form then
becomes "book on LINE".

---

## Testing

```bash
cd tools && npm install && cd ..        # once: Playwright, Lighthouse, axe (uses your installed Chrome)
npm test                                # backend rules, hours logic, color contrast (no browser)
node tools/serve.mjs --test             # keep running in a second terminal (--test lets tests set the clock)

node tools/tests/booking.mjs            # booking form, sold out, check/cancel, front desk, no-backend (36 checks)
node tools/tests/concierge.mjs          # the concierge: dates, rooms, booking by voice, FAQ, a11y (48 checks)
node tools/tests/interactions.mjs       # every button, tab, lightbox, toggle (78 checks)
node tools/tests/screens.mjs            # screenshots at 360/390/768/1440 → ./shots
node tools/tests/audit.mjs              # Lighthouse (median of 3) + axe accessibility scan
```

The tests fix the clock to Thursday 12 Nov 2026, 10:00 Bangkok. They do not test the microphone or
the spoken voice: try those by hand in Chrome.

Tip: keep `tools/node_modules` out of OneDrive, or pause syncing while installing.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| The booking form says "book on LINE" | The backend didn't answer: open `/api/health`. On Netlify, deploy from the project folder, not by dragging `site/`. |
| Front desk says the key is wrong | `ADMIN_KEY` on Netlify, then deploy again. Locally the key is `local-admin`. |
| Changed prices or rooms but the form shows old ones | Run `node tools/bake.mjs` (it rewrites `backend/shop.generated.mjs`) and deploy. |
| Changed config but the LINE preview shows old text | Run the bake and redeploy. LINE caches previews for a while too. |
| A photo is grey | Its name in `config.photos` doesn't match a file in `images-src/`, or `images.py` wasn't run. |
| Map preview stays blank after tapping | `frame-src` in `netlify.toml` must include the map site in `location.embed`. |
| The concierge doesn't speak Thai | The device has no Thai voice; replies are shown as text. |
