// Photo uploads: kept in memory by multer, checked by decoding them with sharp (the real
// file content decides, not the extension), then re-encoded to WebP. Re-encoding also
// drops EXIF metadata such as the GPS position where the photo was taken.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const sharp = require("sharp");
const config = require("./config");
const { fail } = require("./http");

fs.mkdirSync(config.uploadsDir, { recursive: true });

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

const memory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.limits.photoBytes, files: config.limits.photosPerReport, fields: 40 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "photos"));
    cb(null, true);
  },
});

function multerErrors(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const msg = {
      LIMIT_FILE_SIZE: `Each photo must be smaller than ${config.limits.photoBytes / 1024 / 1024} MB`,
      LIMIT_FILE_COUNT: `You can upload up to ${config.limits.photosPerReport} photos`,
      LIMIT_UNEXPECTED_FILE: "Only JPG, PNG or WebP photos are allowed",
    }[err.code] || "Upload failed";
    return next(Object.assign(new Error(msg), { status: 422, fields: { photos: msg } }));
  }
  next(err);
}

// Middleware factories: photos (several, for reports) and one photo (for search / suggestions).
const many = (field = "photos") => [memory.array(field, config.limits.photosPerReport), multerErrors];
const single = (field = "photo") => [memory.single(field), multerErrors];

async function inspect(buffer) {
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    fail(422, "One of the files is not a valid image", { photos: "One of the files is not a valid image" });
  }
  if (!ALLOWED_FORMATS.has(meta.format)) fail(422, "Only JPG, PNG or WebP photos are allowed", { photos: "Only JPG, PNG or WebP photos are allowed" });
  if (meta.width < 120 || meta.height < 120) fail(422, "Photos must be at least 120×120 pixels", { photos: "Photos must be at least 120×120 pixels" });
  return meta;
}

// Saves `<name>.webp` (max 1600px) and `<name>-thumb.webp` (480px). Returns the base name.
async function savePhoto(buffer) {
  await inspect(buffer);
  const name = crypto.randomBytes(12).toString("hex");
  const base = sharp(buffer).rotate();
  const full = await base.clone().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  await fs.promises.writeFile(path.join(config.uploadsDir, name + ".webp"), full.data);
  await base.clone().resize(480, 480, { fit: "cover", position: "attention" }).webp({ quality: 76 }).toFile(path.join(config.uploadsDir, name + "-thumb.webp"));
  return { filename: name, width: full.info.width, height: full.info.height, buffer: full.data };
}

async function deletePhoto(filename) {
  for (const f of [filename + ".webp", filename + "-thumb.webp", filename]) {
    if (!/^[a-zA-Z0-9._-]+$/.test(f)) continue;
    await fs.promises.unlink(path.join(config.uploadsDir, f)).catch(() => {});
  }
}

// Old reports (first version of the project) stored the original file name.
function photoUrls(filename) {
  if (/^[0-9a-f]{24}$/.test(filename)) return { url: `/uploads/${filename}.webp`, thumb: `/uploads/${filename}-thumb.webp` };
  return { url: `/uploads/${filename}`, thumb: `/uploads/${filename}` };
}

module.exports = { many, single, inspect, savePhoto, deletePhoto, photoUrls };
