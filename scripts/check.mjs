import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { validateInsuranceData } from "../services/insurance-service.js";

const files = ["app.js", "api/explain.js", "server/explanation-service.js", "services/insurance-service.js", "playwright.config.js"];
for (const dir of ["scripts", "tests"]) {
  files.push(...(await readdir(dir)).filter((f) => /\.(js|mjs)$/.test(f)).map((f) => `${dir}/${f}`));
}
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${file}\n${result.stderr}`);
}
const contracts = validateInsuranceData(JSON.parse(await readFile("data/sample-insurance.json", "utf8")));
for (const path of ["package.json", "vercel.json"]) JSON.parse(await readFile(path, "utf8"));
for (const file of ["index.html", "app.js", "style.css", "services/insurance-service.js", "data/sample-insurance.json"]) {
  const content = await readFile(file, "utf8");
  if (/OPENAI_API_KEY|sk-[A-Za-z0-9]{16,}/.test(content)) throw new Error(`공개 파일 키 참조 확인 필요: ${file}`);
}
console.log(`문법·JSON·데이터 계약·공개 파일 키 검사 통과 (${files.length}개 JS 파일, ${contracts.length}개 계약)`);
