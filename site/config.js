/* =============================================================================
   config.js — EVERYTHING hotel-specific lives in this one file.
   -----------------------------------------------------------------------------
   To rebrand for a real hotel, edit the values below (search for "CHANGE-ME"),
   then run:   node tools/bake.mjs      (from the project folder)
   Bake copies this content into index.html so it shows up without JavaScript,
   in LINE/Facebook link previews and in Google, and writes the room prices
   and booking rules the server uses (backend/shop.generated.mjs).

   Text that differs by language is written as { th: "…", en: "…" }.
   Text that is the same in both languages can be a plain string.

   ⚠ All content below is FICTIONAL demo content for "Sample Hotel".
     Only put a real hotel's details here with the owner's permission.
   ========================================================================== */

window.SHOP_CONFIG = {
  /* ---------------------------------------------------------------- 1. SITE */
  site: {
    url: "https://sample-hotel-demo.netlify.app", // CHANGE-ME: final address, no trailing slash
    defaultLang: "th",                            // first language shown to new visitors
    demoNotice: true,                             // CHANGE-ME: set false for a real hotel
    credit: { text: "Website by Sun", url: "" },  // footer credit (url optional)
  },

  /* ------------------------------------------------------------ 2. BUSINESS */
  business: {
    name: { th: "แซมเปิล โฮเทล", en: "Sample Hotel" },         // CHANGE-ME
    monogram: "S",                                            // CHANGE-ME: 1 letter for the favicon
    schemaType: "Hotel",
    tagline: {                                                // CHANGE-ME
      th: "โรงแรมเล็ก ๆ 14 ห้อง รอบสระว่ายน้ำและสวนปาล์ม ห่างประตูท่าแพเดิน 5 นาที",
      en: "Fourteen rooms around a pool and a palm garden, five minutes' walk from Tha Phae Gate.",
    },
    eyebrow: { th: "เชียงใหม่ · บูติกโฮเทล · 14 ห้อง", en: "Chiang Mai · Boutique hotel · 14 rooms" },
    priceRange: "฿฿",
  },

  /* --------------------------------------------------------------- 3. THEME
     Every color becomes a CSS variable (see css/shop.generated.css).
     Text colors must keep 4.5:1 contrast with their backgrounds; run
     `node tools/tests/contrast.mjs` after changing them.                     */
  theme: "lagoonGold", // CHANGE-ME: "lagoonGold" | "lannaGarden" | "tropicalDusk" | "warmClassic" | "modernMinimal"
  themes: {
    lagoonGold: {
      displayFont: "sans",   // clean sans headings: this hotel's own look
      bg: "#FBF7EF",         // page background (warm cream)
      bgAlt: "#E6F0EC",      // alternate section background (pale lagoon)
      sand: "#D5E5DF",       // cards, chips, highlights
      ink: "#0F2A30",        // main text (deep teal-black)
      inkSoft: "#44595D",    // secondary text
      accent: "#14636E",     // buttons, links, active tab (lagoon teal)
      accentInk: "#FBF7EF",  // text on accent
      dark: "#0E3A42",       // dark sections (booking, footer): deep teal
      onDark: "#F7F2E7",     // text on dark
      onDarkSoft: "#B7D2CD", // secondary text on dark
      glow: "#E2A84F",       // gold: decorative only on light backgrounds
    },
    lannaGarden: {
      displayFont: "sans",   // clean sans headings: this hotel's own look
      bg: "#F5F3EE",         // page background (stone)
      bgAlt: "#E9ECE4",      // alternate section background (pale sage)
      sand: "#DCE3D5",       // cards, chips, highlights
      ink: "#15271F",        // main text (forest)
      inkSoft: "#4A5950",    // secondary text
      accent: "#A3462A",     // buttons, links, active tab (terracotta)
      accentInk: "#FFF8F1",  // text on accent
      dark: "#15271F",       // dark sections (booking, footer)
      onDark: "#F5F3EE",     // text on dark
      onDarkSoft: "#B8C6BC", // secondary text on dark
      glow: "#D9A066",       // decorative only (never for text)
    },
    tropicalDusk: {
      displayFont: "serif",  // "serif" (Noto Serif Thai) or "sans" (IBM Plex Sans Thai)
      bg: "#FBF8F2",         // page background (warm white)
      bgAlt: "#F1EADB",      // alternate section background
      sand: "#E6DAC2",       // cards, chips, highlights
      ink: "#14252B",        // main text (deep teal-black)
      inkSoft: "#4A5C61",    // secondary text
      accent: "#1F5560",     // buttons, links, active tab (lagoon teal)
      accentInk: "#FBF8F2",  // text on accent
      dark: "#10262D",       // dark sections (story, footer)
      onDark: "#F6F2E8",     // text on dark
      onDarkSoft: "#BFCFCC", // secondary text on dark
      glow: "#D9A76A",       // decorative only (never for text)
    },
    warmClassic: {
      displayFont: "serif",
      bg: "#FDFAF4", bgAlt: "#F5ECDA", sand: "#EDE0C4",
      ink: "#2B1A0F", inkSoft: "#65503F",
      accent: "#6B4236", accentInk: "#FDFAF4",
      dark: "#2B1A0F", onDark: "#FDFAF4", onDarkSoft: "#D8C7AE",
      glow: "#C08A5B",
    },
    modernMinimal: {
      displayFont: "sans",
      bg: "#FAFAF8", bgAlt: "#F0EFEB", sand: "#E3E1DB",
      ink: "#18181A", inkSoft: "#57575C",
      accent: "#2E3A44", accentInk: "#FAFAF8",
      dark: "#18191B", onDark: "#F5F5F3", onDarkSoft: "#B9BABD",
      glow: "#8FA0AD",
    },
  },

  /* ------------------------------------------------------------- 4. CONTACT */
  contact: {
    phone: "+6653000000",          // CHANGE-ME: international format, used for tel: links
    phoneDisplay: "053-000-000",   // CHANGE-ME: how the number is shown
    line: {
      id: "@samplehotel-demo",                          // CHANGE-ME
      url: "https://line.me/R/ti/p/@samplehotel-demo",  // CHANGE-ME: LINE "add friend" link (also used for the QR code)
    },
    instagram: {
      handle: "samplehotel.demo",                          // CHANGE-ME
      url: "https://www.instagram.com/samplehotel.demo/",  // CHANGE-ME
    },
  },

  /* ------------------------------------------------------------ 5. LOCATION */
  location: {
    address: {                                                         // CHANGE-ME
      th: "ซอยเล็ก ๆ หลังประตูท่าแพ ตำบลช้างคลาน อำเภอเมือง เชียงใหม่ 50100",
      en: "A small lane behind Tha Phae Gate, Chang Khlan, Mueang, Chiang Mai 50100",
    },
    street: "ถนนท่าแพ",
    locality: "อำเภอเมืองเชียงใหม่",
    region: "เชียงใหม่",
    postalCode: "50100",
    country: "TH",
    geo: { lat: 18.78775, lng: 98.99318 },  // CHANGE-ME: right-click the hotel in Google Maps to copy
    mapsUrl: "",
    embed: "osm", // "osm" = OpenStreetMap (no tracking). "google" = Google Maps embed.
    // Step-by-step "how to get here". icon: train | fuel | walk | store | car | bus | stairs
    steps: [
      {
        icon: "car",
        title: { th: "จากสนามบินเชียงใหม่ 15 นาที", en: "15 minutes from Chiang Mai airport" },
        text: {
          th: "แท็กซี่สนามบินราคาเหมาประมาณ 150 บาท หรือให้เราส่งรถไปรับ 350 บาทต่อคัน แจ้งเที่ยวบินตอนจองได้เลย",
          en: "An airport taxi is a flat fare of about 150 THB, or we can send a car for 350 THB. Tell us your flight when you book.",
        },
      },
      {
        icon: "walk",
        title: { th: "จากประตูท่าแพ เดิน 5 นาที", en: "Five minutes' walk from Tha Phae Gate" },
        text: {
          th: "หันหลังให้ประตู เดินตามถนนท่าแพไปทางแม่น้ำ ซอยของเราอยู่ขวามือ ถัดจากร้านขายผ้าทอ",
          en: "With the gate behind you, follow Tha Phae Road towards the river. Our lane is on the right, just after the weaving shop.",
        },
      },
      {
        icon: "store",
        title: { th: "มองหาประตูไม้สีเขียวน้ำทะเล", en: "Look for the teal wooden gate" },
        text: {
          th: "เดินเข้าซอยมา 80 เมตร ประตูไม้สีเขียวน้ำทะเลกับโคมกระดาษสองดวงคือทางเข้าโรงแรม",
          en: "Eighty metres down the lane, a teal wooden gate with two paper lanterns is our entrance.",
        },
      },
    ],
    transit: {
      th: "ประตูท่าแพ เดิน 5 นาที · สนามบิน 15 นาที",
      en: "Tha Phae Gate, a 5-minute walk · Airport, 15 minutes",
    },
    parking: {
      th: "ที่จอดรถฟรี 6 คัน หน้าโรงแรม",
      en: "Free parking for 6 cars at the entrance",
    },
  },

  /* --------------------------------------------------------------- 6. HOURS
     For a hotel these are the FRONT DESK hours (shown as "open now").
     24-hour times. Empty list [] = closed that day.                          */
  hours: {
    timeZone: "Asia/Bangkok",
    weekly: {                       // CHANGE-ME
      mon: [["07:00", "22:00"]],
      tue: [["07:00", "22:00"]],
      wed: [["07:00", "22:00"]],
      thu: [["07:00", "22:00"]],
      fri: [["07:00", "22:00"]],
      sat: [["07:00", "22:00"]],
      sun: [["07:00", "22:00"]],
    },
    closedDates: [],
    note: {
      th: "เช็กอิน 14:00 น. · เช็กเอาต์ 12:00 น. · มาถึงหลัง 22:00 น. แจ้งล่วงหน้าทางไลน์ เราจะฝากกุญแจไว้ให้",
      en: "Check-in 14:00 · Check-out 12:00 · Arriving after 22:00? Tell us on LINE and we'll leave your key ready.",
    },
  },

  /* -------------------------------------------------------------- 7. PHOTOS
     Every photo used on the page. The key must match a file in /images-src
     (hero.jpg → "hero"). After adding photos run:  python tools/images.py
     focus = which point to keep when the photo is cropped ("x% y%").        */
  photos: {
    "hero":            { focus: "50% 62%", alt: { th: "สระว่ายน้ำล้อมด้วยต้นปาล์มยามพลบค่ำ ท้องฟ้าสีม่วง", en: "A swimming pool ringed by palm trees at dusk under a violet sky" } },
    "room-garden":     { focus: "62% 60%", alt: { th: "ห้องนอนสีขาวสว่าง เตียงเดี่ยวข้างหน้าต่างบานสูงกับผ้าม่านลินิน", en: "A bright white bedroom with a single bed beside tall windows and linen curtains" } },
    "room-deluxe":     { focus: "62% 55%", alt: { th: "เตียงผ้าขาวกับโคมไฟทองเหลืองหน้าผนังสีน้ำเงินเข้ม", en: "A white-linen bed and a brass lamp against a deep blue wall" } },
    "room-family":     { focus: "55% 62%", alt: { th: "ห้องกว้างสีขาว มีเตียงใหญ่ โต๊ะไม้ และต้นไม้ในกระถาง", en: "A wide white room with a large bed, a wooden table and potted plants" } },
    "room-studio":     { focus: "50% 70%", alt: { th: "หัวเตียงไม้สีขาวกับหมอนลายทาง ใต้ภาพสเก็ตช์ม้า", en: "A white wooden headboard with striped pillows under a sketch of a horse" } },
    "story-lounge":    { focus: "42% 60%", alt: { th: "เก้าอี้หนังสีน้ำตาลในมุมอ่านหนังสือของโรงแรม", en: "A tan leather armchair in the hotel's reading lounge" } },
    "g-sunset-palms":  { focus: "50% 55%", alt: { th: "ต้นปาล์มสะท้อนผิวน้ำในสระยามพระอาทิตย์ตก", en: "Palm trees reflected in the pool at sunset" } },
    "g-breakfast":     { focus: "50% 50%", alt: { th: "โต๊ะอาหารเช้า มีแพนเค้ก ผลไม้ และกาแฟ", en: "A breakfast table with pancakes, fruit and coffee" } },
    "g-terrace":       { focus: "50% 55%", alt: { th: "ระเบียงไม้เล็ก ๆ มีโต๊ะกลมและต้นไม้ในกระถาง", en: "A small wooden terrace with a round table and potted plants" } },
    "g-frangipani":    { focus: "50% 50%", alt: { th: "ดอกลีลาวดีสีขาวอมชมพู", en: "White and pink frangipani flowers" } },
    "g-rice-terraces": { focus: "50% 50%", alt: { th: "นาขั้นบันไดสีเขียวบนเนินเขา", en: "Green rice terraces on a hillside" } },
    "g-lantern":       { focus: "50% 35%", alt: { th: "เงาคนกำลังปล่อยโคมลอยยามเย็น", en: "The silhouette of someone releasing a sky lantern at dusk" } },
    "g-brunch":        { focus: "50% 55%", alt: { th: "จานอาหารเช้าสีสดบนโต๊ะสีขาว", en: "Colourful brunch plates on a white table" } },
    "g-bed":           { focus: "50% 45%", alt: { th: "เตียงผ้าลินินสีเทาอ่อนยามเช้า", en: "A bed with soft grey linen in morning light" } },
  },

  /* ----------------------------------------------------------------- 8. HERO */
  hero: {
    photo: "hero",
    video: null, // optional looping video: { mp4: "assets/video/hero.mp4", webm: "assets/video/hero.webm" }
  },

  /* ------------------------------------------------------------------ 9. ROOMS
     One card per room type. The booking system uses these too:
       id      short name used in bookings (letters and dashes; do not change
               it once the hotel has bookings),
       price   per night, in baht, including breakfast,
       sleeps  the most guests the room takes,
       count   how many rooms of this type the hotel has.                    */
  signature: {
    title: { th: "ห้องพัก", en: "Rooms" },
    intro: {
      th: "ทุกห้องรวมอาหารเช้า Wi-Fi และใช้สระว่ายน้ำได้ ราคาต่อคืนรวมภาษีแล้ว",
      en: "Every room includes breakfast, Wi-Fi and the pool. Prices are per night, tax included.",
    },
    items: [
      { id: "garden", photo: "room-garden", price: 1800, sleeps: 2, count: 5, size: 22, badges: ["bestseller"],
        name: { th: "ห้องการ์เดน", en: "Garden Room" },
        desc: { th: "ห้องสว่างชั้นล่าง เปิดประตูออกสวนได้เลย เตียงควีนไซซ์ 1 เตียง", en: "A bright ground-floor room that opens onto the garden. One queen bed." } },
      { id: "deluxe", photo: "room-deluxe", price: 2600, sleeps: 2, count: 5, size: 30, badges: [],
        name: { th: "ห้องดีลักซ์วิวสระ", en: "Deluxe Pool View" },
        desc: { th: "ชั้นสอง มีระเบียงมองเห็นสระและสวนปาล์ม เตียงคิงไซซ์ อ่างอาบน้ำ", en: "Upstairs, with a balcony over the pool and palms. King bed and a bathtub." } },
      { id: "studio", photo: "room-studio", price: 2200, sleeps: 3, count: 2, size: 32, badges: ["new"],
        name: { th: "สตูดิโอ", en: "Studio" },
        desc: { th: "มีมุมนั่งเล่นและโต๊ะทำงาน เตียงควีนไซซ์กับโซฟาเบด เหมาะกับพักยาว", en: "A sitting corner and a desk, a queen bed and a sofa bed. Good for longer stays." } },
      { id: "family", photo: "room-family", price: 3900, sleeps: 4, count: 2, size: 48, badges: [],
        name: { th: "แฟมิลี่สวีท", en: "Family Suite" },
        desc: { th: "สองห้องนอนเชื่อมกัน เตียงคิงไซซ์ 1 เตียง กับเตียงเดี่ยว 2 เตียง", en: "Two connecting bedrooms: one king bed and two single beds." } },
    ],
  },

  /* ----------------------------------------------------------------- 10. EXTRAS
     Things guests can add to a stay. price: a number (baht).
     badges: "new" | "bestseller" | "veg"                                     */
  menu: {
    title: { th: "อาหาร สปา และกิจกรรม", en: "Dining, spa and experiences" },
    note: { th: "ราคารวมภาษีแล้ว · จองกิจกรรมล่วงหน้า 1 วันที่เคาน์เตอร์หรือทางไลน์", en: "Prices include tax · Book experiences a day ahead at the desk or on LINE" },
    categories: [
      {
        id: "dining", name: { th: "อาหารและเครื่องดื่ม", en: "Dining" },
        items: [
          { name: { th: "อาหารเช้า (สำหรับแขกภายนอก)", en: "Breakfast for visitors" }, price: 320, desc: { th: "7:00–10:30 น. ริมสระ แขกที่พักรวมอยู่ในราคาห้องแล้ว", en: "7:00–10:30 by the pool. Included in the room rate for hotel guests." } },
          { name: { th: "ข้าวซอยไก่", en: "Khao Soi Chicken" }, price: 180, badges: ["bestseller"], desc: { th: "สูตรบ้านแม่ครัว เส้นไข่ทำเอง", en: "Our cook's family recipe with house-made egg noodles" } },
          { name: { th: "ชุดน้ำชายามบ่าย", en: "Afternoon Tea Set" }, price: 450, badges: ["new"], desc: { th: "สำหรับ 2 ท่าน เสิร์ฟ 14:00–17:00 น.", en: "For two, served 14:00–17:00" } },
          { name: { th: "ค็อกเทลริมสระ", en: "Poolside Cocktail" }, price: 260 },
          { name: { th: "มะพร้าวน้ำหอม", en: "Fresh Coconut" }, price: 90, badges: ["veg"] },
        ],
      },
      {
        id: "spa", name: { th: "สปา", en: "Spa" },
        items: [
          { name: { th: "นวดแผนไทย 60 นาที", en: "Thai Massage, 60 min" }, price: 700, badges: ["bestseller"] },
          { name: { th: "นวดน้ำมันอโรมา 90 นาที", en: "Aroma Oil Massage, 90 min" }, price: 1400 },
          { name: { th: "นวดเท้า 45 นาที", en: "Foot Massage, 45 min" }, price: 450 },
          { name: { th: "สปาแพ็กเกจคู่ 2 ชั่วโมง", en: "Couples Spa Package, 2 hours" }, price: 3600, badges: ["new"] },
        ],
      },
      {
        id: "trips", name: { th: "กิจกรรมและรถรับส่ง", en: "Experiences" },
        items: [
          { name: { th: "รถรับส่งสนามบิน", en: "Airport Transfer" }, price: 350, desc: { th: "ต่อคัน ต่อเที่ยว นั่งได้ 3 ท่าน", en: "Per car, each way, up to 3 guests" } },
          { name: { th: "คลาสทำอาหารไทย ครึ่งวัน", en: "Thai Cooking Class, half day" }, price: 1200, badges: ["bestseller"], desc: { th: "เริ่มจากเดินตลาดเช้า ทำ 4 เมนู", en: "Starts at the morning market. Cook four dishes." } },
          { name: { th: "ทัวร์ดอยสุเทพยามเช้า", en: "Doi Suthep Sunrise Tour" }, price: 900, desc: { th: "ออก 5:00 น. กลับทันอาหารเช้า", en: "Leaves at 5:00, back in time for breakfast" } },
          { name: { th: "เช่าจักรยาน 1 วัน", en: "Bicycle Rental, 1 day" }, price: 120 },
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- 11. STORY */
  story: {
    title: { th: "บ้านเก่าที่กลายเป็นโรงแรม", en: "An old family house that became a hotel" },
    photo: "story-lounge",
    body: [
      {
        th: "ที่นี่เคยเป็นบ้านไม้ของครอบครัวเรามาสามรุ่น ปี 2561 เราซ่อมบ้านหลังเดิม ขุดสระไว้กลางสวน และเปิดห้องให้แขกมาพักเป็นครั้งแรก",
        en: "This was our family's wooden house for three generations. In 2018 we restored it, dug a pool in the middle of the garden, and opened our first rooms to guests.",
      },
      {
        th: "เรายังอยู่กันเองเหมือนเดิม แม่ครัวคนเดิมทำอาหารเช้า และทุกเย็นจะมีคนจุดโคมที่ประตูหน้าบ้าน",
        en: "We still run it ourselves. The same cook makes breakfast, and someone lights the lanterns at the gate every evening.",
      },
    ],
    signoff: { th: "— ครอบครัวเจ้าของบ้าน (ตัวละครสมมุติ)", en: "— The family (fictional)" },
  },

  /* -------------------------------------------------------------- 12. GALLERY
     size: "tall" for portrait photos, "wide" for one featured landscape photo. */
  gallery: {
    title: { th: "รอบ ๆ โรงแรม", en: "Around the hotel" },
    items: [
      { photo: "g-sunset-palms", size: "wide" },
      { photo: "g-lantern", size: "tall" },
      { photo: "g-breakfast" },
      { photo: "g-terrace" },
      { photo: "g-frangipani" },
      { photo: "g-bed" },
      { photo: "g-brunch" },
      { photo: "g-rice-terraces" },
    ],
  },

  /* -------------------------------------------------------------- 13. REVIEWS
     ⚠ Never invent reviews for a real hotel. Use real reviews only, with the
       guest's permission or properly attributed. While isSample is true, the
       page shows a visible "sample text" label, and reviews are never added
       to Google structured data.                                            */
  reviews: {
    isSample: true, // CHANGE-ME: false only when every review below is real
    title: { th: "แขกพูดถึงเรา", en: "Kind words" },
    items: [
      { author: { th: "แขกตัวอย่าง ก.", en: "Sample guest A" }, source: { th: "ข้อความตัวอย่าง", en: "Sample text" },
        quote: { th: "เงียบสงบทั้งที่อยู่ใกล้ประตูท่าแพแค่นี้ ว่ายน้ำตอนเย็นใต้ต้นปาล์มคือที่สุด", en: "So quiet for somewhere this close to Tha Phae Gate. An evening swim under the palms was the highlight." } },
      { author: { th: "แขกตัวอย่าง ข.", en: "Sample guest B" }, source: { th: "ข้อความตัวอย่าง", en: "Sample text" },
        quote: { th: "ข้าวซอยอร่อยกว่าร้านดังหลายร้าน พนักงานจำชื่อเราได้ตั้งแต่วันแรก", en: "The khao soi beat several famous shops. The team knew our names from day one." } },
      { author: { th: "แขกตัวอย่าง ค.", en: "Sample guest C" }, source: { th: "ข้อความตัวอย่าง", en: "Sample text" },
        quote: { th: "พาลูกสองคนมาพักแฟมิลี่สวีท ห้องกว้าง เด็ก ๆ ไม่ยอมขึ้นจากสระ", en: "We took the Family Suite with two kids. Plenty of space, and they wouldn't leave the pool." } },
    ],
  },

  /* -------------------------------------------------------------- 14. CONTACT */
  contactSection: {
    title: { th: "มีคำถาม ทักไลน์หรือโทรหาเราได้เลย", en: "Questions? Message us on LINE or call" },
    intro: {
      th: "ขอเตียงเสริม แจ้งเวลาเที่ยวบิน หรือจองกิจกรรมล่วงหน้า เราตอบไวในเวลาทำการของเคาน์เตอร์",
      en: "Extra beds, flight times or booking an experience ahead: we reply quickly during front desk hours.",
    },
  },

  /* ------------------------------------------------------------------ 15. SEO
     title: ~50–60 characters. description: ~120–155 characters.            */
  seo: {
    title: {                                                   // CHANGE-ME
      th: "แซมเปิล โฮเทล | บูติกโฮเทลมีสระ ใกล้ประตูท่าแพ เชียงใหม่",
      en: "Sample Hotel | Boutique pool hotel near Tha Phae Gate",
    },
    description: {                                             // CHANGE-ME
      th: "โรงแรมบูติก 14 ห้อง รอบสระว่ายน้ำและสวนปาล์ม เดินจากประตูท่าแพ 5 นาที รวมอาหารเช้า จองห้องออนไลน์ได้ทันที ไม่ต้องจ่ายล่วงหน้า",
      en: "A 14-room boutique hotel around a pool and palm garden, 5 minutes' walk from Tha Phae Gate, Chiang Mai. Breakfast included. Book online, pay at the hotel.",
    },
    ogImage: "og", // generated by tools/images.py from the hero photo
  },

  /* ----------------------------------------------------------- 16. BOOKING
     A real booking system, free: it runs on Netlify Functions and stores data
     in Netlify Blobs (see backend/core.mjs). Staff see arrivals, guests in
     house and departures at /admin.html with the staff key (ADMIN_KEY on
     Netlify). Guests pay at the hotel: the site never asks for a card.
     On a host without the backend the form turns into "book on LINE".
     Room types, prices and how many rooms there are come from section 9.
     After changing anything here run `node tools/bake.mjs` and deploy again. */
  booking: {
    enabled: true,          // false = no booking section
    maxNights: 14,          // longest stay that can be booked online
    daysAhead: 180,         // how far ahead a stay can start
    checkIn: "14:00",
    checkOut: "12:00",
    lastSameDay: "20:00",   // a stay starting today can be booked until this time
    title: { th: "จองห้องพัก", en: "Book your stay" },
    intro: {
      th: "เลือกวันเข้าพัก จำนวนคืน และห้อง ระบบยืนยันให้ทันที จ่ายเงินที่โรงแรมตอนเช็กอิน",
      en: "Choose your dates and a room. It's confirmed straight away, and you pay at the hotel when you check in.",
    },
    note: {
      th: "ยกเลิกฟรีได้ถึงหนึ่งวันก่อนเข้าพัก พักเกิน 14 คืนหรือจองมากกว่า 1 ห้อง ทักไลน์ได้เลย",
      en: "Free cancellation until the day before arrival. For more than 14 nights or more than one room, message us on LINE.",
    },
  },
  orders: { enabled: false }, // the hotel site has no pre-orders

  /* ------------------------------------------------------- 17. VOICE CONCIERGE
     A "Talk to us" button: guests speak or type in Thai or English, the
     assistant answers out loud, and the page reacts while it talks (shows a
     room, opens the map, fills in the booking form).
     It is free: it runs in the visitor's browser (the browser's own speech
     recognition and voices), with no account, API key or server. It answers
     only from this file: rooms, prices, extras, location, and the faq below. */
  concierge: {
    enabled: true,                              // false = no button
    agentName: { th: "น้องปาล์ม", en: "Palm" },   // how the assistant introduces itself
    // Extra questions and answers. If what the visitor says contains one of
    // the keys, the assistant gives the answer. Only write what is true.
    faq: [
      { keys: ["เช็คอิน", "เช็กอิน", "เช็คเอาท์", "เช็กเอาต์", "เข้าพักได้กี่โมง", "check in", "check-in", "checkin", "check out", "check-out", "checkout"],  // CHANGE-ME
        answer: { th: "เช็กอินได้ตั้งแต่ 14:00 น. และเช็กเอาต์ก่อน 12:00 น. ค่ะ ถ้ามาถึงก่อนเวลา ฝากกระเป๋าไว้ที่เคาน์เตอร์ได้เลย", en: "Check-in is from 14:00 and check-out is by 12:00. If you arrive early, you can leave your bags at the front desk." } },
      { keys: ["อาหารเช้า", "breakfast"],
        answer: { th: "อาหารเช้ารวมอยู่ในราคาห้องแล้วค่ะ เสิร์ฟริมสระ 7:00 ถึง 10:30 น.", en: "Breakfast is included in the room rate, served by the pool from 7:00 to 10:30." } },
      { keys: ["สระ", "ว่ายน้ำ", "pool", "swim"],
        answer: { th: "สระว่ายน้ำเปิด 7:00 ถึง 20:00 น. ค่ะ แขกทุกห้องใช้ได้ฟรี มีผ้าเช็ดตัวที่ริมสระ", en: "The pool is open from 7:00 to 20:00 and free for all guests. Towels are by the pool." } },
      { keys: ["wifi", "wi-fi", "ไวไฟ", "อินเทอร์เน็ต", "internet"],
        answer: { th: "มี Wi-Fi ฟรีทุกห้องและรอบสระค่ะ", en: "There's free Wi-Fi in every room and around the pool." } },
      { keys: ["จ่าย", "ชำระ", "มัดจำ", "บัตรเครดิต", "เงินสด", "pay", "deposit", "card", "cash"],
        answer: { th: "จองออนไลน์ไม่ต้องจ่ายล่วงหน้าค่ะ จ่ายที่โรงแรมตอนเช็กอิน รับเงินสด โอน และบัตรเครดิต", en: "Booking online needs no payment up front. You pay at the hotel at check-in, by cash, bank transfer or card." } },
      { keys: ["ยกเลิกฟรี", "ยกเลิกได้", "นโยบายยกเลิก", "คืนเงิน", "cancellation", "refund", "cancel policy", "cancel for free", "free cancel"],
        answer: { th: "ยกเลิกฟรีได้ถึงหนึ่งวันก่อนเข้าพักค่ะ ยกเลิกได้เองในหน้าจอง ด้วยรหัสการจองกับเบอร์โทร", en: "Cancellation is free until the day before arrival. You can cancel yourself in the booking section with your code and phone number." } },
      { keys: ["สัตว์เลี้ยง", "หมา", "แมว", "pet", "dog", "cat"],
        answer: { th: "ขออภัยค่ะ โรงแรมไม่รับสัตว์เลี้ยง", en: "Sorry, we can't take pets." } },
      { keys: ["เด็ก", "เตียงเสริม", "เปลเด็ก", "child", "children", "kids", "baby", "extra bed", "cot"],
        answer: { th: "เด็กอายุไม่เกิน 6 ปีพักฟรีเมื่อใช้เตียงเดิมค่ะ เตียงเสริมคืนละ 500 บาท มีเปลเด็กให้ยืมฟรี แจ้งทางไลน์ได้เลย", en: "Children up to 6 stay free in existing beds. An extra bed is 500 baht a night, and cots are free. Just tell us on LINE." } },
      { keys: ["สนามบิน", "รถรับ", "airport", "transfer", "pick up", "pickup"],
        answer: { th: "สนามบินเชียงใหม่ห่าง 15 นาทีค่ะ เราส่งรถไปรับได้ 350 บาทต่อคัน แจ้งเที่ยวบินทางไลน์หลังจองได้เลย", en: "Chiang Mai airport is 15 minutes away. We can send a car for 350 baht. Tell us your flight on LINE after you book." } },
      { keys: ["แพ้", "ถั่ว", "กลูเตน", "allerg", "nut", "gluten", "dairy"],
        answer: { th: "เรื่องอาหารที่แพ้ รบกวนแจ้งพนักงานโดยตรงทางไลน์หรือที่เคาน์เตอร์นะคะ ผู้ช่วยอัตโนมัติยืนยันส่วนผสมให้ไม่ได้ค่ะ", en: "For allergies, please tell the team on LINE or at the front desk. As an automated assistant I can't confirm ingredients." } },
    ],
  },
};
