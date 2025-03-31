// File: src/app/api/openai-search-replace/route.ts
import { NextResponse } from 'next/server';

const Logger = console;
const MAX_RETRIES = 1; // Limit retries for fallback

// Define the expected structure for search/replace blocks
interface SearchReplaceBlock {
    search: string;
    replace: string;
    explanation?: string; // Optional explanation per block
}

// Helper to parse search/replace blocks from LLM response
// Expects format like:
// ```search_replace
// <<<<<<< SEARCH
// [Code to find, including context]
// =======
// [Code to replace with]
// >>>>>>> REPLACE
// ```
// OR a JSON array of {search: "", replace: ""} objects
function extractSearchReplaceBlocks(rawContent: string): SearchReplaceBlock[] {
    const blocks: SearchReplaceBlock[] = [];
    const delimiterRegex = /<<<<<<< SEARCH\s*([\s\S]*?)\s*=======\s*([\s\S]*?)\s*>>>>>>> REPLACE/g;
    let match;

    // Try parsing delimited blocks first
    while ((match = delimiterRegex.exec(rawContent)) !== null) {
        const searchBlock = match[1].trim();
        const replaceBlock = match[2].trim();
        if (searchBlock) { // Search block cannot be empty
             blocks.push({ search: searchBlock, replace: replaceBlock });
        }
    }

    // If no delimited blocks found, try parsing as JSON array
    if (blocks.length === 0) {
        try {
             // Clean potential markdown fences
             let cleanedContent = rawContent.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
             const jsonStart = cleanedContent.indexOf('['); // Look for array start
             const jsonEnd = cleanedContent.lastIndexOf(']');
             if (jsonStart !== -1 && jsonEnd > jsonStart) {
                 const jsonString = cleanedContent.substring(jsonStart, jsonEnd + 1);
                 const parsedArray = JSON.parse(jsonString);
                 if (Array.isArray(parsedArray)) {
                     parsedArray.forEach(item => {
                         if (item && typeof item.search === 'string' && typeof item.replace === 'string') {
                             blocks.push({ search: item.search, replace: item.replace, explanation: item.explanation });
                         }
                     });
                      Logger.log(`[API S/R] Parsed ${blocks.length} blocks from JSON array.`);
                 }
             }
        } catch (e) {
             Logger.warn("[API S/R] Failed to parse fallback response as JSON array:", e);
        }
    } else {
        Logger.log(`[API S/R] Extracted ${blocks.length} delimited search/replace blocks.`);
    }


    return blocks;
}


export async function POST(request: Request) {
  let requestBody;
  try {
    requestBody = await request.json();
  } catch (e) {
    Logger.error("[API S/R] Failed to parse request JSON:", e);
    return NextResponse.json({ error: 'Invalid request body. Expected JSON.' }, { status: 400 });
  }
  const { model, messages, temperature, max_tokens } = requestBody || {};

  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    attempt++;
    Logger.log(`[API S/R Attempt ${attempt}] Processing request for model: ${model || 'gpt-4o (defaulted)'}`);

    try {
      const modelToUse = model || 'gpt-4o';
      if (!modelToUse) {
        return NextResponse.json({ error: 'Model parameter missing.' }, { status: 400 });
      }

      // --- SYSTEM PROMPT for SEARCH/REPLACE FALLBACK ---
      const systemPrompt = `You are a LaTeX code editing assistant. You previously attempted to generate a unified diff for a user request, but it failed or was invalid.
Your task now is to provide the same code modification using a **SEARCH and REPLACE** format.

**Instructions:**
1.  Identify the EXACT block of original code that needs to be changed (the SEARCH block). Include at least 3 lines of context *before* AND *after* the specific lines being modified to ensure the SEARCH block is unique within the file.
2.  Determine the NEW block of code that should replace the original block (the REPLACE block).
3.  Format the output STRICTLY as a JSON object with two keys: \`explanation\` (string) and \`search_replace_blocks\` (array of objects).
4.  The \`explanation\` should briefly describe the change.
5.  Each object in the \`search_replace_blocks\` array MUST have two string keys: \`search\` and \`replace\`.
    - The \`search\` value is the exact, multi-line block of original code (including context) to find.
    - The \`replace\` value is the exact, multi-line block of new code to substitute.
6.  Preserve ALL original whitespace and indentation within the \`search\` and \`replace\` strings. Escape special JSON characters within the strings (e.g., newlines as '\\n', quotes as '\\"', backslashes as '\\\\').
7.  If multiple distinct changes are needed, include multiple objects in the \`search_replace_blocks\` array.
8.  Ensure the \`search\` block is unique enough to be found reliably. If it's not unique, add more context lines.

**Output ONLY the JSON structure:**
\`\`\`json
{
  "explanation": "Replaced the introduction paragraph with new text.",
  "search_replace_blocks": [
    {
      "search": "Context line before 1\\nContext line before 2\\nContext line before 3\\nORIGINAL LINE 1 TO REPLACE\\nORIGINAL LINE 2 TO REPLACE\\nContext line after 1\\nContext line after 2\\nContext line after 3",
      "replace": "Context line before 1\\nContext line before 2\\nContext line before 3\\nNEW REPLACEMENT LINE 1\\nNEW REPLACEMENT LINE 2\\nContext line after 1\\nContext line after 2\\nContext line after 3"
    }
  ]
}
\`\`\`
Do NOT include markdown fences (\`\`\`) around the final JSON output.`;
      // --- END SEARCH/REPLACE PROMPT ---

      const requestMessages = [
        { role: "system", content: systemPrompt },
        ...(messages || []),
      ];

      Logger.log(`[API S/R Attempt ${attempt}] Sending request to OpenAI API with model: ${modelToUse}`);
      const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { /* ... headers ... */ Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: modelToUse,
          messages: requestMessages,
          temperature: temperature ?? 0.3, // Slightly higher temp might help find context
          max_tokens: max_tokens ?? 3000,
          response_format: { type: "json_object" } // Request JSON output
        }),
      });

      Logger.log(`[API S/R Attempt ${attempt}] OpenAI Response Status: ${openAiResponse.status}`);

      if (!openAiResponse.ok) {
        const errorText = await openAiResponse.text();
         Logger.error(`[API S/R Attempt ${attempt}] OpenAI API Error (${openAiResponse.status}): ${errorText}`);
         if (attempt < MAX_RETRIES && openAiResponse.status >= 500) {
           Logger.warn(`[API S/R Attempt ${attempt}] Retrying after server error...`);
           await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
           continue;
         } else {
           return NextResponse.json({ error: `OpenAI API Error: ${errorText}` }, { status: openAiResponse.status });
         }
      }

      const data = await openAiResponse.json();
      const rawContent = data.choices?.[0]?.message?.content || "";
      Logger.log(`[API S/R Attempt ${attempt}] Raw content received length: ${rawContent.length}`);

      // --- Parse JSON Response ---
      let parsedData: { explanation?: string; search_replace_blocks?: SearchReplaceBlock[] } = {};
      let extractionError = null;
       try {
           parsedData = JSON.parse(rawContent);
           if (!parsedData.explanation || !Array.isArray(parsedData.search_replace_blocks) || !parsedData.search_replace_blocks.every(b => b && typeof b.search === 'string' && typeof b.replace === 'string')) {
               throw new Error("Parsed JSON missing required fields or invalid block structure.");
           }
           Logger.log(`[API S/R Attempt ${attempt}] Successfully parsed JSON response. Found ${parsedData.search_replace_blocks.length} blocks.`);
       } catch (e) {
           Logger.error(`[API S/R Attempt ${attempt}] Failed to parse expected JSON: ${e}. Raw content: ${rawContent.substring(0, 300)}...`);
           extractionError = e; // Store error
       }
      // --- End Parsing ---

      // --- Validation ---
      if (extractionError || !parsedData.search_replace_blocks || (parsedData.search_replace_blocks.length === 0 && (parsedData.explanation || '').toLowerCase().includes('change'))) {
          Logger.error(`[API S/R Attempt ${attempt}] Validation Failed: Could not extract valid search/replace blocks.`);
          if (attempt < MAX_RETRIES) {
              Logger.warn(`[API S/R Attempt ${attempt}] Retrying due to extraction/validation failure...`);
              await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
              continue;
          } else {
              return NextResponse.json({ error: "Failed to extract valid search/replace blocks from AI fallback response after retries.", details: extractionError instanceof Error ? extractionError.message : String(extractionError) }, { status: 500 });
          }
      }
      // --- End Validation ---

      // SUCCESS: Return explanation and search/replace blocks
      return NextResponse.json({
        explanation: parsedData.explanation,
        search_replace_blocks: parsedData.search_replace_blocks,
      });

    } catch (error) {
       Logger.error(`[API S/R Attempt ${attempt}] Internal Server Error:`, error);
        if (attempt < MAX_RETRIES) {
            Logger.warn(`[API S/R Attempt ${attempt}] Retrying after internal error...`);
             await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
        } else {
            return NextResponse.json({ error: 'Internal Server Error generating search/replace fallback.', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
        }
    }
  }
  Logger.error("[API S/R] Exited retry loop unexpectedly.");
  return NextResponse.json({ error: 'Max retries exceeded generating search/replace fallback.' }, { status: 500 });
}