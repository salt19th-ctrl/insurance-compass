import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
const sample = JSON.parse(readFileSync("data/sample-insurance.json", "utf8"));
async function load(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "내 보험 조회", exact: false }).click();
  await expect(page.locator(".coverage-card")).toHaveCount(10);
}

test("조회·6개 필터·보기 전환·요약표·누락 정보", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await load(page);
  await expect(page.locator("#contract-count")).toHaveText("4건");
  await expect(page.locator("#coverage-results .contract-section")).toHaveCount(4);
  for (const [name, count] of [["암", 2], ["뇌질환", 3], ["심장질환", 2], ["수술", 1], ["입원", 1], ["상해", 1]]) {
    await page.getByRole("button", { name: `${name} 보장 필터`, exact: true }).click();
    await expect(page.locator(".coverage-card")).toHaveCount(count);
  }
  await expect(page.locator(".card-facts .amount")).toContainText("확인 필요");
  await page.getByRole("button", { name: "전체 보장 필터", exact: true }).click();
  await page.getByRole("button", { name: "보장별 보기" }).click();
  await expect(page.locator("#coverage-results .contract-section")).toHaveCount(6);
  await expect(page.locator(".coverage-card")).toHaveCount(10);
  await page.locator(".summary-table-box summary").click();
  await expect(page.locator("#summary-rows tr")).toHaveCount(10);
  await page.locator(".coverage-details summary").first().click();
  await expect(page.locator(".coverage-details").first()).toContainText("면책기간");
  await page.getByRole("button", { name: "보험별 보기" }).click();
  await expect(page.locator("#coverage-results .contract-section")).toHaveCount(4);
  await page.screenshot({ path: testInfo.outputPath("desktop.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("글씨 확대·축소·저장 및 모바일 가로 넘침 없음", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await load(page);
  await page.getByRole("button", { name: "글씨 확대" }).click();
  await page.getByRole("button", { name: "글씨 확대" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-font", "largest");
  await expect(page.getByRole("button", { name: "글씨 확대" })).toBeDisabled();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-font", "largest");
  await page.getByRole("button", { name: "내 보험 조회" }).click();
  await expect(page.locator(".coverage-card")).toHaveCount(10);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "글씨 축소" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-font", "large");
  await page.screenshot({ path: testInfo.outputPath("mobile.png"), fullPage: true });
});

test("조회 실패 후 재시도·빈 데이터·필터 결과 없음", async ({ page }) => {
  await page.route("**/data/sample-insurance.json", (route) => route.fulfill({ status: 500, body: "{}" }));
  await page.goto("/");
  await page.locator("#load-insurance").click();
  await expect(page.locator("#load-status")).toContainText("조회하지 못했습니다");
  await page.unroute("**/data/sample-insurance.json");
  await page.locator("#load-insurance").click();
  await expect(page.locator(".coverage-card")).toHaveCount(10);
  await page.route("**/data/sample-insurance.json", (route) => route.fulfill({ json: { isDemo: true, contracts: [] } }));
  await page.locator("#load-insurance").click();
  await expect(page.locator("#contract-count")).toHaveText("0건");
  await expect(page.locator("#coverage-results")).toContainText("보장이 없다는 뜻은 아닙니다");
  await page.unroute("**/data/sample-insurance.json");
  await page.route("**/data/sample-insurance.json", (route) => route.fulfill({
    json: { ...sample, contracts: [{ ...sample.contracts[0], coverages: [sample.contracts[0].coverages[0]] }] }
  }));
  await page.locator("#load-insurance").click();
  await page.getByRole("button", { name: "상해 보장 필터" }).click();
  await expect(page.locator("#coverage-results")).toContainText("확인이 필요합니다");
});

test("조회 중 중복 클릭 방지", async ({ page }) => {
  let requests = 0;
  await page.route("**/data/sample-insurance.json", async (route) => {
    requests++;
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({ json: sample });
  });
  await page.goto("/");
  await page.locator("#load-insurance").evaluate((button) => { button.click(); button.click(); button.click(); });
  await expect(page.locator("#load-insurance")).toBeDisabled();
  await expect(page.locator(".coverage-card")).toHaveCount(10);
  expect(requests).toBe(1);
});

test("AI 성공 모의 응답·ID만 전송·중복 요청 방지·보기 전환 시 유지·텍스트로 출력", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/explain", async (route) => {
    requests++;
    expect(route.request().postDataJSON()).toEqual({ coverageId: "demo-cancer" });
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({ json: { explanation: { simple: "쉬운 한국어 설명입니다.", caution: "<img src=x onerror=alert(1)>", check: "약관을 확인하세요." } } });
  });
  await load(page);
  const card = page.locator('[data-coverage-id="demo-cancer"]');
  await card.locator(".ai-button").evaluate((b) => { b.click(); b.click(); });
  await expect(card.locator(".ai-output")).toContainText("쉽게 설명하면");
  await expect(card.locator(".ai-output")).toContainText("보장 시 주의할 점");
  await expect(card.locator(".ai-output")).toContainText("약관에서 확인할 사항");
  await expect(card.locator(".ai-output img")).toHaveCount(0);
  await page.getByRole("button", { name: "보장별 보기" }).click();
  await expect(card.locator(".ai-output")).toContainText("쉬운 한국어 설명입니다.");
  expect(requests).toBe(1);
});

test("AI 미설정·호출 제한·비정상 응답에도 기본 설명 유지", async ({ page }) => {
  for (const status of [404, 503, 504, 429, 502, 200]) {
    await page.route("**/api/explain", (route) => route.fulfill({ status, json: {} }));
    await load(page);
    const card = page.locator(".coverage-card").first();
    await card.locator(".ai-button").click();
    await expect(card.locator(".ai-output")).toContainText("기본 쉬운 설명은 계속 이용할 수 있습니다");
    await expect(card.locator(".basic-explanation")).toContainText("일반암");
    await page.unroute("**/api/explain");
  }
});

test("UI의 한국어 문구·정적 자원 HTTP 경로·미리보기 API 오류", async ({ page, request }) => {
  for (const path of ["/", "/style.css", "/app.js", "/services/insurance-service.js", "/data/sample-insurance.json", "/assets/compass.svg"]) {
    expect((await request.get(path)).status()).toBe(200);
  }
  for (const path of ["/api/explain.js", "/server/explanation-service.js", "/.env", "/missing"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(await response.text()).toBe("요청한 페이지를 찾을 수 없습니다.");
  }
  // 프리뷰 서버의 503을 실제 HTTP로 확인하며 Vercel Function 실행과는 구분합니다.
  expect((await request.post("/api/explain", { data: { coverageId: "demo-cancer" } })).status()).toBe(503);
  await load(page);
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/[\u3040-\u30ff]/u);
  expect(text.match(/[A-Za-z]+/g)?.filter((word) => word !== "AI") || []).toEqual([]);
  await page.locator(".ai-button").first().click();
  await expect(page.locator(".ai-output").first()).toContainText("기본 쉬운 설명은 계속 이용할 수 있습니다");
});

test("통신 단절·JSON이 아닌 API 오류에도 기본 설명 유지", async ({ page }) => {
  await page.route("**/api/explain", (route) => route.abort("failed"));
  await load(page);
  await page.locator(".ai-button").first().click();
  await expect(page.locator(".ai-output").first()).toContainText("AI 연결을 확인하지 못했습니다");
  await expect(page.locator(".basic-explanation").first()).toContainText("일반암");
  await page.unroute("**/api/explain");
  await page.route("**/api/explain", (route) => route.fulfill({ status: 404, contentType: "text/html", body: "<h1>Not found</h1>" }));
  await load(page);
  await page.locator(".ai-button").first().click();
  await expect(page.locator(".ai-output").first()).toContainText("기본 쉬운 설명은 계속 이용할 수 있습니다");
  await expect(page.locator(".ai-output").first()).not.toContainText("Not found");
});

test("조회 및 AI 요청의 브라우저 타임아웃 처리", async ({ page }) => {
  await page.clock.install();
  let release;
  let started;
  const requestStarted = new Promise((resolve) => { started = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  await page.route("**/data/sample-insurance.json", async (route) => {
    started();
    await blocked;
    await route.fulfill({ json: sample }).catch(() => {});
  });
  await page.goto("/");
  await page.locator("#load-insurance").click();
  await requestStarted;
  await page.clock.fastForward(10001);
  await expect(page.locator("#load-status")).toContainText("조회하지 못했습니다");
  await expect(page.locator("#load-insurance")).toBeEnabled();
  release();
  await page.unrouteAll({ behavior: "wait" });
  await page.locator("#load-insurance").click();
  await expect(page.locator(".coverage-card")).toHaveCount(10);
  let releaseAi;
  let aiStarted;
  const aiRequestStarted = new Promise((resolve) => { aiStarted = resolve; });
  const aiBlocked = new Promise((resolve) => { releaseAi = resolve; });
  await page.route("**/api/explain", async (route) => {
    aiStarted();
    await aiBlocked;
    await route.fulfill({ status: 503, json: {} }).catch(() => {});
  });
  await page.locator(".ai-button").first().click();
  await aiRequestStarted;
  await page.clock.fastForward(50001);
  await expect(page.locator(".ai-output").first()).toContainText("AI 응답 시간이 길어지고 있습니다");
  await expect(page.locator(".basic-explanation").first()).toContainText("일반암");
  releaseAi();
  await page.unrouteAll({ behavior: "wait" });
});

test("기본 화면·조회 화면 접근성 자동 검사", async ({ page }) => {
  await page.goto("/");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.locator("#load-insurance").click();
  await expect(page.locator(".coverage-card")).toHaveCount(10);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
});
