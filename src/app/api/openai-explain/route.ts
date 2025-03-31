// File: src/app/api/openai-explain/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import {
    ChatCompletionMessageParam, // Correct type for messages array
    ChatCompletionContentPart, // Correct type for content parts (text/image)
} from 'openai/resources/chat/completions';

// Logger replacement using console
const Logger = console;
const MAX_RETRIES = 1;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define the expected structure for a content part (more specific)
type InputContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export async function POST(request: Request) {
  let requestBody;
  try {
    requestBody = await request.json();
  } catch (e) {
    Logger.error("[API Explain] Failed to parse request JSON:", e);
    return NextResponse.json({ error: 'Invalid request body. Expected JSON.' }, { status: 400 });
  }

  // Destructure messages and model from the frontend request
  const { model: requestedModel, messages: incomingMessages } = requestBody || {};

  // --- Validate Incoming Messages ---
  if (!incomingMessages || !Array.isArray(incomingMessages) || incomingMessages.length === 0) {
     Logger.error("[API Explain] Invalid request: 'messages' array is missing or empty.");
     return NextResponse.json({ error: 'Missing or invalid "messages" array.' }, { status: 400 });
  }

  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    attempt++;
    Logger.log(`[API Explain Attempt ${attempt}] Processing request...`);

    try {
      // --- Determine Model and Check for Image Input ---
      let modelToUse = requestedModel || 'gpt-4o-mini'; // Default to gpt-4o-mini as requested
      let hasImage = false;

      // Check the *last* message's content structure to see if it contains an image
      const lastMessage = incomingMessages[incomingMessages.length - 1];
      if (lastMessage && Array.isArray(lastMessage.content)) {
          hasImage = lastMessage.content.some((part: any) => part.type === 'image_url');
      }

      // If image detected, ensure a vision model is selected
      if (hasImage) {
          // List of known vision models (add others if needed)
          const visionModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-vision-preview', 'gpt-4-turbo']; // Removed non-vision ones
          if (!visionModels.includes(modelToUse)) {
              Logger.warn(`[API Explain Attempt ${attempt}] Frontend requested non-vision model '${modelToUse}' for image input. Overriding to 'gpt-4o-mini'.`);
              modelToUse = 'gpt-4o-mini'; // Override to a capable model
          }
          Logger.log(`[API Explain Attempt ${attempt}] Image detected. Using vision model: ${modelToUse}`);
      } else {
          // If no image, you could potentially use a cheaper text-only model if preferred,
          // but gpt-4o-mini handles text well too. Sticking with selected/default.
          Logger.log(`[API Explain Attempt ${attempt}] No image detected. Using model: ${modelToUse}`);
      }
      // --- End Model Selection ---

      // --- System Prompt ---
      // Keep it general to handle both text and image requests
      const systemPrompt = `You are a helpful LaTeX assistant integrated into an editor environment.
Analyze the user's request, provided context (LaTeX files, if any), and any attached images.
Provide concise explanations, generate requested LaTeX code snippets, or describe images as asked.
If asked to describe an image containing an equation or formula, attempt to provide the LaTeX code for that equation.
Format any LaTeX code examples using markdown code blocks (\`\`\`latex ... \`\`\`).
Keep responses clear and suitable for a chat interface. Focus on directly addressing the user's request.`;
      // --- End System Prompt ---

      // --- Prepare Messages Array for OpenAI ---
      // Ensure the structure matches ChatCompletionMessageParam[]
      const requestMessages: ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        // Map incoming messages, ensuring content format is correct
        ...incomingMessages.map((msg: { role: 'user' | 'assistant' | 'system'; content: string | InputContentPart[] }) => ({
            role: msg.role,
            // Content must be string OR array of valid ChatCompletionContentPart objects
            content: typeof msg.content === 'string'
                ? msg.content // Pass string content directly
                : Array.isArray(msg.content)
                    ? msg.content.map((part: InputContentPart) => {
                        // Validate and format each part for the API
                        if (part.type === 'text' && typeof part.text === 'string') {
                            return { type: 'text', text: part.text } as ChatCompletionContentPart;
                        } else if (part.type === 'image_url' && part.image_url && typeof part.image_url.url === 'string') {
                            // Ensure URL is valid data URL or HTTPS URL for OpenAI
                            if (!part.image_url.url.startsWith('data:image') && !part.image_url.url.startsWith('https')) {
                                Logger.warn(`[API Explain] Invalid image URL format skipped: ${part.image_url.url.substring(0,50)}...`);
                                return null; // Skip invalid parts
                            }
                            return { type: 'image_url', image_url: { url: part.image_url.url } } as ChatCompletionContentPart;
                        } else {
                            Logger.warn('[API Explain] Invalid content part structure skipped:', part);
                            return null; // Skip invalid parts
                        }
                      }).filter(Boolean) as ChatCompletionContentPart[] // Filter out nulls
                    : "" // Default to empty string if content is invalid type
        }))
      ];

      // Log structure of the final message array being sent
      Logger.log(`[API Explain Attempt ${attempt}] Sending ${requestMessages.length} messages to OpenAI.`);
      const lastMsgForLog = requestMessages[requestMessages.length-1];
      if(lastMsgForLog && Array.isArray(lastMsgForLog.content)){
          Logger.log(`[API Explain Attempt ${attempt}] Last message content parts:`, lastMsgForLog.content.map(p => p.type));
      }
      // --- End Message Preparation ---


      // --- Call OpenAI API ---
      Logger.log(`[API Explain Attempt ${attempt}] Sending request to OpenAI API...`);
      const openAiResponse = await openai.chat.completions.create({
          model: modelToUse,
          messages: requestMessages, // Pass the correctly typed array
          temperature: 0.5,
          max_tokens: 1500,
      });
      // --- End OpenAI API Call ---

      Logger.log(`[API Explain Attempt ${attempt}] OpenAI API call successful.`);

      const explanationContent = openAiResponse.choices?.[0]?.message?.content || null;

      // --- Validation ---
      if (!explanationContent || explanationContent.trim() === '') {
          // Handle missing content + retry logic (same as before)
          Logger.error(`[API Explain Attempt ${attempt}] Validation Failed: OpenAI response missing content.`);
          if (attempt < MAX_RETRIES) { /* ... retry ... */ continue; }
          else { return NextResponse.json({ error: "Failed to get valid content from AI after retries." }, { status: 500 }); }
      }
      // --- End Validation ---

      Logger.log(`[API Explain Attempt ${attempt}] Explanation/Content received length: ${explanationContent.length}`);

      // SUCCESS: Return the content
      return NextResponse.json({ explanation: explanationContent }); // Keep 'explanation' key for consistency

    } catch (error: any) {
       // --- Error Handling & Retry Logic (same as before) ---
       Logger.error(`[API Explain Attempt ${attempt}] Error during OpenAI API call or processing:`, error);
       let statusCode = 500;
       let errorMessage = 'Internal Server Error processing explanation request.';
       if (error.status) { statusCode = error.status; errorMessage = error.message || `OpenAI API Error (${statusCode})`; }
       else if (error instanceof Error) { errorMessage = error.message; }

       if (attempt <= MAX_RETRIES) {
           Logger.warn(`[API Explain Attempt ${attempt}] Retrying after error: ${errorMessage}`);
           await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
           continue; // Go to next iteration
       } else {
           return NextResponse.json({ error: `Failed after ${attempt} attempts: ${errorMessage}`, details: error instanceof Error ? error.stack : String(error) }, { status: statusCode });
       }
    }
  } // End while loop

  Logger.error("[API Explain] Exited retry loop unexpectedly.");
  return NextResponse.json({ error: 'Max retries exceeded or unexpected loop exit.' }, { status: 500 });
}