import test from "node:test";
import assert from "node:assert/strict";
import { createExplanationService } from "../server/explanation-service.js";

const explanation = { simple: "가상 일반암 진단 보장입니다.", caution: "지급 확정액이 아닙니다.", check: "약관의 정의와 기간을 확인하세요." };
const goodResponse = { status: "completed", output_text: JSON.stringify(explanation) };
const env = { OPENAI_API_KEY: "test-placeholder-only" };
function request(overrides = {}) {
  return { method: "POST", headers: { "content-type": "application/json", host: "localhost", "x-forwarded-for": "192.0.2.1" }, body: { coverageId: "demo-cancer" }, ...overrides };
}
async function call(handler, req = request()) {
  const result = { headers: {} };
  const res = {
    setHeader: (key, value) => { result.headers[key] = value; },
    status: (status) => { result.status = status; return res; },
    json: (body) => { result.body = body; return result; }
  };
  await handler(req, res);
  return result;
}
function service(options = {}) {
  return createExplanationService({ env, createResponse: async () => goodResponse, ...options });
}

test("POST와 JSON만 허용하고 입력 길이·시연 ID·추가 필드를 검증", async () => {
  let calls = 0;
  const handler = service({ createResponse: async () => { calls++; return goodResponse; } });
  assert.equal((await call(handler, request({ method: "GET" }))).status, 405);
  assert.equal((await call(handler, request({ headers: {} }))).status, 415);
  assert.equal((await call(handler, request({ body: "not-json" }))).status, 400);
  assert.equal((await call(handler, request({ body: "a".repeat(257) }))).status, 413);
  assert.equal((await call(handler, request({ body: { coverageId: "real-policy" } }))).status, 400);
  assert.equal((await call(handler, request({ body: { coverageId: "demo-cancer", prompt: "임의 지시" } }))).status, 400);
  assert.equal((await call(handler, request({ body: null }))).status, 400);
  assert.equal(calls, 0);
});

test("다른 Origin 차단, 같은 Origin 허용", async () => {
  const handler = service();
  const headers = { ...request().headers, origin: "https://other.example" };
  assert.equal((await call(handler, request({ headers }))).status, 403);
  headers.origin = "http://localhost";
  assert.equal((await call(handler, request({ headers }))).status, 200);
});

test("키 미설정·킬 스위치·잘못된 모델 설정은 SDK를 호출하지 않음", async () => {
  let calls = 0;
  for (const config of [{}, { ...env, AI_DISABLED: "true" }, { ...env, OPENAI_MODEL: "invalid model" }]) {
    const handler = service({ env: config, createResponse: async () => { calls++; } });
    assert.equal((await call(handler)).status, 503);
  }
  assert.equal(calls, 0);
});

test("기본 모델·Responses 스키마·최소 정보만 전달, 성공 응답 캐시", async () => {
  let calls = 0;
  const handler = service({ createResponse: async (params) => {
    calls++;
    assert.equal(params.model, "gpt-5-mini");
    assert.equal(params.store, false);
    assert.equal(params.text.format.strict, true);
    assert.equal(params.max_output_tokens, 1800);
    const input = JSON.parse(params.input);
    assert.equal(input.name, "일반암 진단비");
    assert.equal(input.amount, 30000000);
    assert.equal(input.contractStatus, "정상");
    assert.equal(input.insurer, undefined);
    assert.equal(input.productName, undefined);
    return goodResponse;
  } });
  const first = await call(handler);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.explanation, explanation);
  assert.equal(first.headers["Cache-Control"], "no-store");
  assert.equal((await call(handler)).body.cached, true);
  assert.equal(calls, 1);
});

test("OPENAI_MODEL 재정의 전달", async () => {
  const handler = service({ env: { ...env, OPENAI_MODEL: "gpt-5-mini-2025-08-07" }, createResponse: async (p) => {
    assert.equal(p.model, "gpt-5-mini-2025-08-07"); return goodResponse;
  } });
  assert.equal((await call(handler)).status, 200);
});

test("IP별 분당 6회 제한 및 60초 후 회복", async () => {
  let time = 1000;
  const handler = service({ now: () => time });
  for (let i = 0; i < 6; i++) assert.equal((await call(handler)).status, 200);
  const limited = await call(handler);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers["Retry-After"], "60");
  time += 60001;
  assert.equal((await call(handler)).status, 200);
});

test("동일 보장 동시 요청을 합쳐 중복 과금 방지", async () => {
  let finish;
  let calls = 0;
  const handler = service({ createResponse: () => {
    calls++;
    return new Promise((resolve) => { finish = resolve; });
  } });
  const a = call(handler);
  const b = call(handler);
  finish(goodResponse);
  assert.deepEqual((await Promise.all([a, b])).map((r) => r.status), [200, 200]);
  assert.equal(calls, 1);
});

test("서로 다른 보장 동시 생성은 2개까지", async () => {
  const finishes = [];
  const handler = service({ createResponse: () => new Promise((resolve) => finishes.push(resolve)) });
  const a = call(handler);
  const b = call(handler, request({ body: { coverageId: "demo-stroke" } }));
  assert.equal((await call(handler, request({ body: { coverageId: "demo-injury" } }))).status, 429);
  finishes.forEach((finish) => finish(goodResponse));
  await Promise.all([a, b]);
});

test("인스턴스 분당 생성 30회 제한 (실패도 포함)", async () => {
  const handler = service({ createResponse: async () => { throw new Error("upstream"); } });
  for (let i = 0; i < 30; i++) {
    assert.equal((await call(handler, request({ headers: { ...request().headers, "x-forwarded-for": `192.0.2.${i}` } }))).status, 502);
  }
  assert.equal((await call(handler, request({ headers: { ...request().headers, "x-forwarded-for": "198.51.100.1" } }))).status, 429);
});

test("모델 접근 실패·타임아웃·한도 오류의 안전한 메시지", async () => {
  for (const [error, expected] of [
    [{ status: 401 }, 503], [{ status: 403 }, 503], [{ status: 404 }, 503],
    [{ status: 429 }, 429], [{ name: "APIConnectionTimeoutError" }, 504], [new Error("private upstream detail"), 502]
  ]) {
    const result = await call(service({ createResponse: async () => { throw error; } }));
    assert.equal(result.status, expected);
    assert.doesNotMatch(JSON.stringify(result.body), /private upstream detail|test-placeholder/);
  }
});

test("미완료·거절·비정상 JSON·누락 출력은 기본 설명을 대체하지 않음", async () => {
  for (const response of [
    { status: "incomplete", output_text: JSON.stringify(explanation) },
    { status: "completed", output_text: "" },
    { status: "completed", output_text: "not-json" },
    { status: "completed", output_text: '{"simple":"한 줄"}' },
    { status: "completed", output_text: JSON.stringify({ ...explanation, caution: " ".repeat(10) }) }
  ]) assert.equal((await call(service({ createResponse: async () => response }))).status, 502);
});
