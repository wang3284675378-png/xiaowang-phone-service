import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "dist/index.html",
  "dist/styles.css",
  "dist/app.js",
  "dist/assets/business-license.jpg",
  "dist/assets/video-evidence-rules.jpg",
  "dist/assets/xiaowang-portrait.jpg",
  "dist/assets/xiaowang-yunyun-collaboration.jpg",
];

await Promise.all(requiredFiles.map((file) => access(file)));

const [html, css, javascript] = await Promise.all([
  readFile("dist/index.html", "utf8"),
  readFile("dist/styles.css", "utf8"),
  readFile("dist/app.js", "utf8"),
]);

for (const [name, source] of Object.entries({ html, css, javascript })) {
  if (/\b(?:src|href)=["']\/(?!\/)/i.test(source)) {
    throw new Error(`${name} contains a root-relative asset path that would break on GitHub Pages.`);
  }
}

if (!html.includes("./styles.css") || !html.includes("./app.js")) {
  throw new Error("The production entry page is missing its stylesheet or JavaScript reference.");
}

console.log(`Production site verified: ${requiredFiles.length} required files are present.`);
