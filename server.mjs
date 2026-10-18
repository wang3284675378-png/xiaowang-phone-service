import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), 'dist');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
    const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    let file = join(root, safePath === '/' ? 'index.html' : safePath);
    const fileStat = await stat(file);
    if (fileStat.isDirectory() && !pathname.endsWith('/')) {
      res.writeHead(301, { Location: `${pathname}/` });
      res.end();
      return;
    }
    if (fileStat.isDirectory()) file = join(file, 'index.html');
    else if (!fileStat.isFile()) file = join(root, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('未找到页面');
  }
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
