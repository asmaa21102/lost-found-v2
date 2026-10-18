// Downloads the freely licensed Wikimedia Commons photos used by the demo data.
// The files are picked by hand so a lost report and a found report can show the same
// kind of object in different pictures. Author and license go to demo/photos/CREDITS.json.
//   node scripts/fetch-demo-photos.js
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "demo", "photos");
const UA = "LostFoundDemo/2.0 (portfolio demo data; local use)";

const PHOTOS = {
  wallet: ["Aarong leather wallet.jpg", "Wallet (AM 2018.22.7-3).jpg", "Python skin wallet, closed, 2015-03-18.jpg"],
  keys: ["Various keys on keyring.jpg", "Key chain 4.jpg", "Door key from lock type BKS Janus on keyring from company O&K (Orenstein & Koppel).jpg"],
  backpack: ["School bag backpack.jpg", "Plecak Hiker 50 L HiMountain.jpg"],
  smartphone: ["Blackview A60 Smartphone Android mobile phone back face.jpg", "Blackview A60 Smartphone Android mobile phone and folio case.jpg", "Apple IPhone 2024.jpg"],
  earbuds: ["Fifth-generation AirPods in their charging case.jpg", "Earbuds with UKCA marking.jpg", "Technics-EAH-AZ60M2 09.jpg"],
  glasses: ["Eyeglasses (AM 71518-7).jpg", "Eyeglasses (AM 71518-6).jpg"],
  sunglasses: ["Pair of sunglasses lens down.jpg", "Mezmay, Sports sunglasses, Black sunglasses, Russia.jpg", "Sunglasses on ground outside Varnado Hall.jpg"],
  umbrella: ["Closeup of black umbrella in rain.jpg", "Black umbrella splashing in the garden.jpg"],
  bottle: ["Stainless Steel Water Bottle.jpg", "Niksun stainless steel water bottle.jpg", "Stainless steel water bottle.jpg"],
  lanyard: ["Lanyard (3379981636) (4).jpg", "WMDE-Give-Aways Lanyard mit Wikipedia-Logo.jpg"],
  watch: ["Fossil wristwatch with white background.jpg", "Montinari Milano.jpg", "Self-winding wristwatch (transparent backside).jpg"],
  laptop: ["Dell Latitude E6410 laptop with Kiwix.jpg", "Lenovo G500s laptop-2903.jpg", "Lenovo G500s laptop-2905.jpg"],
  headphones: ["JLab Studio Black Headphones.jpg", "Black brown headphones wired.jpg", "Headphones on desk.jpg"],
  teddy: ["Teddy bear - lost in the grass.JPG", "Teddy bear on the window sill 02.jpg", "Antique teddy bear toy.jpg"],
  scarf: ["Purple heather pure wool infinity scarf.jpg", "Ralph Lauren wool scarf.jpg", "Alpaca wool scarf.JPG"],
  camera: ["Pentax Optio S50.jpg", "PentaxOptioS50.JPG", "12 MP digital camera - red.jpg"],
  notebook: ["Spiral notebook (2565673891).jpg", "Spiral-bound notebooks.JPG"],
  usb: ["Kingston Technology DataTraveler G4 USB flash drive USB 3.0 32 Gb.jpg", "SanDisk-Cruzer-USB-4GB-ThumbDrive.jpg"],
  calculator: ["Casio fx-991MS.jpg", "Sharp Scientific Calculator.jpg"],
  ring: ["Gold Ring on Red.jpg", "Gold Ring 2.jpg"],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (html) => (html || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

async function get(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status !== 429) return res;
    await sleep(5000 * (attempt + 1));
  }
  throw new Error("Rate limited: " + url);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const creditsFile = path.join(OUT, "CREDITS.json");
  const credits = fs.existsSync(creditsFile) ? JSON.parse(fs.readFileSync(creditsFile, "utf8")) : {};

  for (const [key, titles] of Object.entries(PHOTOS)) {
    for (const [i, title] of titles.entries()) {
      const file = `${key}-${i + 1}.jpg`;
      if (credits[file]?.title === "File:" + title && fs.existsSync(path.join(OUT, file))) continue;

      const api = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({
        format: "json", action: "query", titles: "File:" + title,
        prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "800",
      });
      const page = Object.values((await (await get(api)).json()).query.pages)[0];
      const info = page.imageinfo?.[0];
      if (!info) { console.log("! missing", title); continue; }

      const img = await get(info.thumburl);
      if (!img.ok) { console.log("! download failed", title, img.status); continue; }
      fs.writeFileSync(path.join(OUT, file), Buffer.from(await img.arrayBuffer()));

      const meta = info.extmetadata || {};
      credits[file] = {
        title: page.title,
        author: strip(meta.Artist?.value) || "Unknown",
        license: strip(meta.LicenseShortName?.value),
        source: info.descriptionurl,
      };
      fs.writeFileSync(creditsFile, JSON.stringify(credits, null, 2));
      console.log("✓", file);
      await sleep(2500);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
