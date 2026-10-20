import OpenAI from "openai";
import { createExplanationService } from "../server/explanation-service.js";

// 키는 Vercel Function 안에서만 읽습니다. SDK 자동 재시도는 비용 예측을 위해 끕니다.
export default createExplanationService({
  createResponse: async (params) => {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 40000,
      maxRetries: 0
    });
    return client.responses.create(params);
  }
});
