import { requestUrl } from "obsidian";

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
    private apiKey: string,
    private model: string
  ) {}

  async sendMessage(request: LlmRequest): Promise<LlmResponse> {
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
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.status !== 200) {
      const errBody = response.json;
      const msg =
        errBody?.error?.message ?? `API error: ${response.status}`;
      throw new Error(msg);
    }

    const data = response.json;
    return {
      content: data.content?.[0]?.text ?? "",
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    };
  }

  updateConfig(apiKey: string, model: string): void {
    this.apiKey = apiKey;
    this.model = model;
  }
}
