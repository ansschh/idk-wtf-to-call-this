// File: src/app/api/openai/route.ts
import { NextResponse } from 'next/server';
const MAX_RETRIES = 2; // Allow one retry if extraction fails

export async function POST(request: Request) {
  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    try {
      const { model, messages, temperature, max_tokens } = await request.json();
      console.log(`[API Attempt ${attempt + 1}] Received request for model: ${model}`);

      const systemPrompt =
        "You are a LaTeX assistant. You are provided with context including the entire project file tree and the full content of the current LaTeX file, as well as user instructions for modifications. " +
        "Your task is to output your answer strictly in JSON format with exactly two keys: " +
        "`explanation` (string) and `fullLatex` (string). " +
        "`explanation` should be a concise summary of the changes made, suitable for display in a chat window. " +
        "In your explanation, ALWAYS be specific about where your changes should be applied (e.g., 'after line 15', 'in the introduction section'). " +
        "`fullLatex` MUST contain the COMPLETE, VALID, UPDATED LaTeX document code (including the preamble and document environment) with all modifications applied, ready to be inserted directly into the editor. " +
        "Ensure the `fullLatex` string is properly escaped for JSON (e.g., newlines as '\\n', quotes as '\\\"'). " +
        "Output ONLY the JSON structure, with no surrounding text, comments, or markdown formatting like ```json.";

      const requestMessages = [
        { role: "system", content: systemPrompt },
        ...messages,
      ];

      console.log(`[API Attempt ${attempt + 1}] Sending request to OpenAI API...`);
      const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-4o', // Default to gpt-4o if not specified
          messages: requestMessages,
          temperature: temperature ?? 0.3, // Lower temp for more deterministic structure
          max_tokens: max_tokens ?? 3500, // Increased slightly
          response_format: { type: "json_object" } // Explicitly ask for JSON output if model supports it
        }),
      });

      console.log(`[API Attempt ${attempt + 1}] OpenAI Response Status: ${openAiResponse.status}`);

      if (!openAiResponse.ok) {
        const errorText = await openAiResponse.text();
        Logger.error(`[API Attempt ${attempt + 1}] OpenAI API Error (${openAiResponse.status}): ${errorText}`);
        // Don't retry on explicit API errors like 4xx
        if (openAiResponse.status >= 400 && openAiResponse.status < 500) {
             return NextResponse.json({ error: `OpenAI API Error: ${errorText}` }, { status: openAiResponse.status });
        }
        // Retry on server errors (5xx) or network issues
        if (attempt < MAX_RETRIES) {
          attempt++;
          Logger.warn(`[API Attempt ${attempt}] Retrying after error...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
          continue;
        } else {
             return NextResponse.json({ error: `OpenAI API Error after retries: ${errorText}` }, { status: openAiResponse.status });
        }
      }

      const data = await openAiResponse.json();
      const rawContent = data.choices?.[0]?.message?.content || "";
      console.log(`[API Attempt ${attempt + 1}] Raw content received length: ${rawContent.length}`);

      let parsedData: { explanation?: string; fullLatex?: string } = {};
      let extractionMethod = "None";

      // STRATEGY 1: Try direct JSON parsing (most reliable if LLM follows instructions)
      try {
        parsedData = JSON.parse(rawContent);
        if (parsedData.explanation && parsedData.fullLatex) {
           extractionMethod = "Direct JSON Parse";
           console.log(`[API Attempt ${attempt + 1}] Extracted via Direct JSON Parse`);
        } else {
           parsedData = {}; // Reset if keys are missing
        }
      } catch (e) {
        Logger.warn(`[API Attempt ${attempt + 1}] Direct JSON parse failed. Trying fallback extraction.`);
         // Fallback strategies if direct parsing fails
         try {
            // Remove potential markdown fences
            const cleanedContent = rawContent
                .replace(/^```json\s*/, '')
                .replace(/\s*```$/, '');

            // Find the outermost JSON object
            const jsonStart = cleanedContent.indexOf('{');
            const jsonEnd = cleanedContent.lastIndexOf('}');

            if (jsonStart !== -1 && jsonEnd > jsonStart) {
               const jsonString = cleanedContent.substring(jsonStart, jsonEnd + 1);
               parsedData = JSON.parse(jsonString);
               if (parsedData.explanation && parsedData.fullLatex) {
                    extractionMethod = "Cleaned JSON Parse";
                    console.log(`[API Attempt ${attempt + 1}] Extracted via Cleaned JSON Parse`);
               } else {
                   parsedData = {};
               }
            }
         } catch (e2) {
             Logger.warn(`[API Attempt ${attempt + 1}] Cleaned JSON parse also failed. Raw content might not be JSON.`);
             parsedData = {}; // Ensure it's reset
         }
      }

      const explanation = parsedData.explanation || "Could not extract explanation.";
      let fullLatex = parsedData.fullLatex || "";

      // STRATEGY 2: If fullLatex is still missing, maybe the LLM just output the code directly
       if (!fullLatex && rawContent.includes("\\documentclass")) {
           // Assume the entire raw content (or a large part of it) is the LaTeX
           fullLatex = rawContent.trim();
           extractionMethod = "Raw Content Fallback";
           console.log(`[API Attempt ${attempt + 1}] Extracted via Raw Content Fallback`);
       }

      console.log(`[API Attempt ${attempt + 1}] Final Explanation length: ${explanation.length}`);
      console.log(`[API Attempt ${attempt + 1}] Final fullLatex length: ${fullLatex.length}`);
      console.log(`[API Attempt ${attempt + 1}] Extraction Method: ${extractionMethod}`);

      if (!fullLatex || fullLatex.length < 50 || !fullLatex.includes("\\documentclass")) {
        Logger.error(`[API Attempt ${attempt + 1}] Failed to extract valid LaTeX content.`);
        if (attempt < MAX_RETRIES) {
          attempt++;
          Logger.warn(`[API Attempt ${attempt}] Retrying due to invalid content...`);
           await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue; // Retry the whole process
        } else {
          return NextResponse.json({
            error: "Failed to extract valid LaTeX content from the AI response after retries.",
            details: `Extraction Method: ${extractionMethod}. Raw response length: ${rawContent.length}.`,
            rawResponse: rawContent.substring(0, 500) + (rawContent.length > 500 ? '...' : '') // Include partial raw response for debugging
          }, { status: 500 });
        }
      }

      // SUCCESS: Return the structured response
      return NextResponse.json({
        content: explanation, // User-facing explanation
        suggestions: [{ text: fullLatex }], // The full code for diffing/applying
      });

    } catch (error) {
      Logger.error(`[API Attempt ${attempt + 1}] Internal Server Error in OpenAI route:`, error);
      if (attempt < MAX_RETRIES) {
          attempt++;
          Logger.warn(`[API Attempt ${attempt}] Retrying after internal error...`);
           await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
      } else {
           return NextResponse.json({
             error: 'Internal Server Error',
             details: error instanceof Error ? error.message : String(error)
           }, { status: 500 });
      }
    }
  }
  // Should not be reached if retries are handled correctly, but satisfy TypeScript
  return NextResponse.json({ error: 'Max retries exceeded without success.' }, { status: 500 });
}