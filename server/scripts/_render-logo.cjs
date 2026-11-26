const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const pub = path.resolve(__dirname, "..", "..", "frontend", "public");

const jobs = [
  ["logo.svg", "logo-512.png", 512, 512],
  ["logo.svg", "logo-192.png", 192, 192],
  ["favicon.svg", "favicon-64.png", 64, 64],
  ["favicon.svg", "apple-touch-icon.png", 180, 180],
  ["logo-mono.svg", "logo-mono-512.png", 512, 512],
  ["logo-mono.svg", "logo-mono-256.png", 256, 256],
];

(async () => {
  for (const [src, out, w, h] of jobs) {
    await sharp(fs.readFileSync(path.join(pub, src)), { density: 384 })
      .resize(w, h, { fit: "contain", background: { r: 8, g: 6, b: 13, alpha: 1 } })
      .png({ compressionLevel: 9 })
      .toFile(path.join(pub, out));
    console.log("OK", out, w + "x" + h);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
