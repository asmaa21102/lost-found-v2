// Photo understanding with CLIP (runs locally through transformers.js / ONNX, no API key).
// - embedImage(): a 512-number vector per photo, stored with the photo, used for photo
//   search and as one signal in smart matching.
// - suggest(): zero-shot guess of category and color from a photo, shown as suggestions
//   on the report form (the user always decides).
// - embedText(): English text → same vector space, used to boost relevance search.
const sharp = require("sharp");
const config = require("./config");
const { CATEGORIES, COLORS } = require("./taxonomy");

const DIM = 512;
const state = { status: config.ai.enabled ? "idle" : "disabled", error: null, loadedAt: null };
let loading = null;
let models = null;

async function load() {
  const t = await import("@huggingface/transformers");
  t.env.cacheDir = config.ai.cacheDir;
  const id = config.ai.model;
  const [processor, vision, tokenizer, text] = await Promise.all([
    t.AutoProcessor.from_pretrained(id),
    t.CLIPVisionModelWithProjection.from_pretrained(id, { dtype: "q8" }),
    t.AutoTokenizer.from_pretrained(id),
    t.CLIPTextModelWithProjection.from_pretrained(id, { dtype: "q8" }),
  ]);
  models = { t, processor, vision, tokenizer, text };

  // Label vectors for zero-shot suggestions, computed once.
  const cats = CATEGORIES.filter((c) => c.prompt);
  models.categoryLabels = cats.map((c) => c.slug);
  models.categoryVecs = await embedTexts(cats.map((c) => `a photo of ${c.prompt}`));
  const colors = COLORS.filter((c) => c.slug !== "multicolor");
  models.colorLabels = colors.map((c) => c.slug);
  models.colorVecs = await embedTexts(colors.map((c) => `a photo of a ${c.label.toLowerCase()} colored object`));
}

function init() {
  if (!config.ai.enabled) return Promise.reject(new Error("AI is disabled"));
  if (!loading) {
    state.status = "loading";
    loading = load()
      .then(() => {
        state.status = "ready";
        state.loadedAt = new Date().toISOString();
      })
      .catch((err) => {
        state.status = "error";
        state.error = err.message;
        loading = null;
        throw err;
      });
  }
  return loading;
}

const isReady = () => state.status === "ready";

function normalize(arr) {
  let n = 0;
  for (const x of arr) n += x * x;
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = arr[i] / n;
  return out;
}

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

async function embedImage(buffer) {
  await init();
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize(336, 336, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const image = new models.t.RawImage(new Uint8ClampedArray(data), info.width, info.height, 3);
  const inputs = await models.processor(image);
  const { image_embeds } = await models.vision(inputs);
  return normalize(image_embeds.data);
}

async function embedTexts(texts) {
  const inputs = models.tokenizer(texts, { padding: true, truncation: true });
  const { text_embeds } = await models.text(inputs);
  return texts.map((_, i) => normalize(text_embeds.data.slice(i * DIM, (i + 1) * DIM)));
}

async function embedText(text) {
  await init();
  return (await embedTexts([text]))[0];
}

function softmaxTop(vec, labelVecs, labels, k) {
  const logits = labelVecs.map((v) => 100 * dot(vec, v));
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return labels
    .map((label, i) => ({ value: label, confidence: exps[i] / sum }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, k);
}

// Suggestions only: returned with a confidence so the UI can phrase them as guesses.
function suggestFromVector(vec) {
  return {
    categories: softmaxTop(vec, models.categoryVecs, models.categoryLabels, 3),
    colors: softmaxTop(vec, models.colorVecs, models.colorLabels, 3),
  };
}

const toBuffer = (vec) => Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
const fromBuffer = (buf) =>
  buf && buf.length === DIM * 4 ? new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)) : null;

// CLIP image↔image cosine for the same kind of object is usually 0.75–0.95; unrelated
// photos sit around 0.4–0.65. This maps that range to a 0–1 "looks alike" signal.
const visualSimilarity = (cos) => Math.max(0, Math.min(1, (cos - 0.62) / (0.92 - 0.62)));

module.exports = {
  init, isReady, state, embedImage, embedText, suggestFromVector,
  dot, toBuffer, fromBuffer, visualSimilarity, DIM,
};
