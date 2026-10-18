import { access, readFile, readdir } from "node:fs/promises";

const requiredFiles = [
  "dist/index.html",
  "dist/styles.css",
  "dist/app.js",
  "dist/favicon.svg",
  "dist/supabase-config.js",
  "dist/supabase-client.js",
  "dist/admin/index.html",
  "dist/admin/admin.css",
  "dist/admin/admin.js",
  "supabase/schema.sql",
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

const [html, css, javascript, adminHtml, adminJavascript, supabaseClient, supabaseConfig, supabaseSchema] = await Promise.all([
  readFile("dist/index.html", "utf8"),
  readFile("dist/styles.css", "utf8"),
  readFile("dist/app.js", "utf8"),
  readFile("dist/admin/index.html", "utf8"),
  readFile("dist/admin/admin.js", "utf8"),
  readFile("dist/supabase-client.js", "utf8"),
  readFile("dist/supabase-config.js", "utf8"),
  readFile("supabase/schema.sql", "utf8"),
]);

for (const [name, source] of Object.entries({ html, css, javascript })) {
  if (/\b(?:src|href)=["']\/(?!\/)/i.test(source)) {
    throw new Error(`${name} contains a root-relative asset path that would break on GitHub Pages.`);
  }
}

if (!html.includes("./styles.css") || !html.includes("./app.js") || !html.includes("./supabase-client.js")) {
  throw new Error("The production entry page is missing its stylesheet or JavaScript reference.");
}

if (!adminHtml.includes("./admin.css") || !adminHtml.includes("./admin.js") || !adminHtml.includes("../supabase-client.js")) {
  throw new Error("The admin entry page is missing required assets.");
}

const browserBundle = [html, javascript, adminHtml, adminJavascript, supabaseClient, supabaseConfig].join("\n");
for (const forbidden of [
  /sb_secret_[a-z0-9._-]+/i,
  /\bsbp_[a-z0-9._-]{20,}/i,
  /github_pat_[a-z0-9_]+/i,
  /gh[pousr]_[a-z0-9]{20,}/i,
  /postgres(?:ql)?:\/\/[^\s"']+/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
]) {
  if (forbidden.test(browserBundle)) throw new Error("A private credential pattern was found in browser code.");
}

if (!/sb_publishable_[a-z0-9_-]+/i.test(supabaseConfig)) {
  throw new Error("The browser configuration must use a Supabase publishable key.");
}

if (!html.includes("Content-Security-Policy") || !adminHtml.includes("Content-Security-Policy")) {
  throw new Error("The public or admin page is missing its Content Security Policy.");
}

if (supabaseClient.includes("localStorage.setItem(sessionKey")) {
  throw new Error("Admin access tokens must not persist in localStorage.");
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return nested.flat();
}

const distFiles = await listFiles("dist");
if (distFiles.some(file => file.endsWith(".map"))) {
  throw new Error("Production source maps must not be published.");
}

for (const requiredSecurityRule of [
  "alter table public.stock_products enable row level security",
  "public can read visible stock",
  "admins can insert stock",
  "admins can update stock",
  "admins can delete stock",
  "admins can upload stock images",
  "27fba96f-7f0d-43b3-be5a-b4128385f6e6",
  "stock_products_write_rate_limit",
  "stock_product_versions",
  "file_size_limit",
  "allowed_mime_types",
]) {
  if (!supabaseSchema.includes(requiredSecurityRule)) {
    throw new Error(`Supabase schema is missing required security rule: ${requiredSecurityRule}`);
  }
}

for (const uploadFeature of ["prepareImage", "mapWithConcurrency", "uploadProgress", "onProgress", "retries: 2"]) {
  if (!adminJavascript.includes(uploadFeature) && !supabaseClient.includes(uploadFeature)) {
    throw new Error(`The optimized upload flow is missing: ${uploadFeature}`);
  }
}

for (const requiredCopy of [
  "该内容正在测试，敬请期待后续开放。",
  "当前为前台效果测试，商品与图片均为虚拟演示内容，请勿据此付款。",
  "演示商品，暂不可购买",
  "我要购买",
]) {
  if (!javascript.includes(requiredCopy)) {
    throw new Error(`The stock-phone test release is missing required copy: ${requiredCopy}`);
  }
}

if (!css.includes("grid-template-columns: repeat(3, minmax(0, 1fr))")) {
  throw new Error("The stock-phone detail gallery is not configured as a 3-column grid.");
}

console.log(`Production site verified: ${requiredFiles.length} required files are present.`);
