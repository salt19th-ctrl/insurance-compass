// 정식 연동 시 이 어댑터를 교체합니다. UI는 아래 데이터 계약만 사용합니다.
export const CATEGORIES = [
  { id: "all", label: "전체", icon: "▦" },
  { id: "cancer", label: "암", icon: "✳" },
  { id: "brain", label: "뇌질환", icon: "◎" },
  { id: "heart", label: "심장질환", icon: "♡" },
  { id: "surgery", label: "수술", icon: "＋" },
  { id: "hospital", label: "입원", icon: "▤" },
  { id: "injury", label: "상해", icon: "◇" }
];

const isText = (v) => typeof v === "string" && v.trim().length > 0 && v.length <= 1000;
const isDate = (v) => v === null || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)));
export function validateInsuranceData(data) {
  if (!data || data.isDemo !== true || !Array.isArray(data.contracts) || data.contracts.length > 20) {
    throw new Error("시연 데이터 형식을 확인해 주세요.");
  }
  const contractIds = new Set();
  const coverageIds = new Set();
  for (const contract of data.contracts) {
    if (!contract || !["id", "insurer", "productName", "status"].every((key) => isText(contract[key])) ||
        !/^demo-[a-z-]+$/.test(contract.id) || contractIds.has(contract.id) ||
        !isDate(contract.startDate) || !isDate(contract.endDate) ||
        !Array.isArray(contract.coverages) || contract.coverages.length > 30) {
      throw new Error("계약 정보를 확인해 주세요.");
    }
    contractIds.add(contract.id);
    for (const c of contract.coverages) {
      if (!c || !["id", "name", "riderName", "amountUnit", "easyExplanation", "caution"].every((key) => isText(c[key])) ||
          !/^demo-[a-z-]+$/.test(c.id) || coverageIds.has(c.id) ||
          !CATEGORIES.some((cat) => cat.id !== "all" && cat.id === c.category) ||
          !(c.amount === null || (Number.isSafeInteger(c.amount) && c.amount >= 0)) ||
          !isDate(c.endDate) || c.conditionStatus !== "확인 필요" ||
          !Array.isArray(c.checkPoints) || !c.checkPoints.length || !c.checkPoints.every(isText)) {
        throw new Error("보장 정보를 확인해 주세요.");
      }
      coverageIds.add(c.id);
    }
  }
  return data.contracts;
}

export async function fetchInsuranceContracts({ fetchImpl = fetch, signal } = {}) {
  const response = await fetchImpl("/data/sample-insurance.json", { signal, cache: "no-cache" });
  if (!response.ok) throw new Error("보험 정보를 불러오지 못했습니다.");
  return validateInsuranceData(await response.json());
}

export function flattenCoverages(contracts, category = "all") {
  return contracts.flatMap((contract) => contract.coverages
    .filter((c) => category === "all" || c.category === category)
    .map((coverage) => ({ contract, coverage })));
}

// 건수는 계약별 보장 항목 수입니다. 특약명이 같아도 서로 다른 계약의 항목은 셉니다.
// 금액을 합산하거나 보장 범위·적정성을 추정하지 않습니다.
export function summarizeCoverages(contracts) {
  const entries = flattenCoverages(contracts);
  return CATEGORIES.filter((category) => category.id !== "all").map((category) => {
    const matching = entries.filter(({ coverage }) => coverage.category === category.id);
    const riderNames = [...new Set(matching.map(({ coverage }) => coverage.riderName).filter(isText))];
    const missingFields = [];
    if (matching.some(({ coverage }) => !isText(coverage.riderName))) missingFields.push("특약명");
    if (matching.some(({ coverage }) => coverage.amount == null)) missingFields.push("가입금액");
    if (matching.some(({ coverage }) => coverage.endDate == null)) missingFields.push("특약 만기");
    if (matching.some(({ contract }) => !isText(contract.status) || contract.status === "확인 필요")) missingFields.push("계약 상태");
    return { ...category, count: matching.length, riderNames, missingFields };
  });
}

export function formatAmount(amount) {
  if (amount === null || amount === undefined) return "확인 필요";
  return amount >= 10000 && amount % 10000 === 0
    ? `${new Intl.NumberFormat("ko-KR").format(amount / 10000)}만 원`
    : `${new Intl.NumberFormat("ko-KR").format(amount)}원`;
}

export function formatDate(date) {
  return date ? date.replaceAll("-", ".") : "확인 필요";
}
