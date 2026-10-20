import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchInsuranceContracts, validateInsuranceData, flattenCoverages, formatAmount, formatDate } from "../services/insurance-service.js";

const source = JSON.parse(readFileSync("data/sample-insurance.json", "utf8"));

test("가상 계약 4건, 보장 10개, 서로 다른 뇌·심장 보장 구분", () => {
  const contracts = validateInsuranceData(source);
  assert.equal(contracts.length, 4);
  assert.equal(flattenCoverages(contracts).length, 10);
  assert.deepEqual(flattenCoverages(contracts, "brain").map((e) => e.coverage.name),
    ["뇌출혈 진단비", "뇌졸중 진단비", "뇌혈관질환 진단비"]);
  assert.deepEqual(flattenCoverages(contracts, "heart").map((e) => e.coverage.name),
    ["급성심근경색 진단비", "허혈성심장질환 진단비"]);
});

test("누락 금액·만기는 0원이나 보장 없음으로 바뀌지 않음", () => {
  assert.equal(formatAmount(null), "확인 필요");
  assert.equal(formatDate(null), "확인 필요");
  assert.equal(formatAmount(30000000), "3,000만 원");
  assert.equal(formatAmount(30000), "3만 원");
  assert.equal(formatAmount(0), "0원");
});

test("빈 데이터는 정상 결과, 중복 ID·잘못된 스키마는 오류", () => {
  assert.deepEqual(validateInsuranceData({ isDemo: true, contracts: [] }), []);
  assert.throws(() => validateInsuranceData({ isDemo: false, contracts: [] }));
  const duplicate = structuredClone(source);
  duplicate.contracts[1].coverages[0].id = duplicate.contracts[0].coverages[0].id;
  assert.throws(() => validateInsuranceData(duplicate));
  const invalid = structuredClone(source);
  invalid.contracts[0].coverages[0].amount = "30000000";
  assert.throws(() => validateInsuranceData(invalid));
});

test("조회 어댑터: 정상·HTTP 오류·잘못된 JSON·취소", async () => {
  const result = await fetchInsuranceContracts({ fetchImpl: async () => ({ ok: true, json: async () => source }) });
  assert.equal(result.length, 4);
  await assert.rejects(fetchInsuranceContracts({ fetchImpl: async () => ({ ok: false }) }));
  await assert.rejects(fetchInsuranceContracts({ fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError(); } }) }));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchInsuranceContracts({
    signal: controller.signal,
    fetchImpl: async (_url, { signal }) => { signal.throwIfAborted(); }
  }), { name: "AbortError" });
});
