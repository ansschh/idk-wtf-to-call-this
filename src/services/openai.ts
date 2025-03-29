// File: services/openai.ts

// Removed Logger import

export interface OpenAIRequestParams {
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    max_tokens?: number;
}

export interface OpenAIResponse {
    content: string; // Explanation
    suggestions?: Array<{ text: string }>; // fullLatex content
    fullContent?: string; // Added for potential redundancy if needed later
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

    public async sendMessage(params: OpenAIRequestParams): Promise<OpenAIResponse> {
        // Note: System prompt is added in chatService

        console.log("[OpenAIService] Sending request to backend /api/openai"); // Replaced Logger
        const response = await fetch('/api/openai', { // Calling YOUR backend API route
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: params.model,
                messages: params.messages,
                temperature: params.temperature ?? 0.3,
                max_tokens: params.max_tokens ?? 3500,
            }),
        });

        // *** This is where the error originates from ***
        // If !response.ok, it means YOUR /api/openai route returned an error (4xx or 5xx)
        if (!response.ok) {
            let errorText = 'Unknown backend error'; // Default error text
            try {
                // Try to get more specific error text from the response body
                errorText = await response.text();
            } catch (e) {
                 console.warn("[OpenAIService] Could not read error response body:", e);
            }
            // *** Log the detailed error here ***
            console.error(`[OpenAIService] Error from backend /api/openai (${response.status}): ${errorText}`); // Replaced Logger
            // Throwing the error, which chatService will catch
            throw new Error(`OpenAI API Error: ${errorText}`); // Pass detailed error
        }

        // If the backend call was successful (2xx status)
        const data = await response.json();
        console.log("[OpenAIService] Received successful response from backend /api/openai"); // Replaced Logger
        return {
            content: data.content || '', // Expecting 'explanation' here
            suggestions: data.suggestions || [], // Expecting [{ text: fullLatex }] here
        };
    }
}

export default OpenAIService;