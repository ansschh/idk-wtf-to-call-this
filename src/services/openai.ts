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
// This covers potential fields from both /api/openai-edit and /api/openai-explain
export interface BackendApiResponse {
    content?: string;       // Likely unused now, replaced by explanation
    edits?: string[];       // Expected from /api/openai-edit
    explanation?: string;   // Expected from /api/openai-explain
    error?: string;         // Optional error field from backend
    details?: string;       // Optional error details
    rawResponse?: string;   // Optional raw response for debugging
    [key: string]: any;     // Allow other potential fields for flexibility
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
     * Calls the specified backend API route (/api/openai-edit or /api/openai-explain).
     * This acts as a fetch wrapper for our internal backend endpoints.
     * @param apiRoute The specific backend endpoint to call ('/api/openai-edit' or '/api/openai-explain').
     * @param params The parameters to be forwarded to the backend (model, messages, etc.).
     * @returns A promise that resolves to the parsed JSON response from the backend API.
     * @throws An error if the backend fetch fails or returns a non-ok status.
     */
    public async callBackendApi(
        apiRoute: '/api/openai-edit' | '/api/openai-explain' | '/api/openai-search-replace',
        params: OpenAIRequestParams
    ): Promise<BackendApiResponse> { // Return the generic backend response type

        Logger.log(`[OpenAIService] Sending request to backend route: ${apiRoute}`);

        // Prepare the body for the fetch request to our backend
        const requestBody = {
            model: params.model,
            messages: params.messages,
            // Pass temperature and max_tokens if they exist, otherwise let backend handle defaults
            ...(params.temperature !== undefined && { temperature: params.temperature }),
            ...(params.max_tokens !== undefined && { max_tokens: params.max_tokens }),
        };

        const response = await fetch(apiRoute, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        // Check if the fetch call to *our* backend route was successful
        if (!response.ok) {
            let errorText = `Backend API Error (${response.status}) calling ${apiRoute}`;
            let errorDetails = '';
            try {
                // Attempt to parse structured error details from the backend response
                const errorData: BackendApiResponse = await response.json();
                errorDetails = errorData.error || errorData.details || JSON.stringify(errorData);
                errorText = `${errorText}: ${errorDetails}`;
            } catch (e) {
                 // If parsing the error response fails, get the raw text
                 try {
                    const rawErrorText = await response.text();
                    errorText = `${errorText}: ${rawErrorText || '(Empty error response body)'}`;
                 } catch (textError) {
                     Logger.warn(`[OpenAIService] Could not parse error JSON or read error text body for ${apiRoute}:`, textError);
                     errorText = `${errorText}: Failed to read error response body.`;
                 }
            }
            Logger.error(`[OpenAIService] Error received from backend ${apiRoute}: ${errorText}`);
            // Throw an error that includes details, which chatService will catch
            throw new Error(errorText);
        }

        // If the backend response status is OK (2xx)
        try {
            const data: BackendApiResponse = await response.json();
            Logger.log(`[OpenAIService] Received successful JSON response from backend ${apiRoute}`);
            // Return the parsed data (which could be { edits: [...] } or { explanation: "..." })
            return data;
        } catch (parseError) {
             Logger.error(`[OpenAIService] Failed to parse successful JSON response from ${apiRoute}:`, parseError);
             // Throw an error if parsing the successful response fails
             throw new Error(`Failed to parse successful response from ${apiRoute}.`);
        }
    }
}

// Export the singleton instance
export default OpenAIService;