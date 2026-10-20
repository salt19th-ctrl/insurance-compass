import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

// 화면 미리보기 전용 정적 서버입니다. /api/explain을 실행하지 않습니다.
const allowed = new Set(["/index.html", "/style.css", "/app.js", "/assets/compass.svg", "/services/insurance-service.js", "/data/sample-insurance.json"]);
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml" };
const port = Number(process.env.PORT || 4173);
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const file = pathname === "/" ? "/index.html" : pathname;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (pathname === "/api/explain") {
    res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ error: "STATIC_PREVIEW_ONLY" }));
  }
  if (!allowed.has(file) || !["GET", "HEAD"].includes(req.method)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("요청한 페이지를 찾을 수 없습니다.");
  }
  try {
    const data = await readFile(resolve(`.${file}`));
    res.writeHead(200, { "Content-Type": `${types[extname(file)]}; charset=utf-8` });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("요청한 페이지를 찾을 수 없습니다.");
  }
});
server.listen(port, "127.0.0.1", () => console.log(`화면 미리보기: http://127.0.0.1:${port}\nAI API는 Vercel 환경에서 확인하세요.`));
