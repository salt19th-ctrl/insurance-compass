import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateInsuranceData, flattenCoverages } from "../services/insurance-service.js";

const source = JSON.parse(readFileSync(join(process.cwd(), "data/sample-insurance.json"), "utf8"));
const catalog = new Map(flattenCoverages(validateInsuranceData(source)).map(({ coverage, contract }) => [
  coverage.id, { coverage, contractStatus: contract.status }
]));
const RESPONSE_FIELDS = ["simple", "caution", "check"];
export const responseSchema = {
  type: "object",
  properties: Object.fromEntries(RESPONSE_FIELDS.map((key) => [key, { type: "string" }])),
  required: RESPONSE_FIELDS,
  additionalProperties: false
};

export function createExplanationService({ createResponse, env = process.env, now = Date.now } = {}) {
  // 인스턴스 간에 공유되는 영구 제한은 아닙니다. README의 한계를 참고하세요.
  const clients = new Map();
  const cache = new Map();
  const pending = new Map();
  let globalWindow = { count: 0, until: 0 };
  let active = 0;
  function reply(res, status, payload) { return res.status(status).json(payload); }
  function fail(res, status, code) { return reply(res, status, { error: code }); }
  function limited(res, seconds) {
    res.setHeader("Retry-After", String(seconds));
    return fail(res, 429, "RATE_LIMITED");
  }
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return fail(res, 405, "METHOD_NOT_ALLOWED");
    }
    const headers = req.headers || {};
    if (headers["sec-fetch-site"] === "cross-site") return fail(res, 403, "ORIGIN_NOT_ALLOWED");
    if (headers.origin) {
      try {
        if (new URL(headers.origin).host !== headers.host) return fail(res, 403, "ORIGIN_NOT_ALLOWED");
      } catch { return fail(res, 403, "ORIGIN_NOT_ALLOWED"); }
    }
    if (!/^application\/json(?:\s*;|$)/i.test(headers["content-type"] || "")) return fail(res, 415, "JSON_REQUIRED");
    if (Number(headers["content-length"]) > 256) return fail(res, 413, "INPUT_TOO_LARGE");
    let body;
    try {
      const raw = typeof req.body === "string" ? req.body : Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body);
      if (!raw || Buffer.byteLength(raw, "utf8") > 256) return fail(res, 413, "INPUT_TOO_LARGE");
      body = JSON.parse(raw);
    } catch { return fail(res, 400, "INVALID_JSON"); }
    if (!body || Array.isArray(body) || Object.keys(body).length !== 1 ||
        typeof body.coverageId !== "string" || body.coverageId.length > 64 || !catalog.has(body.coverageId)) {
      return fail(res, 400, "UNKNOWN_DEMO_COVERAGE");
    }
    if (!env.OPENAI_API_KEY?.trim() || env.AI_DISABLED === "true") return fail(res, 503, "AI_UNAVAILABLE");
    const model = env.OPENAI_MODEL?.trim() || "gpt-5-mini";
    if (!/^[a-zA-Z0-9._:-]{1,100}$/.test(model)) return fail(res, 503, "MODEL_CONFIGURATION_ERROR");

    const time = now();
    // Vercel이 설정하는 forwarded-for를 이용합니다. IP 원문은 보관·출력하지 않습니다.
    const forwarded = headers["x-forwarded-for"];
    const ip = (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.socket?.remoteAddress || "unknown").slice(0, 128);
    const clientId = createHash("sha256").update(ip).digest("hex");
    for (const [key, value] of clients) if (value.until <= time) clients.delete(key);
    if (clients.size >= 2000 && !clients.has(clientId)) return limited(res, 60);
    const client = clients.get(clientId) || { count: 0, until: time + 60000 };
    if (client.count >= 6) return limited(res, Math.max(1, Math.ceil((client.until - time) / 1000)));
    client.count += 1;
    clients.set(clientId, client);

    const cacheKey = `${model}:${body.coverageId}`;
    const saved = cache.get(cacheKey);
    if (saved && saved.until > time) return reply(res, 200, { explanation: saved.explanation, cached: true, model });
    // 동일 인스턴스에서 같은 보장을 동시에 요청하면 한 번만 생성합니다.
    if (pending.has(cacheKey)) {
      try { return reply(res, 200, { explanation: await pending.get(cacheKey), cached: true, model }); }
      catch { return fail(res, 502, "AI_REQUEST_FAILED"); }
    }
    if (globalWindow.until <= time) globalWindow = { count: 0, until: time + 60000 };
    if (globalWindow.count >= 30 || active >= 2) return limited(res, 60);
    globalWindow.count += 1;
    active += 1;
    const { coverage, contractStatus } = catalog.get(body.coverageId);
    const task = (async () => {
      const response = await createResponse({
        model,
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: 1800,
        instructions: [
          "가상 보험 보장을 쉬운 한국어로 설명하세요. 고령층도 읽기 쉬운 짧은 문장을 사용하세요.",
          "simple=쉽게 설명하면, caution=보장 시 주의할 점, check=약관에서 확인할 사항. 각 항목 1~3문장, 400자 이내.",
          "제공된 시연 데이터만 사용하고 없는 지급 조건, 기간, 질병코드, 금액을 만들지 마세요. 모르면 확인 필요라고 쓰세요.",
          "가입금액은 지급 확정액이 아닙니다. 계약 상태가 확인 필요이면 그 점을 알려 주세요. 누락 정보는 보장 없음으로 표현하지 마세요.",
          "뇌출혈/뇌졸중/뇌혈관질환, 급성심근경색/허혈성심장질환, 일반암/유사암을 동일 보장으로 취급하지 마세요.",
          "보험 가입 권유, 의료 진단, 보험금 지급 확정, 보장 적정성 판단, 보장 합산을 하지 마세요."
        ].join("\n"),
        input: JSON.stringify({
          name: coverage.name, riderName: coverage.riderName, category: coverage.category,
          amount: coverage.amount, amountUnit: coverage.amountUnit, endDate: coverage.endDate,
          contractStatus, conditionStatus: coverage.conditionStatus,
          reviewedExplanation: coverage.easyExplanation, caution: coverage.caution, checkPoints: coverage.checkPoints
        }),
        text: { format: { type: "json_schema", name: "insurance_explanation", strict: true, schema: responseSchema } }
      });
      if (response.status !== "completed" || !response.output_text) throw new Error("INCOMPLETE_OUTPUT");
      const explanation = JSON.parse(response.output_text);
      if (!explanation || Object.keys(explanation).length !== 3 ||
          !RESPONSE_FIELDS.every((key) => typeof explanation[key] === "string" && explanation[key].trim() && explanation[key].length <= 1600)) {
        throw new Error("INVALID_OUTPUT");
      }
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(cacheKey, { explanation, until: now() + 24 * 60 * 60 * 1000 });
      return explanation;
    })();
    pending.set(cacheKey, task);
    try {
      return reply(res, 200, { explanation: await task, cached: false, model });
    } catch (error) {
      // SDK의 에러 본문·키·입력은 로그나 브라우저에 반환하지 않습니다.
      if (error?.status === 429) return limited(res, 60);
      if (error?.status === 401 || error?.status === 403 || error?.status === 404) return fail(res, 503, "MODEL_OR_KEY_UNAVAILABLE");
      if (error?.name === "APIConnectionTimeoutError") return fail(res, 504, "AI_TIMEOUT");
      return fail(res, 502, "AI_REQUEST_FAILED");
    } finally {
      pending.delete(cacheKey);
      active -= 1;
    }
  };
}
