// File: src/app/api/openai-edit/route.ts
import { NextResponse } from 'next/server';

// Logger replacement using console
const Logger = console;
const MAX_RETRIES = 2; // Allow retries for API errors or bad formats

/**
 * Helper function to extract ```diff blocks from raw LLM output.
 * Also handles cases where the entire response might be a diff without fences.
 */
function extractDiffBlocks(rawContent: string): string[] {
  // Regex specifically targets ```diff blocks
  const diffRegex = /```diff\s*([\s\S]*?)\s*```/g;
  const blocks: string[] = [];
  let match;
  while ((match = diffRegex.exec(rawContent)) !== null) {
    // Trim whitespace and ensure essential diff markers exist
    const blockContent = match[1].trim();
    // Check for standard diff structure markers
    if (blockContent.includes('@@') && blockContent.includes('--- ') && blockContent.includes('+++ ')) {
      blocks.push(blockContent);
    } else {
      Logger.warn("[Edit API] Skipping extracted block missing required diff markers (@@, ---, +++):", blockContent.substring(0, 150));
    }
  }
  // Fallback: If no properly fenced blocks, check if the entire raw content might be a valid diff
  if (blocks.length === 0) {
    const trimmedContent = rawContent.trim();
    if (trimmedContent.includes('--- ') && trimmedContent.includes('+++ ') && trimmedContent.includes('@@') && trimmedContent.split('\n').some(line => line.startsWith('+') || line.startsWith('-'))) {
      Logger.warn("[Edit API] No fenced diff blocks found, attempting to treat entire response as a single diff.");
      blocks.push(trimmedContent);
    } else {
      Logger.warn("[Edit API] No valid diff structure found in the response (checked fences and raw content).");
    }
  }
  return blocks;
}

export async function POST(request: Request) {
  // Read the body ONCE before the retry loop
  let requestBody;
  try {
    requestBody = await request.json();
  } catch (e) {
    Logger.error("[API Edit] Failed to parse request JSON:", e);
    return NextResponse.json({ error: 'Invalid request body. Expected JSON.' }, { status: 400 });
  }

  // Destructure after successful parsing, providing defaults
  const { model, messages, temperature, max_tokens } = requestBody || {};

  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    attempt++; // Increment attempt counter at the beginning
    Logger.log(`[API Edit Attempt ${attempt}] Processing request for model: ${model || 'gpt-4o (defaulted)'}`);

    try {
      // Explicitly define the model to use
      const modelToUse = model || 'gpt-4o';
      if (!modelToUse) {
        Logger.error(`[API Edit Attempt ${attempt}] Critical Error: No valid model specified or defaulted.`);
        return NextResponse.json({ error: 'Model parameter is missing and could not be defaulted.' }, { status: 400 });
      }

      // File: src/app/api/openai-edit/route.ts (Replace the systemPrompt constant)

      const systemPrompt = `You are an expert LaTeX code editing assistant. You will be given context including the full content of the current LaTeX file and user instructions for modifications.
Your task is to generate ONLY the code modifications formatted as one or more standard **unified diffs**.

**Unified Diff Formatting Rules:**

1.  **File Paths:** Start each diff string with file paths like:
    \`\`\`
    --- a/path/to/file.tex
    +++ b/path/to/file.tex
    \`\`\`
    Use \`--- /dev/null\` for new files.

2.  **Hunk Header:** Follow file paths with standard hunk headers like \`@@ -old_start,old_lines +new_start,new_lines @@\`.
    - \`old_start\` and \`new_start\` are the starting line numbers in the original and new file respectively (1-based).
    - \`old_lines\` is the total number of lines represented in the original section (context lines + removed lines).
    - \`new_lines\` is the total number of lines represented in the new section (context lines + added lines).
    - **CRITICAL: \`old_lines\` MUST exactly match the count of '-' and ' ' lines following the header.**
    - **CRITICAL: \`new_lines\` MUST exactly match the count of '+' and ' ' lines following the header.**

3.  **Context Lines:** Include exactly 3 lines of context (starting with a space ' ') before and after the changed lines, where possible. Context lines MUST be identical to the original file content.

4.  **Removed Lines:** Mark lines to be removed with a minus sign '-' at the beginning.

5.  **Added Lines:** Mark lines to be added with a plus sign '+' at the beginning.

6.  **Exact Matching:** Context lines (' ') and removed lines ('-') MUST exactly match the corresponding lines in the original file content, including ALL whitespace, indentation, and line endings (\\n). This is essential.

7.  **Changing Blocks:** When modifying a multi-line block (like an environment, itemize, equation, paragraph), the most reliable diff often involves removing the entire old block (-) and adding the entire new block (+), surrounded by the required 3 context lines.

8.  **Multiple Files/Sections:** Generate a separate, complete diff string (starting with file paths and hunk header) for each distinct file being modified OR for non-contiguous changes within the same file.

9.  **Fenced Output:** Place each complete diff string inside its own fenced code block:
    \`\`\`diff
    --- a/path/to/file.tex
    +++ b/path/to/file.tex
    @@ -5,3 +5,4 @@
     Line 4 context
     Line 5 context
     Line 6 context
    -Line 7 removed
    +Line 7 added replacement
    +Line 8 added new
     Line 9 context
     Line 10 context
     Line 11 context
    \`\`\`

10. **Output ONLY Diff Blocks:** Your entire response must consist *only* of one or more \`\`\`diff ... \`\`\` blocks. Do NOT include any explanations, summaries, greetings, comments, apologies, or any other text outside these blocks. If no changes are needed based on the request or context, output nothing or just empty fences (\`\`\`diff\\n\`\`\`) indicating no changes.

**Example of Correct Output Structure:**
\`\`\`diff
--- a/example.tex
+++ b/example.tex
@@ -10,7 +10,8 @@
 Some context line before.
 Another context line.
 Third context line.
-This line will be replaced.
+This is the replacement line.
+This is an added line.
 Context line after.
 Second context line after.
 Third context line after.
\`\`\`
\`\`\`diff
--- a/another_file.tex
+++ b/another_file.tex
@@ -1,4 +1,5 @@
-\\documentclass{article}
-\\usepackage{amsmath}
-\\begin{document}
+\\usepackage{amsmath}
+\\begin{document}
+Hello World!
-\\end{document}
+\\end{document}
\`\`\`
`;
      // --- END DIFF-ONLY PROMPT ---

      const requestMessages = [
        { role: "system", content: systemPrompt },
        ...(messages || []), // Use messages from parsed body
      ];

      Logger.log(`[API Edit Attempt ${attempt}] Sending request to OpenAI API with model: ${modelToUse}`);
      const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}` // Ensure API key is set
        },
        body: JSON.stringify({
          model: modelToUse,
          messages: requestMessages,
          temperature: temperature ?? 0.1, // Low temp for precise diffs
          max_tokens: max_tokens ?? 3000, // Default max tokens
          // No response_format needed, expect raw text diff
        }),
      });

      Logger.log(`[API Edit Attempt ${attempt}] OpenAI Response Status: ${openAiResponse.status}`);

      if (!openAiResponse.ok) {
        const errorText = await openAiResponse.text();
        Logger.error(`[API Edit Attempt ${attempt}] OpenAI API Error (${openAiResponse.status}): ${errorText}`);
        // Only retry on 5xx server errors or potential network issues
        if (attempt < MAX_RETRIES && openAiResponse.status >= 500) {
          Logger.warn(`[API Edit Attempt ${attempt}] Retrying after server error...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue; // Go to next iteration
        } else {
          // Don't retry 4xx or if retries exceeded
          return NextResponse.json({ error: `OpenAI API Error: ${errorText}` }, { status: openAiResponse.status });
        }
      }

      // --- Process successful response ---
      const data = await openAiResponse.json();
      // Ensure choices exist before accessing
      const rawContent = data.choices?.[0]?.message?.content || "";
      Logger.log(`[API Edit Attempt ${attempt}] Raw content received length: ${rawContent.length}`);

      // --- Extract Diff Blocks ---
      const edits = extractDiffBlocks(rawContent);
      Logger.log(`[API Edit Attempt ${attempt}] Extracted ${edits.length} diff blocks.`);

      // --- Validation ---
      const trimmedRaw = rawContent.trim();
      // Treat empty response or just empty fences as "no changes needed", not an error
      const isEmptyOrJustFences = trimmedRaw === '' || trimmedRaw === '```diff' || trimmedRaw === '```diff```' || trimmedRaw === '```diff\n```';

      // Error only if response had meaningful content but we couldn't extract valid diffs
      if (!isEmptyOrJustFences && edits.length === 0) {
        Logger.error(`[API Edit Attempt ${attempt}] Validation Failed: Received non-empty response but failed to extract valid diff blocks. Check LLM output format.`);
        if (attempt < MAX_RETRIES) {
          Logger.warn(`[API Edit Attempt ${attempt}] Retrying due to diff extraction failure...`);
          await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
          continue; // Retry the whole process
        } else {
          // Failed after retries
          return NextResponse.json({ error: "Failed to extract valid diff edits from AI response after retries.", rawResponse: rawContent.substring(0, 300) + '...' }, { status: 500 });
        }
      }
      // --- End Validation ---

      // SUCCESS: Return ONLY the edits array
      Logger.log(`[API Edit Attempt ${attempt}] Request successful. Returning ${edits.length} edits.`);
      // Ensure the response format matches what chatService expects
      return NextResponse.json({ edits: edits });

    } catch (error) {
      Logger.error(`[API Edit Attempt ${attempt}] Internal Server Error in Edit route:`, error);
      if (attempt < MAX_RETRIES) {
        Logger.warn(`[API Edit Attempt ${attempt}] Retrying after internal error...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue; // Go to next iteration
      } else {
        // Max retries reached for internal errors
        return NextResponse.json({
          error: 'Internal Server Error generating edits after retries.',
          details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
      }
    }
  } // End while loop

  // Fallback if loop finishes unexpectedly
  Logger.error("[API Edit] Exited retry loop unexpectedly.");
  return NextResponse.json({ error: 'Max retries exceeded generating edits or unexpected loop exit.' }, { status: 500 });
}