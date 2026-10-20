import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";

test("배포 산출물의 참조 경로가 존재하며 API·서버·환경변수 파일은 공개되지 않음", async () => {
  const result = spawnSync(process.execPath, ["scripts/build.mjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(await readFile("vercel.json", "utf8"));
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const output = config.outputDirectory;
  const html = await readFile(`${output}/index.html`, "utf8");
  const client = await readFile(`${output}/app.js`, "utf8");
  const adapter = await readFile(`${output}/services/insurance-service.js`, "utf8");
  const paths = [
    ...[...html.matchAll(/(?:src|href)="(\/[^"#]+)"/g)].map((match) => match[1]),
    ...[...adapter.matchAll(/fetchImpl\("(\/[^"]+)"/g)].map((match) => match[1]),
    "/services/insurance-service.js"
  ];
  for (const path of new Set(paths)) {
    assert.equal((await stat(`${output}${path}`)).isFile(), true, `정적 경로 누락: ${path}`);
  }
  assert.match(client, /fetch\("\/api\/explain"/);
  assert.equal((await stat("api/explain.js")).isFile(), true);
  assert.equal((await stat(config.functions["api/explain.js"].includeFiles)).isFile(), true);
  assert.equal(pkg.type, "module");
  assert.ok(pkg.dependencies.openai);
  assert.equal(config.buildCommand, "npm run build");
  assert.equal(config.rewrites, undefined);
  assert.equal(config.routes, undefined);
  const publicFiles = await readdir(output, { recursive: true });
  assert.ok(!publicFiles.some((file) => /(^|\/)(api|server|node_modules|\.env[^/]*)(\/|$)/.test(file)));
});

test("실제 API 진입점과 SDK import 성공, GET=405 및 키 미설정 POST=503", async () => {
  const { default: handler } = await import("../api/explain.js");
  const results = [];
  const res = {
    setHeader() {},
    status(status) { results.push({ status }); return res; },
    json(body) { results.at(-1).body = body; }
  };
  await handler({ method: "GET" }, res);
  assert.equal(results.at(-1).status, 405);
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await handler({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { coverageId: "demo-cancer" }
    }, res);
    assert.equal(results.at(-1).status, 503);
    assert.equal(results.at(-1).body.error, "AI_UNAVAILABLE");
  } finally {
    if (previousKey !== undefined) process.env.OPENAI_API_KEY = previousKey;
  }
});
