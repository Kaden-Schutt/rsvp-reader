import { requestUrl } from "obsidian";
import { LlmProvider } from "../types";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  systemPrompt: string;
  messages: LlmMessage[];
  maxTokens?: number;
}

export interface LlmResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export class LlmService {
  constructor(
    private provider: LlmProvider,
    private apiKey: string,
    private model: string,
    private baseUrl: string
  ) {}

  async sendMessage(request: LlmRequest): Promise<LlmResponse> {
    switch (this.provider) {
      case "anthropic":
        return this.sendAnthropic(request);
      case "openai":
        return this.sendOpenAI(request);
    }
  }

  private async sendAnthropic(request: LlmRequest): Promise<LlmResponse> {
    const url = this.baseUrl || "https://api.anthropic.com";
    const body = {
      model: this.model,
      max_tokens: request.maxTokens ?? 1024,
      system: request.systemPrompt,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    const response = await requestUrl({
      url: `${url}/v1/messages`,
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.status !== 200) {
      const msg =
        response.json?.error?.message ?? `API error: ${response.status}`;
      throw new Error(msg);
    }

    const data = response.json;
    return {
      content: data.content?.[0]?.text ?? "",
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    };
  }

  private async sendOpenAI(request: LlmRequest): Promise<LlmResponse> {
    const url = this.baseUrl || "https://api.openai.com";
    const messages = [
      { role: "system" as const, content: request.systemPrompt },
      ...request.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const body = {
      model: this.model,
      max_tokens: request.maxTokens ?? 1024,
      messages,
    };

    const response = await requestUrl({
      url: `${url}/v1/chat/completions`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.status !== 200) {
      const msg =
        response.json?.error?.message ?? `API error: ${response.status}`;
      throw new Error(msg);
    }

    const data = response.json;
    return {
      content: data.choices?.[0]?.message?.content ?? "",
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };
  }

  updateConfig(
    provider: LlmProvider,
    apiKey: string,
    model: string,
    baseUrl: string
  ): void {
    this.provider = provider;
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl;
  }
}
