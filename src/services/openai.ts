// File: services/openai.ts
const Logger = console; // Using console for logging

// Interface for parameters sent TO our backend API routes
export interface OpenAIRequestParams {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
}

// Generic interface for the expected structure of responses FROM our backend API routes
export interface BackendApiResponse {
  content?: string;       // May be used if explanation is not provided
  edits?: string[];       // For edit API responses
  explanation?: string;   // Expected from explain endpoints
  error?: string;         // Error message if any
  details?: string;       // Additional error details
  rawResponse?: string;   // The full raw response (for debugging)
  [key: string]: any;     // Allow other fields for flexibility
}

class OpenAIService {
  private static instance: OpenAIService;

  private constructor() { }

  public static getInstance(): OpenAIService {
    if (!OpenAIService.instance) {
      OpenAIService.instance = new OpenAIService();
    }
    return OpenAIService.instance;
  }

  /**
   * Calls one of our backend API routes.
   * @param apiRoute The backend route to be called. Now supports '/api/openai-vision' along with other routes.
   * @param params The parameters to forward to our backend.
   * @returns A promise resolving to the parsed JSON response.
   */
  public async callBackendApi(
    apiRoute: '/api/openai-edit' | '/api/openai-explain' | '/api/openai-search-replace' | '/api/openai-vision',
    params: OpenAIRequestParams
  ): Promise<BackendApiResponse> {
    Logger.log(`[OpenAIService] Sending request to backend route: ${apiRoute}`);

    const requestBody = {
      model: params.model,
      messages: params.messages,
      ...(params.temperature !== undefined && { temperature: params.temperature }),
      ...(params.max_tokens !== undefined && { max_tokens: params.max_tokens }),
    };

    const response = await fetch(apiRoute, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorText = `Backend API Error (${response.status}) calling ${apiRoute}`;
      let errorDetails = '';
      try {
        const errorData: BackendApiResponse = await response.json();
        errorDetails = errorData.error || errorData.details || JSON.stringify(errorData);
        errorText = `${errorText}: ${errorDetails}`;
      } catch (e) {
        try {
          const rawErrorText = await response.text();
          errorText = `${errorText}: ${rawErrorText || '(Empty error response body)'}`;
        } catch (textError) {
          Logger.warn(`[OpenAIService] Could not parse error response for ${apiRoute}:`, textError);
          errorText = `${errorText}: Failed to read error response body.`;
        }
      }
      Logger.error(`[OpenAIService] Error received from backend ${apiRoute}: ${errorText}`);
      throw new Error(errorText);
    }

    try {
      const data: BackendApiResponse = await response.json();
      Logger.log(`[OpenAIService] Received successful JSON response from ${apiRoute}`);
      return data;
    } catch (parseError) {
      Logger.error(`[OpenAIService] Failed to parse JSON response from ${apiRoute}:`, parseError);
      throw new Error(`Failed to parse successful response from ${apiRoute}.`);
    }
  }
}

export default OpenAIService;
