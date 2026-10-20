import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const sample = JSON.parse(readFileSync("data/sample-insurance.json", "utf8"));
const card = (page, category) => page.locator(`[data-dashboard-category="${category}"]`);
const expected = { cancer: 2, brain: 3, heart: 2, surgery: 1, hospital: 1, injury: 1 };

async function load(page) {
  await page.goto("/");
  await expect(page.locator("#coverage-dashboard")).toBeHidden();
  await page.locator("#load-insurance").click();
  await expect(page.locator(".dashboard-card")).toHaveCount(6);
}

test("대시보드 건수·특약명과 필터·양쪽 보기 연동", async ({ page }, testInfo) => {
  await load(page);
  await expect(page.locator("#dashboard-title")).toHaveText("내 보장 한눈에");
  for (const [category, count] of Object.entries(expected)) {
    await expect(card(page, category).locator(".dashboard-count")).toHaveText(`${count}건`);
  }
  await expect(card(page, "brain").locator(".dashboard-rider")).toHaveText(
    ["뇌출혈 진단 특약", "뇌졸중 진단 특약", "뇌혈관질환 진단 특약"]);
  await expect(card(page, "heart").locator(".dashboard-rider")).toHaveText(
    ["급성심근경색증 진단 특약", "허혈성심장질환 진단 특약"]);
  await page.locator("#coverage-dashboard").screenshot({ path: testInfo.outputPath("dashboard-desktop.png") });
  for (const view of ["insurance", "coverage"]) {
    await page.locator(`[data-view="${view}"]`).click();
    for (const [category, count] of Object.entries(expected)) {
      await card(page, category).click();
      await expect(page.locator(`[data-category="${category}"]`)).toHaveAttribute("aria-pressed", "true");
      await expect(card(page, category)).toHaveAttribute("aria-pressed", "true");
      await expect(card(page, category).locator(".dashboard-action")).toContainText("선택됨");
      await expect(page.locator(".coverage-card")).toHaveCount(count);
      await expect(page.locator("#summary-rows tr")).toHaveCount(count);
      await expect(page.locator("#result-title")).toBeFocused();
      await expect(page.locator("#result-title")).toBeInViewport();
      await expect(page.locator(".coverage-card").first()).toBeInViewport();
      await expect(page.locator(`[data-view="${view}"]`)).toHaveAttribute("aria-pressed", "true");
    }
  }
  await page.locator('[data-category="brain"]').click();
  await expect(card(page, "brain")).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-category="all"]').click();
  await expect(page.locator('.dashboard-card[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator(".coverage-card")).toHaveCount(10);
  // 필터를 바꿔도 대시보드는 전체 조회 결과의 건수를 유지합니다.
  for (const [category, count] of Object.entries(expected)) {
    await expect(card(page, category).locator(".dashboard-count")).toHaveText(`${count}건`);
  }
});

test("대시보드 빈 조회·일부 유형 누락·재조회 후 건수와 특약명 갱신", async ({ page }) => {
  let data = { isDemo: true, contracts: [] };
  await page.route("**/data/sample-insurance.json", (route) => route.fulfill({ json: data }));
  await load(page);
  await expect(page.locator(".dashboard-count")).toHaveText(Array(6).fill("0건"));
  await expect(page.locator(".dashboard-riders")).toHaveText(Array(6).fill("조회된 항목 없음"));
  await expect(page.locator(".dashboard-missing")).toHaveText(Array(6).fill("가입 내역 확인 필요"));
  await card(page, "heart").click();
  await expect(page.locator("#coverage-results")).toContainText("확인이 필요합니다");
  await expect(page.locator("#result-title")).toBeFocused();
  data = structuredClone(sample);
  data.contracts = [data.contracts[0]];
  data.contracts[0].coverages = [data.contracts[0].coverages[0]];
  data.contracts[0].coverages[0].riderName = "새로 조회된 암 진단 특약";
  await page.locator("#load-insurance").click();
  await expect(card(page, "cancer").locator(".dashboard-count")).toHaveText("1건");
  await expect(card(page, "cancer")).toContainText("새로 조회된 암 진단 특약");
  await expect(card(page, "brain")).toContainText("조회된 항목 없음");
  await expect(card(page, "cancer")).not.toContainText("유사암");
  await card(page, "cancer").click();
  await expect(page.locator(".coverage-card")).toHaveCount(1);
  await expect(page.locator("#coverage-dashboard")).not.toContainText(/미가입|보장 없음|충분|부족|가입 필요/);
});

test("대시보드의 누락 정보 안내와 금액 비합산", async ({ page }) => {
  await load(page);
  await expect(card(page, "injury").locator(".dashboard-count")).toHaveText("1건");
  await expect(card(page, "injury").locator(".dashboard-missing")).toHaveText("확인 필요: 가입금액 · 특약 만기 · 계약 상태");
  await expect(card(page, "hospital").locator(".dashboard-missing")).toHaveText("확인 필요: 특약 만기");
  await expect(page.locator("#coverage-dashboard")).not.toContainText(/미가입|보장 없음|충분|부족|\d+만 원/);
  await expect(page.locator("#dashboard-help")).toContainText("지급 여부나 보장 적정성을 뜻하지 않습니다");
});

test("대시보드는 Tab·Enter·Space로 필터와 결과 초점 이동", async ({ page }) => {
  await load(page);
  await card(page, "cancer").focus();
  await page.keyboard.press("Tab");
  await expect(card(page, "brain")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#result-title")).toHaveText("뇌질환 보장");
  await expect(page.locator("#result-title")).toBeFocused();
  await expect(page.locator(".coverage-card")).toHaveCount(3);
  await card(page, "heart").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#result-title")).toHaveText("심장질환 보장");
  await expect(page.locator("#result-title")).toBeFocused();
  await expect(page.locator(".coverage-card")).toHaveCount(2);
});

test("최대 글씨의 320px·390px 대시보드와 긴 특약명에 가로 넘침 없음", async ({ page }, testInfo) => {
  const data = structuredClone(sample);
  data.contracts[0].coverages[0].riderName = "조회된긴특약명".repeat(12);
  await page.route("**/data/sample-insurance.json", (route) => route.fulfill({ json: data }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await load(page);
  await page.getByRole("button", { name: "글씨 확대" }).click();
  await page.getByRole("button", { name: "글씨 확대" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-font", "largest");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator(".dashboard-card").evaluateAll((cards) => cards.every((node) => node.scrollWidth <= node.clientWidth))).toBe(true);
    await card(page, "brain").click();
    await expect(page.locator("#result-title")).toBeFocused();
    await expect(page.locator(".coverage-card").first()).toBeInViewport();
    await card(page, "brain").screenshot({ path: testInfo.outputPath(`dashboard-mobile-${width}.png`) });
  }
});
