import { CATEGORIES, fetchInsuranceContracts, flattenCoverages, summarizeCoverages, formatAmount, formatDate } from "./services/insurance-service.js";

const $ = (selector) => document.querySelector(selector);
const state = { contracts: [], loading: false, view: "insurance", category: "all", explanations: new Map(), aiBusy: false, aiCalls: 0, cooldownUntil: 0 };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch { /* 저장 차단 시 현재 화면만 변경 */ } }

const sizes = ["small", "normal", "large", "largest"];
const sizeLabels = ["작게", "기본", "크게", "아주 크게"];
let fontIndex = Math.max(0, sizes.indexOf(storageGet("compass-font") || "normal"));
function updateFont(announce = true) {
  document.documentElement.dataset.font = sizes[fontIndex];
  $("#font-smaller").disabled = fontIndex === 0;
  $("#font-larger").disabled = fontIndex === sizes.length - 1;
  if (announce) $("#font-status").textContent = `글씨 크기: ${sizeLabels[fontIndex]}`;
  storageSet("compass-font", sizes[fontIndex]);
}
$("#font-smaller").addEventListener("click", () => { fontIndex = Math.max(0, fontIndex - 1); updateFont(); });
$("#font-larger").addEventListener("click", () => { fontIndex = Math.min(3, fontIndex + 1); updateFont(); });
updateFont(false);

function setStatus(message, error = false) {
  const node = $("#load-status");
  node.textContent = message;
  node.classList.toggle("error", error);
}

$("#load-insurance").addEventListener("click", async () => {
  if (state.loading) return;
  state.loading = true;
  const button = $("#load-insurance");
  button.disabled = true;
  button.textContent = "불러오는 중…";
  $("#results").setAttribute("aria-busy", "true");
  setStatus("가상의 보험 계약을 불러오고 있습니다.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const contracts = await fetchInsuranceContracts({ signal: controller.signal });
    state.contracts = contracts;
    $("#initial-state").hidden = true;
    $("#results").hidden = false;
    $("#contract-count").textContent = `${contracts.length}건`;
    $("#coverage-count").textContent = `${flattenCoverages(contracts).length}개`;
    renderDashboard();
    renderResults();
    setStatus(contracts.length
      ? `가상 계약 ${contracts.length}건을 불러왔습니다. 지급 조건은 모두 약관 확인이 필요합니다.`
      : "조회된 계약이 없습니다. 실제 보장이 없다는 뜻은 아니며, 가입 내역 확인이 필요합니다.");
    button.textContent = "↻ 내 보험 다시 조회";
  } catch {
    setStatus(state.contracts.length
      ? "다시 조회하지 못했습니다. 이전 조회 결과를 표시하고 있습니다. 잠시 후 다시 시도해 주세요."
      : "조회하지 못했습니다. 인터넷 연결을 확인한 뒤 ‘다시 조회하기’를 눌러 주세요.", true);
    button.textContent = "↻ 다시 조회하기";
  } finally {
    clearTimeout(timer);
    state.loading = false;
    button.disabled = false;
    $("#results").setAttribute("aria-busy", "false");
  }
});

function selectCategory(category, moveToResults = false) {
  state.category = category;
  renderResults();
  if (moveToResults) {
    // 스크롤과 키보드 초점을 함께 이동합니다. 애니메이션 없이 결과를 바로 보여줍니다.
    $("#result-title").focus({ preventScroll: true });
    $(".result-heading").scrollIntoView({ block: "start", behavior: "instant" });
  }
}

function renderDashboard() {
  const cards = $("#dashboard-cards");
  cards.replaceChildren();
  for (const summary of summarizeCoverages(state.contracts)) {
    const item = el("li");
    const button = el("button", "dashboard-card");
    button.type = "button";
    button.dataset.dashboardCategory = summary.id;
    button.setAttribute("aria-controls", "coverage-results");
    const prefix = `dashboard-${summary.id}`;
    button.setAttribute("aria-labelledby", `${prefix}-title ${prefix}-count`);
    button.setAttribute("aria-describedby", `${prefix}-riders ${prefix}-missing ${prefix}-action`);
    const top = el("span", "dashboard-card-top");
    const icon = el("span", "dashboard-icon", summary.icon);
    icon.setAttribute("aria-hidden", "true");
    const title = el("span", "dashboard-card-title", summary.label);
    title.id = `${prefix}-title`;
    top.append(icon, title);
    const count = el("span", "dashboard-count", `${summary.count}건`);
    count.id = `${prefix}-count`;
    const names = el("span", "dashboard-riders");
    names.id = `${prefix}-riders`;
    if (summary.count === 0) {
      names.textContent = "조회된 항목 없음";
    } else if (!summary.riderNames.length) {
      names.textContent = "특약명 확인 필요";
    } else {
      names.append(el("span", "dashboard-riders-label", "조회된 주요 특약"));
      summary.riderNames.slice(0, 3).forEach((name) => names.append(el("span", "dashboard-rider", name)));
      if (summary.riderNames.length > 3) names.append(el("span", "dashboard-rider", `외 ${summary.riderNames.length - 3}개 특약`));
    }
    const missing = el("span", "dashboard-missing");
    missing.id = `${prefix}-missing`;
    missing.textContent = summary.count === 0
      ? "가입 내역 확인 필요"
      : summary.missingFields.length ? `확인 필요: ${summary.missingFields.join(" · ")}` : "지급 조건 확인 필요";
    const action = el("span", "dashboard-action", "보장 항목 보기 →");
    action.id = `${prefix}-action`;
    button.append(top, count, names, missing, action);
    button.addEventListener("click", () => selectCategory(summary.id, true));
    item.append(button);
    cards.append(item);
  }
}

for (const category of CATEGORIES) {
  const button = el("button", "", `${category.icon} ${category.label}`);
  button.type = "button";
  button.dataset.category = category.id;
  button.setAttribute("aria-label", `${category.label} 보장 필터`);
  button.setAttribute("aria-pressed", String(category.id === state.category));
  button.addEventListener("click", () => {
    selectCategory(category.id);
  });
  $("#category-filters").append(button);
}
document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    renderResults();
  });
});

function fact(label, value, className = "", note) {
  const group = el("div");
  group.append(el("dt", "", label));
  const dd = el("dd", className, value);
  if (note) dd.append(el("span", "unit", note));
  group.append(dd);
  return group;
}

function makeCard({ contract, coverage: c }) {
  const category = CATEGORIES.find((item) => item.id === c.category);
  const article = el("article", "coverage-card");
  article.dataset.coverageId = c.id;
  article.setAttribute("aria-labelledby", `title-${c.id}`);
  const top = el("div", "card-top");
  top.append(el("span", "category-label", `${category.icon} ${category.label}`), el("span", "badge warning", "지급 조건 확인 필요"));
  const title = el("h4", "", c.name);
  title.id = `title-${c.id}`;
  article.append(top, title, el("p", "card-contract", `${contract.insurer} · ${contract.productName} · 계약 ${contract.status}`));
  const facts = el("dl", "card-facts");
  facts.append(
    fact("가입금액 · 지급 확정액 아님", formatAmount(c.amount), "amount", c.amountUnit),
    fact("특약 만기", formatDate(c.endDate)),
    fact("특약명", c.riderName),
    fact("지급 조건", c.conditionStatus)
  );
  const basic = el("div", "basic-explanation");
  basic.append(el("h5", "", "쉽게 설명하면"), el("p", "", c.easyExplanation));
  const details = el("details", "coverage-details");
  details.append(el("summary", "", "보장 시 주의할 점 · 약관 확인 사항"), el("p", "", c.caution));
  const list = el("ul");
  c.checkPoints.forEach((point) => list.append(el("li", "", point)));
  details.append(list);
  const button = el("button", "ai-button", "✧ AI로 쉽게 설명하기");
  button.type = "button";
  button.setAttribute("aria-label", `${c.name} AI로 쉽게 설명하기`);
  button.setAttribute("aria-controls", `ai-${c.id}`);
  button.addEventListener("click", () => requestExplanation(c.id));
  const output = el("div", "ai-output");
  output.id = `ai-${c.id}`;
  output.setAttribute("role", "status");
  output.setAttribute("aria-live", "polite");
  article.append(facts, basic, details, button, output);
  return article;
}

function renderResults() {
  document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === state.view)));
  document.querySelectorAll("[data-category]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.category === state.category)));
  document.querySelectorAll("[data-dashboard-category]").forEach((button) => {
    const selected = button.dataset.dashboardCategory === state.category;
    button.setAttribute("aria-pressed", String(selected));
    button.querySelector(".dashboard-action").textContent = selected ? "✓ 선택됨 · 보장 항목 보기 →" : "보장 항목 보기 →";
  });
  const entries = flattenCoverages(state.contracts, state.category);
  const selected = CATEGORIES.find((c) => c.id === state.category);
  $("#result-title").textContent = `${selected.label} 보장`;
  $("#result-count").textContent = `${entries.length}개 항목 · ${state.view === "insurance" ? "보험별" : "보장별"} 보기`;
  const container = $("#coverage-results");
  container.replaceChildren();
  if (!entries.length) {
    const empty = el("div", "empty-state");
    empty.append(el("h3", "", "조회된 보장 항목이 없습니다"), el("p", "", "보장이 없다는 뜻은 아닙니다. 조회되지 않은 가입 내역은 확인이 필요합니다."));
    container.append(empty);
  } else if (state.view === "insurance") {
    for (const contract of state.contracts) {
      const contractEntries = entries.filter((e) => e.contract.id === contract.id);
      if (!contractEntries.length) continue;
      const section = el("section", "contract-section");
      const header = el("div", "contract-header");
      const top = el("div", "contract-top");
      const name = el("div");
      name.append(el("p", "contract-insurer", contract.insurer), el("h3", "", contract.productName));
      top.append(name, el("span", `badge${contract.status === "정상" ? "" : " warning"}`, `계약 ${contract.status}`));
      header.append(top, el("p", "contract-dates", `보험기간 ${formatDate(contract.startDate)} ~ ${formatDate(contract.endDate)} · 가입금액은 각 특약에 표시`));
      const grid = el("div", "coverage-grid");
      contractEntries.forEach((entry) => grid.append(makeCard(entry)));
      section.append(header, grid);
      container.append(section);
    }
  } else {
    for (const category of CATEGORIES.filter((c) => c.id !== "all")) {
      const categoryEntries = entries.filter((e) => e.coverage.category === category.id);
      if (!categoryEntries.length) continue;
      const section = el("section", "contract-section");
      const heading = el("h3", "contract-header", `${category.icon} ${category.label} · ${categoryEntries.length}개`);
      const grid = el("div", "coverage-grid");
      categoryEntries.forEach((entry) => grid.append(makeCard(entry)));
      section.append(heading, grid);
      container.append(section);
    }
  }
  const rows = $("#summary-rows");
  rows.replaceChildren();
  for (const { coverage: c, contract } of entries) {
    const row = el("tr");
    const title = el("th", "", c.name);
    title.scope = "row";
    title.append(el("small", "card-contract", `${contract.productName} · 계약 ${contract.status}`));
    row.append(title, el("td", "", `${formatAmount(c.amount)} (${c.amountUnit})`), el("td", "", formatDate(c.endDate)), el("td", "", c.conditionStatus));
    rows.append(row);
  }
  updateAiCards();
}

function updateAiCards() {
  document.querySelectorAll(".coverage-card").forEach((card) => {
    const explanation = state.explanations.get(card.dataset.coverageId);
    const button = card.querySelector(".ai-button");
    const output = card.querySelector(".ai-output");
    button.disabled = state.aiBusy || state.aiCalls >= 12 || Date.now() < state.cooldownUntil || explanation?.status === "done";
    button.textContent = explanation?.status === "loading" ? "설명을 준비하고 있어요…"
      : explanation?.status === "done" ? "✓ AI 설명을 아래에서 확인하세요"
      : state.aiCalls >= 12 ? "이번 체험의 AI 요청 한도에 도달했어요"
      : explanation?.status === "error" ? "↻ AI 설명 다시 요청하기" : "✧ AI로 쉽게 설명하기";
    // 다른 카드의 aria-live 영역을 반복 갱신하지 않습니다.
    if (output.dataset.revision === String(explanation?.revision || 0)) return;
    output.dataset.revision = String(explanation?.revision || 0);
    output.replaceChildren();
    if (!explanation) return;
    if (explanation.status !== "done") {
      output.textContent = explanation.message;
      return;
    }
    [["쉽게 설명하면", "simple"], ["보장 시 주의할 점", "caution"], ["약관에서 확인할 사항", "check"]].forEach(([label, key]) => {
      output.append(el("h5", "", label), el("p", "", explanation.data[key]));
    });
    output.append(el("p", "ai-disclaimer", "AI가 생성한 참고 설명으로 오류가 있을 수 있습니다. 가입금액은 지급 확정액이 아니며, 실제 지급 조건은 약관과 보험사에서 확인하세요."));
  });
}

async function requestExplanation(coverageId) {
  if (state.aiBusy || state.aiCalls >= 12 || Date.now() < state.cooldownUntil || state.explanations.get(coverageId)?.status === "done") return;
  state.aiBusy = true;
  state.aiCalls += 1;
  state.explanations.set(coverageId, { status: "loading", message: "AI가 쉬운 설명을 준비하고 있습니다. 기본 설명은 계속 읽을 수 있어요.", revision: Date.now() });
  updateAiCards();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50000);
  try {
    const response = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverageId }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        400: "설명할 보장 정보를 확인하지 못했습니다.",
        403: "이 페이지에서 AI 요청을 허용하지 않습니다.",
        429: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
        503: "AI 연결이 설정되지 않았거나 잠시 중단되었습니다.",
        504: "AI 응답 시간이 길어지고 있습니다. 잠시 후 다시 시도해 주세요."
      };
      if (response.status === 429) {
        const seconds = Number(response.headers.get("retry-after"));
        state.cooldownUntil = Date.now() + (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 300) : 60) * 1000;
      }
      throw new Error(messages[response.status] || "AI 설명을 가져오지 못했습니다.");
    }
    if (!["simple", "caution", "check"].every((key) => typeof data.explanation?.[key] === "string" && data.explanation[key].trim() && data.explanation[key].length <= 1600)) {
      throw new Error("AI 설명 형식을 확인하지 못했습니다.");
    }
    state.explanations.set(coverageId, { status: "done", data: data.explanation, revision: Date.now() });
  } catch (error) {
    const message = error.name === "AbortError" ? "AI 응답 시간이 길어지고 있습니다." : error instanceof TypeError ? "AI 연결을 확인하지 못했습니다." : error.message;
    state.explanations.set(coverageId, { status: "error", message: `${message} 위의 기본 쉬운 설명은 계속 이용할 수 있습니다.`, revision: Date.now() });
  } finally {
    clearTimeout(timer);
    state.aiBusy = false;
    state.cooldownUntil = Math.max(state.cooldownUntil, Date.now() + 3000);
    updateAiCards();
    setTimeout(updateAiCards, Math.max(0, state.cooldownUntil - Date.now()) + 50);
  }
}
