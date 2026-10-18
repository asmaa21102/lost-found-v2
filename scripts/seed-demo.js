// Demo data: fictional people, places around Karabük city centre, and lost/found reports
// built from the Commons photos in demo/photos (see CREDITS.json). Everything here is
// illustrative. It REPLACES all reports, users, claims and notifications in the database.
//   node scripts/seed-demo.js --yes
// Restart the server afterwards so it reloads the photo index.
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const db = require("../src/db");
const ai = require("../src/ai");
const uploads = require("../src/uploads");
const photoIndex = require("../src/photo-index");
const matching = require("../src/matching");
const notify = require("../src/notify");
const { migrate } = require("../src/migrations");
const config = require("../src/config");

if (!process.argv.includes("--yes")) {
  console.log("This replaces all data in", config.db.database, "— run with --yes to continue.");
  process.exit(1);
}

const PHOTOS = path.join(__dirname, "..", "demo", "photos");
const CENTER = { lat: 41.2061, lng: 32.6204 };

const PLACES = {
  library: { name: "Central Library, 2nd floor reading room", d: [0.0042, 0.0061] },
  engineering: { name: "Engineering Faculty, Block B corridor", d: [0.0105, 0.0128] },
  cafeteria: { name: "Student Cafeteria", d: [0.0071, 0.0094] },
  bus: { name: "Intercity Bus Terminal, waiting hall", d: [-0.0093, -0.0121] },
  park: { name: "City Park, near the fountain", d: [-0.0021, 0.0035] },
  mall: { name: "Shopping Mall, food court", d: [-0.0058, 0.0012] },
  sports: { name: "Sports Hall, changing rooms", d: [0.0134, 0.0031] },
  dorm: { name: "Dormitory A, entrance lobby", d: [0.0158, 0.0102] },
  train: { name: "Train Station, platform 1", d: [-0.0127, 0.0067] },
  medical: { name: "Medical Faculty, lecture hall 3", d: [0.0089, -0.0047] },
  square: { name: "Main Square bus stop", d: [-0.0011, -0.0024] },
};
const jitter = (seed) => ((Math.sin(seed * 9301 + 49297) * 233280) % 1) * 0.0009;
const place = (key, seed) => {
  const p = PLACES[key];
  return { location_name: p.name, latitude: +(CENTER.lat + p.d[0] + jitter(seed)).toFixed(6), longitude: +(CENTER.lng + p.d[1] + jitter(seed + 7)).toFixed(6) };
};
const daysAgo = (n, hour = 12) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, (n * 17) % 60, 0, 0);
  return d;
};
const ymd = (d) => d.toISOString().slice(0, 10);

const USERS = [
  { username: "demo", full_name: "Demo Student", email: "demo@example.com", password: "Demo12345", role: "user" },
  { username: "admin", full_name: "Platform Admin", email: "admin@example.com", password: "Admin12345", role: "admin" },
  { username: "ayse", full_name: "Ayşe Yılmaz", email: "ayse@example.com", password: "Demo12345" },
  { username: "mehmet", full_name: "Mehmet Kaya", email: "mehmet@example.com", password: "Demo12345" },
  { username: "sara", full_name: "Sara Haddad", email: "sara@example.com", password: "Demo12345" },
  { username: "omar", full_name: "Omar Nasser", email: "omar@example.com", password: "Demo12345" },
  { username: "elif", full_name: "Elif Demir", email: "elif@example.com", password: "Demo12345" },
  { username: "can", full_name: "Can Öztürk", email: "can@example.com", password: "Demo12345" },
  { username: "newbie", full_name: "Deniz Arslan", email: "deniz@example.com", password: "Demo12345" },
];

// key, user, type, days ago, place, fields, photos
const REPORTS = [
  ["wallet_lost", "demo", "lost", 3, "library", { title: "Black leather wallet", category: "wallet", color: "black", brand: null, description: "Black leather bifold wallet with a brown stitched edge. Has my student card, a bank card and some cash. I think it slipped out of my jacket while I was studying.", private_details: "Student card in the name of the demo account, a photo of a cat behind the cards and a 20 TL note." }, ["wallet-1"]],
  ["wallet_found", "ayse", "found", 2, "cafeteria", { title: "Dark leather wallet", category: "wallet", color: "black", description: "Found a black leather wallet on a table in the student cafeteria in the afternoon. Handed nothing to security yet, keeping it safe.", private_details: "Contains a student card and a small photo. Ask the owner what is behind the cards." }, ["wallet-2"]],
  ["wallet2_lost", "omar", "lost", 6, "mall", { title: "Snakeskin pattern wallet", category: "wallet", color: "beige", description: "Light beige wallet with a snakeskin pattern, closes with a snap button. Lost at the mall food court.", private_details: "Driving licence and a gym membership card." }, ["wallet-3"]],

  ["keys_lost", "mehmet", "lost", 4, "engineering", { title: "Bunch of keys with blue carabiner", category: "keys", color: "silver", description: "Four keys on a ring with a blue carabiner clip, one of them is a small mailbox key. Probably dropped in the Block B corridor.", private_details: "One key has a red dot painted on it." }, ["keys-1"]],
  ["keys_found", "sara", "found", 3, "engineering", { title: "Door key on a round metal keyring", category: "keys", color: "silver", brand: "O&K", description: "Single door key with a round metal tag, found near the stairs in the engineering building.", private_details: "The tag has a logo engraved on it." }, ["keys-3"]],
  ["keychain_found", "elif", "found", 9, "park", { title: "Keychain with golden medallion", category: "keys", color: "gold", description: "Keychain with a decorated golden medallion, no keys attached. Found on a bench in the city park.", private_details: null }, ["keys-2"]],

  ["backpack_lost", "elif", "lost", 8, "bus", { title: "Red and grey backpack", category: "bag", color: "red", description: "Red backpack with grey panels and a white logo, contains a notebook and a charger. Left it in the waiting hall of the bus terminal.", private_details: "Inside there's a notebook with my name on the first page." }, ["backpack-1"]],
  ["backpack_found", "can", "found", 7, "bus", { title: "Blue hiking backpack", category: "bag", color: "blue", description: "Large blue hiking backpack, about 50 litres, left under a seat at the bus terminal.", private_details: "There is a sleeping mat strapped to the bottom." }, ["backpack-2"]],

  ["phone_lost", "omar", "lost", 2, "square", { title: "Black Android phone", category: "phone", color: "black", brand: "Blackview", description: "Black Blackview smartphone in a black leather folio case. Lost at the main square bus stop this morning.", private_details: "Lock screen wallpaper is a mountain lake. The case has a card slot with a metro card." }, ["smartphone-1"]],
  ["phone_found", "demo", "found", 1, "square", { title: "Smartphone in a black flip case", category: "phone", color: "black", brand: "Blackview", description: "Found a smartphone in a black flip case on the bench at the main square bus stop. Battery was low.", private_details: "The case has a metro card inside. Ask about the lock screen picture." }, ["smartphone-2"]],

  ["earbuds_lost", "sara", "lost", 5, "sports", { title: "White AirPods in charging case", category: "audio", color: "white", brand: "Apple", description: "White AirPods with the charging case. Lost in the sports hall changing rooms after the evening class.", private_details: "Small scratch on the lid and the case is named 'Sara's AirPods' in Bluetooth." }, ["earbuds-1"]],
  ["earbuds_found", "mehmet", "found", 4, "sports", { title: "White wireless earbuds case", category: "audio", color: "white", description: "White earbuds charging case found on a bench in the sports hall.", private_details: "Shows a custom Bluetooth name when opened." }, ["earbuds-2"]],

  ["glasses_lost", "can", "lost", 20, "medical", { title: "Gold frame reading glasses", category: "glasses", color: "gold", description: "Round gold metal frame glasses, thin arms. Left them in lecture hall 3 of the medical faculty.", private_details: "Prescription +1.5, small dent on the left arm." }, ["glasses-1"]],
  ["glasses_found", "elif", "found", 19, "medical", { title: "Round glasses with gold frame", category: "glasses", color: "gold", description: "Found round gold-framed glasses on a desk in lecture hall 3.", private_details: "One arm is slightly bent." }, ["glasses-2"]],

  ["umbrella_lost", "ayse", "lost", 15, "train", { title: "Black umbrella", category: "umbrella", color: "black", description: "Large black umbrella with a curved handle, left on platform 1 at the train station.", private_details: "Handle has a small sticker." }, ["umbrella-1"]],
  ["umbrella_found", "omar", "found", 15, "train", { title: "Black umbrella left on the platform", category: "umbrella", color: "black", description: "A black umbrella was left on a bench on platform 1.", private_details: null }, ["umbrella-2"]],

  ["bottle_lost", "demo", "lost", 6, "sports", { title: "Black stainless steel water bottle", category: "bottle", color: "black", description: "Matte black stainless steel bottle with a screw cap, about 750 ml. Left near the sports hall entrance.", private_details: "Has a small dent at the bottom." }, ["bottle-1"]],
  ["bottle_found", "can", "found", 5, "sports", { title: "Black metal water bottle", category: "bottle", color: "black", brand: "Niksun", description: "Black metal water bottle with a yellow logo, found at the sports hall.", private_details: "Dent at the bottom." }, ["bottle-2"]],
  ["bottle2_found", "ayse", "found", 10, "library", { title: "Blue bottle", category: "bottle", color: "blue", description: "Blue plastic bottle left at the library entrance. No photo, sorry.", private_details: null }, []],

  ["lanyard_lost", "elif", "lost", 3, "dorm", { title: "Orange lanyard with ID card holder", category: "documents", color: "orange", description: "Orange lanyard with a clear plastic card holder. My student ID and dorm card are inside.", private_details: "Student ID number ends in 4417." }, ["lanyard-1"]],
  ["lanyard_found", "ayse", "found", 2, "dorm", { title: "Lanyard with card holder", category: "documents", color: "grey", description: "Grey printed lanyard with a card holder found at the dorm A lobby.", private_details: "Has an ID card inside; the owner should tell the ID number." }, ["lanyard-2"]],

  ["watch_lost", "mehmet", "lost", 11, "mall", { title: "Silver and gold wristwatch", category: "watch", color: "silver", brand: "Fossil", description: "Fossil chronograph watch with a two-tone silver and gold steel strap. Gift from my father.", private_details: "Engraving on the back: 'M.K. 2019'." , is_valuable: 1 }, ["watch-1"]],
  ["watch_found", "sara", "found", 10, "mall", { title: "Men's steel wristwatch", category: "watch", color: "silver", description: "Steel wristwatch found near the mall food court. Handed in to me by a cleaner, I'm keeping it safe.", private_details: "There is an engraving on the back.", is_valuable: 1 }, ["watch-2"]],
  ["watch2_found", "can", "found", 13, "train", { title: "Automatic watch with leather strap", category: "watch", color: "gold", description: "Automatic watch with a transparent back and brown leather strap, found at the train station.", private_details: "Limited edition number on the back.", is_valuable: 1 }, ["watch-3"]],

  ["laptop_lost", "sara", "lost", 4, "library", { title: "Black Lenovo laptop", category: "laptop", color: "black", brand: "Lenovo", description: "Black Lenovo G500s laptop, left on a desk in the library reading room. Has a sticker near the touchpad.", private_details: "Login screen shows the user 'sara-h'. Serial number ends with 7Q2.", is_valuable: 1 }, ["laptop-2"]],
  ["laptop_found", "demo", "found", 3, "library", { title: "Lenovo laptop left in reading room", category: "laptop", color: "black", brand: "Lenovo", description: "Black Lenovo laptop found on a desk in the 2nd floor reading room after closing time.", private_details: "Ask for the user name on the login screen and the serial number.", is_valuable: 1 }, ["laptop-3"]],

  ["headphones_lost", "omar", "lost", 12, "cafeteria", { title: "Black over-ear headphones", category: "audio", color: "black", brand: "JLab", description: "Black over-ear headphones with cushioned ear cups, folded. Lost in the cafeteria.", private_details: "Left cushion is a bit torn." }, ["headphones-1"]],
  ["headphones_found", "elif", "found", 11, "cafeteria", { title: "Wired headphones, black and brown", category: "audio", color: "black", description: "Wired over-ear headphones with wooden-looking cups found in the cafeteria.", private_details: null }, ["headphones-2"]],

  ["teddy_lost", "ayse", "lost", 2, "park", { title: "Cream teddy bear (child's toy)", category: "toys", color: "beige", description: "My daughter's cream-colored teddy bear, she's very sad. Lost in the city park near the playground.", private_details: "Has a sewn patch on the left foot." }, ["teddy-2"]],
  ["teddy_found", "mehmet", "found", 1, "park", { title: "Teddy bear found in the grass", category: "toys", color: "brown", description: "Found a teddy bear sitting in the grass in the city park, a bit dirty from the rain.", private_details: "Foot has a patch." }, ["teddy-1"]],

  ["scarf_lost", "elif", "lost", 14, "medical", { title: "Purple knitted infinity scarf", category: "clothing", color: "purple", description: "Hand-knitted purple infinity scarf, chunky wool.", private_details: null }, ["scarf-1"]],
  ["scarf_found", "can", "found", 9, "library", { title: "Beige wool scarf with fringe", category: "clothing", color: "beige", brand: "Ralph Lauren", description: "Soft beige wool scarf with fringes, found on a chair in the library.", private_details: "Has a brand label." }, ["scarf-2"]],

  ["camera_lost", "omar", "lost", 18, "park", { title: "Silver Pentax compact camera", category: "electronics", color: "silver", brand: "Pentax", description: "Silver Pentax Optio compact digital camera, has photos from my trip on the memory card.", private_details: "Memory card has a holiday photo set; the strap is missing.", is_valuable: 1 }, ["camera-2"]],
  ["camera_found", "can", "found", 17, "park", { title: "Small silver digital camera", category: "electronics", color: "silver", brand: "Pentax", description: "Small silver camera found on the grass near the fountain in the city park.", private_details: "Ask what is on the memory card.", is_valuable: 1 }, ["camera-1"]],
  ["camera2_found", "sara", "found", 25, "train", { title: "Red compact camera", category: "electronics", color: "red", description: "Red compact digital camera found at the station.", private_details: null }, ["camera-3"]],

  ["notebook_found", "sara", "found", 6, "engineering", { title: "Spiral notebook with lecture notes", category: "books", color: "white", description: "Spiral-bound notebook with calculus lecture notes, found in Block B.", private_details: "Name on the inside cover." }, ["notebook-1"]],
  ["usb_lost", "demo", "lost", 9, "engineering", { title: "SanDisk USB flash drive 4 GB", category: "electronics", color: "black", brand: "SanDisk", description: "Black SanDisk Cruzer slide USB drive with my project files. Probably left in a computer lab.", private_details: "Has a folder named 'thesis-final'." }, ["usb-2"]],
  ["usb_found", "omar", "found", 8, "engineering", { title: "White USB stick", category: "electronics", color: "white", brand: "Kingston", description: "White and red Kingston USB stick left in a lab computer.", private_details: null }, ["usb-1"]],
  ["calc_lost", "can", "lost", 7, "engineering", { title: "Casio scientific calculator", category: "electronics", color: "black", brand: "Casio", description: "Casio fx-991MS scientific calculator, needed for my exam next week!", private_details: "Initials on the back cover." }, ["calculator-1"]],
  ["calc_found", "ayse", "found", 6, "engineering", { title: "Scientific calculator", category: "electronics", color: "grey", brand: "Sharp", description: "Grey scientific calculator found in an exam hall in Block B.", private_details: null }, ["calculator-2"]],

  ["ring_found", "mehmet", "found", 5, "mall", { title: "Gold ring", category: "jewelry", color: "gold", description: "Gold ring found near the sinks in the mall restrooms.", private_details: "There is an inscription inside the ring.", is_valuable: 1 }, ["ring-1"]],
  ["ring_lost", "sara", "lost", 6, "mall", { title: "Thin gold ring with small stone", category: "jewelry", color: "gold", description: "Thin gold ring with a small white stone. Took it off to wash my hands at the mall.", private_details: "Inscription inside: 'S & K'.", is_valuable: 1 }, ["ring-2"]],

  ["sunglasses_lost", "demo", "lost", 10, "park", { title: "Black sunglasses", category: "glasses", color: "black", description: "Black wraparound sunglasses, lost while walking in the park.", private_details: null }, ["sunglasses-2"]],
  ["sunglasses_found", "elif", "found", 16, "square", { title: "Sunglasses on the pavement", category: "glasses", color: "brown", description: "Round sunglasses with brown lenses found on the pavement at the main square.", private_details: null }, ["sunglasses-3"]],

  ["carkey_lost", "mehmet", "lost", 1, "medical", { title: "Toyota car key fob", category: "keys", color: "black", brand: "Toyota", description: "Black Toyota remote key fob on a leather strap. Lost between the medical faculty parking lot and the entrance.", private_details: "Leather strap has a small 'M' stamped on it." }, []],
];

async function photoFile(name) {
  return fs.promises.readFile(path.join(PHOTOS, name + ".jpg"));
}

async function main() {
  await migrate({ log: () => {} });
  console.log("• clearing old data");
  for (const t of ["messages", "claim_events", "claims", "matches", "saved_items", "notifications", "flags", "audit_log", "email_outbox", "item_photos", "items", "users"])
    await db.query(`DELETE FROM ${t}`);
  await db.query("DELETE FROM sessions").catch(() => {});
  for (const f of fs.readdirSync(config.uploadsDir)) if (f.endsWith(".webp")) fs.unlinkSync(path.join(config.uploadsDir, f));

  console.log("• users");
  const users = {};
  for (const [i, u] of USERS.entries()) {
    const r = await db.query("INSERT INTO users (username, full_name, email, password, role, notify_prefs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      u.username, u.full_name, u.email, await bcrypt.hash(u.password, 10), u.role || "user", JSON.stringify(notify.DEFAULT_PREFS), daysAgo(40 - i),
    ]);
    users[u.username] = r.insertId;
  }

  console.log("• loading AI model");
  await ai.init();

  console.log("• reports");
  const items = {};
  for (const [i, [key, user, type, ago, where, f, photos]] of REPORTS.entries()) {
    const at = daysAgo(ago, 9 + (i % 9));
    const loc = place(where, i);
    const r = await db.query(
      `INSERT INTO items (user_id, type, title, category, color, brand, description, event_date, location_name, latitude, longitude, is_valuable, private_details, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [users[user], type, f.title, f.category, f.color || null, f.brand || null, f.description, ymd(at), loc.location_name, loc.latitude, loc.longitude, f.is_valuable || 0, f.private_details || null, new Date(at.getTime() + 3600e3)]
    );
    items[key] = { id: r.insertId, user: users[user], type, title: f.title };
    for (const [n, name] of photos.entries()) {
      const saved = await uploads.savePhoto(await photoFile(name));
      const vec = await ai.embedImage(saved.buffer);
      const p = await db.query("INSERT INTO item_photos (item_id, filename, width, height, sort_order, embedding) VALUES (?, ?, ?, ?, ?, ?)", [r.insertId, saved.filename, saved.width, saved.height, n, ai.toBuffer(vec)]);
      photoIndex.set(p.insertId, r.insertId, vec);
    }
  }

  // A report held for review (contains a phone number) and one flagged as spam.
  const held = await db.query(
    `INSERT INTO items (user_id, type, title, category, color, description, event_date, location_name, status, moderation_note, created_at)
     VALUES (?, 'found', 'Found earphones, call me', 'audio', 'white', 'Found white earphones near the mall. Call me at 0555 123 45 67 to get them back.', ?, 'Shopping Mall', 'pending_review', 'Contains a phone number (keep contact details private)', ?)`,
    [users.newbie, ymd(daysAgo(1)), daysAgo(1, 15)]
  );
  items.held = { id: held.insertId };

  console.log("• matching");
  for (const key of Object.keys(items)) await matching.runForItem(items[key].id, { notifyUsers: true });
  const matchOf = async (lostKey, foundKey) => (await db.one("SELECT id FROM matches WHERE lost_item_id = ? AND found_item_id = ?", [items[lostKey].id, items[foundKey].id]))?.id || null;

  console.log("• claims");
  async function claim(foundOrLostKey, claimant, { message, proof, steps = [], messages = [], lostKey = null, ago = 1 }) {
    const item = items[foundOrLostKey];
    const kind = item.type === "found" ? "ownership" : "finder";
    const matchId = lostKey ? await matchOf(lostKey, foundOrLostKey) : null;
    const requiresAdmin = (await db.one("SELECT is_valuable OR category = 'documents' AS r FROM items WHERE id = ?", [item.id])).r ? 1 : 0;
    const r = await db.query("INSERT INTO claims (item_id, claimant_id, kind, match_id, message, proof, requires_admin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
      item.id, users[claimant], kind, matchId, message, proof, requiresAdmin, daysAgo(ago, 10),
    ]);
    const id = r.insertId;
    await db.query("INSERT INTO claim_events (claim_id, actor_id, from_status, to_status, note, created_at) VALUES (?, ?, NULL, 'pending', ?, ?)", [id, users[claimant], "Ownership request sent", daysAgo(ago, 10)]);
    await notify.send(item.user, "claim", kind === "ownership" ? "claim_ownership" : "claim_finder", { title: item.title }, `/claims/${id}`);
    let status = "pending";
    let hour = 11;
    for (const [to, actor, note] of steps) {
      await db.query("INSERT INTO claim_events (claim_id, actor_id, from_status, to_status, note, created_at) VALUES (?, ?, ?, ?, ?, ?)", [id, users[actor], status, to, note || null, daysAgo(ago, hour++)]);
      status = to;
    }
    for (const [who, body] of messages) {
      await db.query("INSERT INTO messages (claim_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)", [id, users[who], body, daysAgo(ago, hour++)]);
    }
    await db.query("UPDATE claims SET status = ? WHERE id = ?", [status, id]);
    if (status === "returned") {
      await db.query("UPDATE items SET status = ? WHERE id = ?", [item.type === "found" ? "returned" : "resolved", item.id]);
      if (lostKey) {
        await db.query("UPDATE items SET status = 'resolved' WHERE id = ?", [items[lostKey].id]);
        if (matchId) await db.query("UPDATE matches SET status = 'confirmed', lost_response = 'yes', found_response = 'yes' WHERE id = ?", [matchId]);
      }
    }
    return id;
  }

  await claim("glasses_found", "can", {
    lostKey: "glasses_lost", ago: 18,
    message: "These look like the glasses I left in lecture hall 3.",
    proof: "Prescription +1.5 and the left arm has a small dent from when I dropped them.",
    steps: [["under_review", "elif"], ["approved", "elif", "The bent arm matches."], ["returned", "can", "Got them back, thank you!"]],
    messages: [["elif", "Hi! I can bring them to the medical faculty tomorrow at 10."], ["can", "Perfect, I'll be at the entrance."], ["can", "Received, thanks a lot!"]],
  });
  await claim("umbrella_found", "ayse", {
    lostKey: "umbrella_lost", ago: 14,
    message: "I think this is my umbrella from platform 1.",
    proof: "Curved handle with a small star sticker near the end.",
    steps: [["approved", "omar", "Sticker is there."], ["returned", "omar", "Handed over at the station."]],
  });
  await claim("bottle_found", "demo", {
    lostKey: "bottle_lost", ago: 1,
    message: "Hi, I lost a black steel bottle near the sports hall the day before.",
    proof: "It has a small dent at the bottom and the cap is a bit scratched.",
  });
  await claim("laptop_found", "sara", {
    lostKey: "laptop_lost", ago: 1,
    message: "This is my laptop! I left it in the reading room on Tuesday.",
    proof: "The login screen shows the user name 'sara-h' and the serial number ends with 7Q2. There's a sticker near the touchpad.",
  });
  await claim("watch_found", "mehmet", {
    lostKey: "watch_lost", ago: 3,
    message: "I lost a Fossil watch in the mall, it was a gift from my father.",
    proof: "Engraving on the back says 'M.K. 2019'. The strap is two-tone silver and gold.",
    steps: [["under_review", "sara"], ["under_review", "sara", "Approved by the item's reporter, waiting for administrator verification"]],
    messages: [["sara", "The engraving matches. I've approved it, the admin needs to confirm because it's valuable."]],
  });
  await db.query("UPDATE claims SET owner_approved = 1 WHERE item_id = ? AND status = 'under_review'", [items.watch_found.id]);
  await claim("ring_found", "sara", {
    lostKey: "ring_lost", ago: 2,
    message: "I believe this is my ring, I took it off at the mall restroom.",
    proof: "Inscription inside reads 'S & K'. It has a small white stone.",
  });
  await claim("ring_found", "omar", {
    ago: 1,
    message: "That ring is mine, please send it to me.",
    proof: "It is a gold ring, I bought it last year.",
  });
  await db.query("UPDATE claims SET disputed = 1 WHERE item_id = ?", [items.ring_found.id]);
  await claim("wallet_found", "omar", {
    ago: 1,
    message: "Could this be my wallet?",
    proof: "It's a wallet with my cards inside.",
    steps: [["rejected", "ayse", "The wallet I found is black leather, not beige with a snakeskin pattern."]],
  });
  await claim("phone_found", "omar", {
    lostKey: "phone_lost", ago: 1,
    message: "That's my phone, I lost it this morning at the main square stop!",
    proof: "Lock screen wallpaper is a mountain lake, and there's a metro card in the case slot.",
    steps: [["under_review", "demo"]],
    messages: [["demo", "Hi Omar, the metro card is there. Can you tell me the colour of the metro card?"], ["omar", "It's a blue Karabük Kart."]],
  });

  // Responses on a few matches, a saved item and a spam flag.
  const wm = await matchOf("wallet_lost", "wallet_found");
  if (wm) await db.query("UPDATE matches SET found_response = 'yes' WHERE id = ?", [wm]);
  await db.query("INSERT INTO saved_items (user_id, item_id) VALUES (?, ?), (?, ?)", [users.demo, items.keychain_found.id, users.demo, items.camera2_found.id]);
  await db.query("INSERT INTO flags (reporter_id, target_type, target_id, reason, details) VALUES (?, 'item', ?, 'privacy', ?)", [users.sara, items.held.id, "The report has a phone number in it."]);
  await db.query("INSERT INTO flags (reporter_id, target_type, target_id, reason, details) VALUES (?, 'user', ?, 'scam', ?)", [users.mehmet, users.omar, "Claims items that don't match his own reports."]);

  await notify.sendAdmins("system", "admin_disputed", { n: 2, title: "Gold ring" }, "/admin/claims");
  const watchClaim = await db.one("SELECT id FROM claims WHERE item_id = ? AND status = 'under_review'", [items.watch_found.id]);
  await notify.sendAdmins("claim", "admin_valuable", { id: watchClaim.id, title: "Men's steel wristwatch" }, `/claims/${watchClaim.id}`);
  await db.query("INSERT INTO audit_log (actor_id, action, target_type, target_id, details) VALUES (?, 'demo.seed', NULL, NULL, ?)", [users.admin, JSON.stringify({ reports: REPORTS.length + 1 })]);

  const m = await db.one("SELECT COUNT(*) AS n FROM matches");
  console.log(`done: ${USERS.length} users, ${REPORTS.length + 1} reports, ${m.n} possible matches`);
  await db.pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await db.pool.end();
  process.exit(1);
});
