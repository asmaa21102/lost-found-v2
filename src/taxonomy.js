// Fixed categories and colors. Reports store the slug; the client gets labels and
// icons from /api/meta, and the AI uses `prompt` for zero-shot photo suggestions.
const CATEGORIES = [
  { slug: "phone", label: "Phone", icon: "smartphone", prompt: "a mobile phone", words: ["phone", "smartphone", "iphone", "mobile", "samsung", "telefon", "cellphone"] },
  { slug: "wallet", label: "Wallet & purse", icon: "wallet", prompt: "a wallet", words: ["wallet", "purse", "cuzdan", "cardholder"] },
  { slug: "keys", label: "Keys", icon: "key-round", prompt: "a bunch of keys on a keyring", words: ["key", "keys", "keychain", "keyring", "anahtar"] },
  { slug: "bag", label: "Bags & backpacks", icon: "backpack", prompt: "a backpack or bag", words: ["bag", "backpack", "rucksack", "handbag", "canta", "tote"] },
  { slug: "laptop", label: "Laptops & tablets", icon: "laptop", prompt: "a laptop computer", words: ["laptop", "notebook computer", "macbook", "tablet", "ipad", "computer"] },
  { slug: "audio", label: "Headphones & earbuds", icon: "headphones", prompt: "headphones or wireless earbuds", words: ["headphones", "earbuds", "airpods", "earphones", "headset", "kulaklik"] },
  { slug: "electronics", label: "Other electronics", icon: "cpu", prompt: "an electronic gadget", words: ["charger", "usb", "flash drive", "camera", "calculator", "powerbank", "cable"] },
  { slug: "glasses", label: "Glasses", icon: "glasses", prompt: "a pair of glasses or sunglasses", words: ["glasses", "sunglasses", "spectacles", "eyeglasses", "gozluk"] },
  { slug: "watch", label: "Watches", icon: "watch", prompt: "a wristwatch", words: ["watch", "wristwatch", "smartwatch", "saat"] },
  { slug: "jewelry", label: "Jewelry", icon: "gem", prompt: "a ring or jewelry", words: ["ring", "necklace", "bracelet", "earring", "jewelry", "gold", "yuzuk"] },
  { slug: "documents", label: "IDs & documents", icon: "id-card", prompt: "an ID card, badge or document", words: ["id", "card", "passport", "license", "document", "badge", "lanyard", "kimlik"] },
  { slug: "clothing", label: "Clothing", icon: "shirt", prompt: "a piece of clothing such as a jacket or scarf", words: ["jacket", "coat", "scarf", "hat", "sweater", "hoodie", "raincoat", "glove", "mont"] },
  { slug: "books", label: "Books & notebooks", icon: "book-open", prompt: "a book or notebook", words: ["book", "notebook", "textbook", "kitap", "defter", "folder"] },
  { slug: "bottle", label: "Bottles & cups", icon: "cup-soda", prompt: "a water bottle", words: ["bottle", "thermos", "flask", "cup", "tumbler", "matara"] },
  { slug: "umbrella", label: "Umbrellas", icon: "umbrella", prompt: "an umbrella", words: ["umbrella", "semsiye"] },
  { slug: "toys", label: "Toys", icon: "toy-brick", prompt: "a child's toy or teddy bear", words: ["toy", "teddy", "doll", "plush", "oyuncak"] },
  { slug: "sports", label: "Sports & bikes", icon: "bike", prompt: "a bicycle or sports equipment", words: ["bike", "bicycle", "ball", "racket", "helmet", "scooter"] },
  { slug: "other", label: "Other", icon: "package", prompt: null, words: [] },
];

const COLORS = [
  { slug: "black", label: "Black", hex: "#1f2025", family: "dark" },
  { slug: "white", label: "White", hex: "#f5f5f4", family: "light" },
  { slug: "grey", label: "Grey", hex: "#8b8f98", family: "neutral" },
  { slug: "silver", label: "Silver", hex: "#c4c8cf", family: "neutral" },
  { slug: "gold", label: "Gold", hex: "#d4a64a", family: "warm" },
  { slug: "brown", label: "Brown", hex: "#8a5a3b", family: "warm" },
  { slug: "beige", label: "Beige", hex: "#d9c3a0", family: "light" },
  { slug: "red", label: "Red", hex: "#d64545", family: "warm" },
  { slug: "orange", label: "Orange", hex: "#e8853a", family: "warm" },
  { slug: "yellow", label: "Yellow", hex: "#e9c949", family: "warm" },
  { slug: "green", label: "Green", hex: "#3f9b6b", family: "cool" },
  { slug: "blue", label: "Blue", hex: "#3d7fd9", family: "cool" },
  { slug: "navy", label: "Navy", hex: "#22336b", family: "dark" },
  { slug: "purple", label: "Purple", hex: "#8b5cf6", family: "cool" },
  { slug: "pink", label: "Pink", hex: "#e879a8", family: "warm" },
  { slug: "multicolor", label: "Multicolor", hex: "conic", family: "any" },
  { slug: "transparent", label: "Transparent", hex: "clear", family: "light" },
];

// Pairs that people often mix up when describing an object.
const SIMILAR_COLORS = [
  ["black", "navy"], ["black", "grey"], ["grey", "silver"], ["white", "silver"], ["white", "beige"],
  ["brown", "beige"], ["gold", "yellow"], ["red", "pink"], ["red", "orange"], ["blue", "navy"],
  ["purple", "pink"], ["purple", "blue"], ["green", "blue"], ["transparent", "white"],
];

const CATEGORY_SLUGS = new Set(CATEGORIES.map((c) => c.slug));
const COLOR_SLUGS = new Set(COLORS.map((c) => c.slug));

const ascii = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .trim();

function normalizeCategory(value) {
  const v = ascii(value);
  if (!v) return "other";
  if (CATEGORY_SLUGS.has(v)) return v;
  const hit = CATEGORIES.find((c) => c.words.some((w) => v.includes(w)) || ascii(c.label).includes(v));
  return hit ? hit.slug : "other";
}

function normalizeColor(value) {
  const v = ascii(value);
  if (!v) return null;
  if (COLOR_SLUGS.has(v)) return v;
  const aliases = { gray: "grey", siyah: "black", beyaz: "white", kahverengi: "brown", kirmizi: "red", mavi: "blue", yesil: "green", sari: "yellow", pembe: "pink", mor: "purple", gri: "grey", lacivert: "navy", clear: "transparent" };
  if (aliases[v]) return aliases[v];
  const hit = COLORS.find((c) => v.includes(c.slug));
  return hit ? hit.slug : null;
}

function colorRelation(a, b) {
  if (!a || !b) return null;
  if (a === b) return "same";
  if (a === "multicolor" || b === "multicolor") return "similar";
  return SIMILAR_COLORS.some(([x, y]) => (x === a && y === b) || (x === b && y === a)) ? "similar" : "different";
}

const categoryLabel = (slug) => CATEGORIES.find((c) => c.slug === slug)?.label || "Other";
const colorLabel = (slug) => COLORS.find((c) => c.slug === slug)?.label || slug;

module.exports = {
  CATEGORIES, COLORS, CATEGORY_SLUGS, COLOR_SLUGS,
  normalizeCategory, normalizeColor, colorRelation, categoryLabel, colorLabel, ascii,
};
