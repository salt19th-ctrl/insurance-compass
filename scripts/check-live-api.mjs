// 명시적으로 실행할 때만 배포된 API에 1회 요청합니다. 성공 시 비용이 발생합니다.
const target = process.argv[2];
if (!target) {
  console.error("사용법: npm run test:api -- https://본인-배포주소.vercel.app");
  process.exit(1);
}
const url = new URL("/api/explain", target);
if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
  throw new Error("원격 API 확인에는 HTTPS 주소를 사용하세요.");
}
const response = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ coverageId: "demo-cancer" }),
  signal: AbortSignal.timeout(55000)
});
const data = await response.json().catch(() => ({}));
if (!response.ok || !["simple", "caution", "check"].every((key) => typeof data.explanation?.[key] === "string" && data.explanation[key].trim())) {
  console.error(`API 확인 실패: HTTP ${response.status}, 코드 ${data.error || "UNKNOWN"} (Vercel 배포 보호 여부도 확인)`);
  process.exit(1);
}
console.log(`API 확인 성공: HTTP ${response.status}, 모델 ${data.model}, 세 가지 설명 항목 확인`);
console.log(JSON.stringify(data.explanation, null, 2));
