import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "dist/index.html",
  "dist/styles.css",
  "dist/app.js",
  "dist/assets/business-license.jpg",
  "dist/assets/video-evidence-rules.jpg",
  "dist/assets/xiaowang-portrait.jpg",
  "dist/assets/xiaowang-yunyun-collaboration.jpg",
  "dist/assets/payment-wechat.jpg",
  "dist/assets/payment-alipay.png",
  "dist/assets/stock-demo-blue-front.svg",
  "dist/assets/stock-demo-blue-back.svg",
  "dist/assets/stock-demo-black-front.svg",
  "dist/assets/stock-demo-black-back.svg",
  "dist/assets/stock-demo-gold-front.svg",
  "dist/assets/stock-demo-gold-back.svg",
  "dist/assets/stock-demo-white-front.svg",
  "dist/assets/stock-demo-white-back.svg",
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

for (const requiredCopy of [
  "该内容正在测试，敬请期待后续开放。",
  "当前为前台效果测试，商品与图片均为虚拟演示内容，请勿据此付款。",
  "功能测试中，暂未开放购买。",
]) {
  if (!javascript.includes(requiredCopy)) {
    throw new Error(`The stock-phone test release is missing required copy: ${requiredCopy}`);
  }
}

if (!css.includes("grid-template-columns: repeat(3, minmax(0, 1fr))")) {
  throw new Error("The stock-phone detail gallery is not configured as a 3-column grid.");
}

console.log(`Production site verified: ${requiredFiles.length} required files are present.`);
