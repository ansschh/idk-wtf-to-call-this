// utils/editorUtils.ts
import { EditorView, ViewUpdate } from '@codemirror/view';
import React from 'react';
import { applyPatch, parsePatch, createPatch } from 'diff'; // Import from 'diff' library
import { LaTeXNode, LaTeXTreeProcessor } from './LaTeXTreeProcessor'; // If needed for other utils
import { EditIntentAnalyzer } from './EditIntentAnalyzer'; // If needed for other utils
import { DocumentContextManager } from './DocumentContextManager'; // If needed for other utils
const Logger = console;


/**
 * Applies multiple unified diff patch strings sequentially to the editor's current content.
 * Stops and returns error if any patch fails.
 * Applies the final result in a single transaction if all patches succeed.
 */

// Interface for search/replace blocks
interface SearchReplaceBlock {
  search: string;
  replace: string;
  explanation?: string; // Optional explanation if provided by LLM
}



export const applyMultipleUnifiedDiffPatches = (
  editorRef: React.RefObject<{ view?: EditorView } | null>,
  hunks: string[]
): { success: boolean; finalContent?: string; error?: string; failedHunkIndex?: number } => {
  if (!editorRef?.current?.view) {
    console.error("Editor view reference is not available for patching.");
    return { success: false, error: "Editor view not available" };
  }

  const view = editorRef.current.view;
  const initialContent = view.state.doc.toString(); // Store initial content
  let currentContent = initialContent; // Content to be modified step-by-step

  console.log(`Starting patch application. Initial length: ${initialContent.length}, Hunks: ${hunks.length}`);

  try {
    if (!Array.isArray(hunks)) {
         throw new Error("Invalid hunks format: Expected an array of strings.");
    }

    for (let i = 0; i < hunks.length; i++) {
      const hunk = hunks[i];
       if (typeof hunk !== 'string') {
           console.warn(`Skipping invalid hunk at index ${i}. Expected string.`);
           continue; // Skip non-string items
       }

      console.log(`Attempting to apply Hunk ${i + 1}/${hunks.length}`);

      // Try applying cleanly first
      let result = applyPatch(currentContent, hunk);

      if (result === false) {
        // Try fuzzy patching if clean apply fails
         console.warn(`Hunk ${i + 1}: Clean patch failed, trying fuzzy patching.`);
         try {
             const parsed = parsePatch(hunk);
             // Attempt to apply each part of the parsed patch using fuzziness
             let fuzzyResult: string | false = currentContent; // Start with content before this hunk
             let hunkPartiallyApplied = true;
             for (const patchPart of parsed) {
                 const partResult = applyPatch(fuzzyResult, patchPart, { fuzzFactor: 2 }); // Adjust fuzzFactor if needed
                 if (partResult === false) {
                     hunkPartiallyApplied = false;
                      console.error(`Fuzzy patching failed for part of hunk ${i + 1}:`, patchPart);
                     break; // Stop applying parts of this hunk if one fails
                 }
                 fuzzyResult = partResult; // Update content for next part
             }
             result = hunkPartiallyApplied ? fuzzyResult : false; // Use fuzzy result only if all parts applied
         } catch (parseError) {
              console.error(`Error parsing hunk ${i+1} for fuzzy patching:`, parseError);
              result = false; // Treat parse error as patch failure
         }
      }

      if (result === false) {
        // Patch failed even with fuzziness
        const errorMsg = `Patch application failed for Hunk ${i + 1}. Changes up to this point were not applied to the editor.`;
        console.error(errorMsg, "Failed Hunk Content (first 200 chars):", hunk.substring(0, 200));
        // Maybe log currentContent vs hunk context lines here for debugging
        return { success: false, error: errorMsg, failedHunkIndex: i };
      }

      // Update the content for the next iteration
      const contentBeforeHunk = currentContent;
      currentContent = result;
      console.log(`Hunk ${i + 1} applied successfully. Content length changed from ${contentBeforeHunk.length} to ${currentContent.length}.`);
    }

    // --- All hunks applied successfully in memory ---

    // Check if the final content is actually different from the initial editor state
    if (currentContent === initialContent) {
      console.warn("All patches applied, but resulted in no change to the initial editor content.");
      return { success: true, finalContent: currentContent }; // Success, but no editor update needed
    }

    // Apply the single, final result to the editor instance
    console.log(`Applying final combined changes to editor. Final length: ${currentContent.length}`);
    view.dispatch({
      changes: { from: 0, to: initialContent.length, insert: currentContent }
    });

    console.log("All unified diff patches applied successfully to editor.");
    return { success: true, finalContent: currentContent };

  } catch (error) {
    console.error("Error during sequential patch application process:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error during patch application process",
      failedHunkIndex: -1 // Indicates error wasn't specific to a hunk index during the loop logic itself
    };
  }
};


/**
 * Applies search-and-replace blocks sequentially to the editor content.
 * Uses simple string replacement and stops if a search block is not found or not unique.
 */
export const applySearchReplaceBlocks = (
  editorRef: React.RefObject<{ view?: EditorView } | null>,
  blocks: SearchReplaceBlock[]
): { success: boolean; finalContent?: string; error?: string; failedBlockIndex?: number } => {
  if (!editorRef?.current?.view) {
      Logger.error("Editor view reference is not available for search/replace.");
      return { success: false, error: "Editor view not available" };
  }

  const view = editorRef.current.view;
  const initialContent = view.state.doc.toString();
  let currentContent = initialContent; // Start with current editor content
  const changes = []; // Collect changes for a single transaction

  Logger.log(`Starting search/replace application. Blocks: ${blocks.length}`);

  try {
       if (!Array.isArray(blocks)) {
           throw new Error("Invalid search/replace blocks format: Expected an array.");
       }

      for (let i = 0; i < blocks.length; i++) {
          const block = blocks[i];
           if (!block || typeof block.search !== 'string' || typeof block.replace !== 'string') {
               Logger.warn(`Skipping invalid block at index ${i}.`);
               continue;
           }

          const searchStr = block.search;
          const replaceStr = block.replace;

          Logger.log(`Applying Block ${i + 1}/${blocks.length}: Searching for:\n${searchStr.substring(0,100)}...`);

          // --- Simple String Search (Find first occurrence) ---
          // Note: This is less robust than aider's fuzzy/contextual search.
          // It relies heavily on the LLM providing enough UNIQUE context in the search block.
          const startIndex = currentContent.indexOf(searchStr);

          if (startIndex === -1) {
              const errorMsg = `Search/Replace failed at Block ${i + 1}: The exact 'search' text was not found in the current document content. The content might have changed or the AI provided incorrect context.`;
              Logger.error(errorMsg, "Search Text:", searchStr.substring(0, 200));
              return { success: false, error: errorMsg, failedBlockIndex: i };
          }

          // Check for uniqueness (simple check for now)
          const secondIndex = currentContent.indexOf(searchStr, startIndex + 1);
          if (secondIndex !== -1) {
              const errorMsg = `Search/Replace failed at Block ${i + 1}: The 'search' text was found multiple times. More context is needed from the AI.`;
               Logger.error(errorMsg, "Search Text:", searchStr.substring(0, 200));
              return { success: false, error: errorMsg, failedBlockIndex: i };
          }
          // --- End Search ---

          // Calculate change for CodeMirror transaction
          const endIndex = startIndex + searchStr.length;
          changes.push({ from: startIndex, to: endIndex, insert: replaceStr });

          // Update currentContent *in memory* for the next iteration's search
          currentContent = currentContent.substring(0, startIndex) + replaceStr + currentContent.substring(endIndex);
          Logger.log(`Block ${i + 1} applied in memory. New length: ${currentContent.length}`);
      }

      // --- All blocks processed successfully in memory ---

      if (changes.length === 0) {
           Logger.warn("Search/Replace finished, but no changes were applicable or needed.");
           return { success: true, finalContent: initialContent }; // No changes made
      }

      // Apply all collected changes in a single transaction to the editor
      Logger.log(`Applying ${changes.length} search/replace changes to editor...`);
      view.dispatch({ changes: changes });

      // Verify final content matches in-memory version (optional sanity check)
      const editorFinalContent = view.state.doc.toString();
      if (editorFinalContent !== currentContent) {
           Logger.error("Editor content mismatch after applying search/replace transaction!");
           // Fallback: Force editor state to match calculated state
           view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: currentContent } });
      }


      Logger.log("Search/Replace blocks applied successfully to editor.");
      return { success: true, finalContent: currentContent };

  } catch (error) {
      Logger.error("Error during search/replace application process:", error);
      return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error during search/replace",
          failedBlockIndex: -1 // Indicates general process error
      };
  }
};

/**
 * Applies a full content change to the editor instance.
 * Useful as a fallback or for specific actions.
 */
export const applyFullContentChange = (
  editorRef: React.RefObject<{ view?: EditorView } | null>,
  newContent: string
): boolean => {
  if (!editorRef?.current) {
    console.error("Editor reference is not available");
    return false;
  }

  try {
    // Check if it's a CodeMirror 6 view instance
    const view = editorRef.current.view;
    if (view && view instanceof EditorView) {
      const currentContentLength = view.state.doc.length;
      view.dispatch({
        changes: { from: 0, to: currentContentLength, insert: newContent }
      });
      console.log("Applied full content using CodeMirror 6 transaction.");
      return true;
    }

    // Fallback for other editor types (e.g., CodeMirror 5 via setValue)
    if (typeof (editorRef.current as any).setValue === 'function') {
      (editorRef.current as any).setValue(newContent);
      console.log("Applied full content using setValue.");
      return true;
    }

    console.error("No suitable method found (view.dispatch or setValue) to apply full content change.");
    return false;

  } catch (error) {
    console.error("Error applying full content change:", error);
    return false;
  }
};


export const applyUnifiedDiffPatch = (
  editorRef: React.RefObject<{ view?: EditorView } | null>,
  patchString: string
): { success: boolean; newContent?: string; error?: string } => {
  if (!editorRef?.current?.view) {
    console.error("Editor view reference is not available for patching.");
    return { success: false, error: "Editor view not available" };
  }

  const view = editorRef.current.view;
  const currentContent = view.state.doc.toString();

  try {
    // Apply the patch using the 'diff' library
    // The library might return false or throw an error on failure
    const patchedContent = applyPatch(currentContent, patchString);

    if (patchedContent === false) {
        // applyPatch returns false if the patch doesn't apply cleanly
         console.warn("Patch did not apply cleanly. Trying fuzzy patching.");
         // Attempt fuzzy patching (might produce unexpected results)
         const parsedPatches = parsePatch(patchString);
         let fuzzyPatchedContent = currentContent;
         let fuzzyApplied = true;
         for (const patch of parsedPatches) {
             const result = applyPatch(fuzzyPatchedContent, patch, { fuzzFactor: 2 }); // Adjust fuzzFactor as needed
             if (result === false) {
                 fuzzyApplied = false;
                 console.error("Fuzzy patching also failed for a hunk:", patch);
                 break; // Stop if any hunk fails even with fuzziness
             }
             fuzzyPatchedContent = result;
         }

         if (!fuzzyApplied) {
             return { success: false, error: "Patch application failed, even with fuzziness." };
         }
         patchedContent = fuzzyPatchedContent; // Use fuzzy result if it worked
    }


    // Check if the content actually changed
    if (patchedContent === currentContent) {
        console.warn("Patch applied, but resulted in no change to the content.");
        // Optionally treat this as success or failure depending on desired behavior
         return { success: true, newContent: patchedContent }; // Treat as success, but no state update needed later
    }

    // Apply the successful patch result to the editor
    view.dispatch({
      changes: { from: 0, to: currentContent.length, insert: patchedContent }
    });

    console.log("Unified diff patch applied successfully.");
    return { success: true, newContent: patchedContent };

  } catch (error) {
    console.error("Error applying unified diff patch:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error during patch application"
    };
  }
};




/**
 * Applies an edit based on a tree node analysis
 */
export const applyTreeBasedEdit = (
  editorRef: React.RefObject<any>,
  originalContent: string,
  suggestion: string,
  prompt: string
): boolean => {
  try {
    // Parse original content into tree
    const treeProcessor = new LaTeXTreeProcessor();
    const documentTree = treeProcessor.parseDocument(originalContent);
    
    // Analyze edit intent
    const analyzer = new EditIntentAnalyzer(documentTree, originalContent);
    const editIntent = analyzer.analyzeIntent(suggestion, prompt);
    
    // Apply the edit
    const updatedContent = treeProcessor.applyEdit(
      documentTree,
      editIntent.targetNode,
      editIntent.editType,
      editIntent.content
    );
    
    // Apply to editor
    return applyFullContentChange(editorRef, updatedContent);
  } catch (error) {
    console.error("Error applying tree-based edit:", error);
    return false;
  }
};


export const safelyApplyEditorChanges = (
  editorRef: React.RefObject<any>,
  suggestion: string,
  range?: { start: number, end: number },
  contextInfo?: {
    contextBefore?: string;
    contextAfter?: string;
    operation?: 'insert' | 'replace' | 'delete';
  }
): boolean => {
  if (!editorRef.current) {
    console.error("Editor reference is not available");
    return false;
  }

  try {
    // Get the current editor instance
    const editor = editorRef.current;

    // Get current document content
    let currentContent = '';
    let view, state;

    // Try different methods to access content based on editor type
    if (editor.view && editor.view.state) {
      view = editor.view;
      state = view.state;
      currentContent = state.doc.toString();
    } else if (typeof editor.getValue === 'function') {
      currentContent = editor.getValue();
    } else if (editor.state && editor.state.doc) {
      state = editor.state;
      currentContent = state.doc.toString();
    }

    if (!currentContent) {
      console.error("Could not retrieve document content");
      return false;
    }

    // Initialize variables to track identified range
    let from = 0, to = 0;
    let foundPosition = false;

    // Case 1: Explicit line range is provided
    if (range && typeof range.start === 'number' && typeof range.end === 'number') {
      // Convert line numbers to character positions
      const lines = currentContent.split('\n');
      let lineStart = 0;
      let lineEnd = 0;
      let charPos = 0;

      for (let i = 0; i < lines.length; i++) {
        if (i === range.start) {
          lineStart = charPos;
        }
        if (i === range.end) {
          lineEnd = charPos + lines[i].length;
          break;
        }
        charPos += lines[i].length + 1; // +1 for newline
      }

      from = lineStart;
      to = lineEnd;
      foundPosition = true;
      console.log(`Using explicit line range ${range.start}-${range.end}: positions ${from}-${to}`);
    }

    // Case 2: Context before/after is provided
    else if (contextInfo && (contextInfo.contextBefore || contextInfo.contextAfter)) {
      if (contextInfo.contextBefore) {
        const beforePos = currentContent.indexOf(contextInfo.contextBefore);
        if (beforePos !== -1) {
          // Position after the contextBefore
          from = beforePos + contextInfo.contextBefore.length;
          to = from; // Insert at this position
          foundPosition = true;
          console.log(`Found contextBefore "${contextInfo.contextBefore}" at position ${beforePos}`);
        }
      }

      if (!foundPosition && contextInfo.contextAfter) {
        const afterPos = currentContent.indexOf(contextInfo.contextAfter);
        if (afterPos !== -1) {
          // Position before the contextAfter
          from = afterPos;
          to = from; // Insert at this position
          foundPosition = true;
          console.log(`Found contextAfter "${contextInfo.contextAfter}" at position ${afterPos}`);
        }
      }
    }

    // Case 3: Use the suggestion content itself for pattern matching
    if (!foundPosition) {
      // Try to find similar content that might be replaced
      const contentLines = suggestion.split('\n');
      const significantLines = contentLines.filter(line =>
        line.trim().length > 15 && !line.trim().startsWith('%')
      );

      if (significantLines.length > 0) {
        // For each significant line, check if similar content exists in the document
        for (const line of significantLines) {
          // Clean the line for comparison
          const cleanLine = line.trim().replace(/\s+/g, '\\s+');
          if (cleanLine.length < 15) continue; // Skip short lines

          try {
            const regex = new RegExp(cleanLine, 'i');
            const match = currentContent.match(regex);

            if (match && match.index !== undefined) {
              // Find the beginning of the line
              const lineStart = currentContent.lastIndexOf('\n', match.index) + 1;
              // Find the end of the line
              const lineEnd = currentContent.indexOf('\n', match.index);

              from = lineStart;
              to = lineEnd !== -1 ? lineEnd : currentContent.length;
              foundPosition = true;
              console.log(`Found similar content at positions ${from}-${to}`);
              break;
            }
          } catch (e) {
            // Regex might fail, continue with next line
            continue;
          }
        }
      }
    }

    // Case 4: Look for specific LaTeX constructs as insertion points
    if (!foundPosition && suggestion.includes('\\begin{')) {
      // Extract environment name
      const envMatch = suggestion.match(/\\begin\{([^}]+)\}/);
      if (envMatch) {
        const envName = envMatch[1];
        // Look for similar environments in the document
        const existingEnvMatch = currentContent.match(new RegExp(`\\\\begin\\{${envName}\\}`, 'i'));

        if (existingEnvMatch && existingEnvMatch.index !== undefined) {
          // Find where to place related content
          const envStart = existingEnvMatch.index;
          // Find the end of the environment
          const envEnd = currentContent.indexOf(`\\end{${envName}}`, envStart);

          if (envEnd !== -1) {
            // Insert near this environment based on operation type
            if (contextInfo?.operation === 'replace') {
              from = envStart;
              to = envEnd + `\\end{${envName}}`.length;
            } else {
              // Insert after the environment
              from = to = envEnd + `\\end{${envName}}`.length;
            }
            foundPosition = true;
            console.log(`Found matching environment ${envName} at positions ${from}-${to}`);
          }
        }
      }
    }

    // Case 5: Look for section headings for placement
    if (!foundPosition && (suggestion.includes('\\section') || suggestion.includes('\\subsection'))) {
      // Try to find an appropriate section to place near
      const sectionMatch = suggestion.match(/\\(?:sub)*section\{([^}]+)\}/);
      if (sectionMatch) {
        const sectionName = sectionMatch[1];

        // Look for sections in the document
        const sectionHeadings = [
          ...currentContent.matchAll(/\\section\{([^}]+)\}/g),
          ...currentContent.matchAll(/\\subsection\{([^}]+)\}/g),
          ...currentContent.matchAll(/\\subsubsection\{([^}]+)\}/g)
        ];

        if (sectionHeadings.length > 0) {
          // Find the most relevant section (by similarity)
          let bestMatch = { index: 0, similarity: 0 };

          for (const heading of sectionHeadings) {
            if (heading.index === undefined) continue;

            const headingName = heading[1];
            // Calculate simple similarity score
            const similarity = calculateSimilarity(sectionName, headingName);

            if (similarity > bestMatch.similarity) {
              bestMatch = { index: heading.index, similarity };
            }
          }

          if (bestMatch.similarity > 0.3) { // Threshold for similarity
            // Find the end of the line containing this section
            const lineEnd = currentContent.indexOf('\n', bestMatch.index);
            from = to = lineEnd !== -1 ? lineEnd + 1 : currentContent.length;
            foundPosition = true;
            console.log(`Found similar section heading with similarity ${bestMatch.similarity} at position ${from}`);
          }
        }
      }
    }

    // Case 6: Fallback - insert at document end or before \end{document}
    if (!foundPosition) {
      // Try to find \end{document}
      const endDocPos = currentContent.lastIndexOf('\\end{document}');

      if (endDocPos !== -1) {
        // Insert before \end{document}
        from = to = endDocPos;
        foundPosition = true;
        console.log(`Fallback: Inserting before \\end{document} at position ${from}`);
      } else {
        // Append to the end of the document
        from = to = currentContent.length;
        foundPosition = true;
        console.log(`Fallback: Appending to document end at position ${from}`);
      }
    }

    // Now apply the change based on the determined range
    const docLength = currentContent.length;
    from = Math.max(0, Math.min(from, docLength));
    to = Math.max(from, Math.min(to, docLength));

    console.log(`Applying change: from=${from}, to=${to}, content length=${suggestion.length}`);

    // For @uiw/react-codemirror or CodeMirror 6
    if (view && state) {
      const transaction = state.update({
        changes: {
          from,
          to,
          insert: suggestion
        }
      });
      view.dispatch(transaction);
      console.log("Change applied using CodeMirror 6 API");
      return true;
    }
    // For direct state manipulation
    else if (editor.dispatch && editor.state) {
      const transaction = editor.state.update({
        changes: {
          from,
          to,
          insert: suggestion
        }
      });
      editor.dispatch(transaction);
      console.log("Change applied using editor state API");
      return true;
    }
    // For CodeMirror 5 style API
    else if (typeof editor.replaceRange === 'function') {
      const fromPos = editor.posFromIndex(from);
      const toPos = editor.posFromIndex(to);
      editor.replaceRange(suggestion, fromPos, toPos);
      console.log("Change applied using CodeMirror 5 API");
      return true;
    }
    // For basic string manipulation and setValue
    else if (typeof editor.setValue === 'function') {
      const newContent =
        currentContent.substring(0, from) +
        suggestion +
        currentContent.substring(to);
      editor.setValue(newContent);
      console.log("Change applied using setValue API");
      return true;
    }

    console.error("No suitable editor API found to apply changes");
    return false;
  } catch (error) {
    console.error("Error applying editor changes:", error);
    return false;
  }
};

// Helper function to calculate similarity between two strings
function calculateSimilarity(str1: string, str2: string): number {
  // Simple implementation of Jaccard similarity
  const set1 = new Set(str1.toLowerCase().split(/\W+/).filter(Boolean));
  const set2 = new Set(str2.toLowerCase().split(/\W+/).filter(Boolean));

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Extract key patterns from a target description
 */
function extractPatternsFromDescription(description: string): string[] {
  const patterns: string[] = [];

  // Look for common LaTeX structural elements
  const sectionMatch = description.match(/(?:after|before|in)\s+the\s+([a-zA-Z0-9]+)\s+section/i);
  if (sectionMatch) {
    patterns.push(`\\section{${sectionMatch[1]}`, `\\section{${sectionMatch[1].toLowerCase()}`, `\\section{${sectionMatch[1].toUpperCase()}`);
  }

  // Look for specific line indicators
  const lineMatch = description.match(/line\s+(\d+)/i);
  if (lineMatch) {
    patterns.push(`LINE_NUMBER_${lineMatch[1]}`);
  }

  // Look for specific content mentions
  const contentMatches = description.match(/["']([^"']+)["']/g);
  if (contentMatches) {
    contentMatches.forEach(match => {
      const cleanMatch = match.replace(/["']/g, '');
      if (cleanMatch.length > 3) { // Only use sufficiently unique strings
        patterns.push(cleanMatch);
      }
    });
  }

  // Check for specific LaTeX commands
  const commandMatch = description.match(/\\([a-zA-Z]+)/g);
  if (commandMatch) {
    patterns.push(...commandMatch);
  }

  return patterns;
}

/**
 * Find the best matching pattern in the document
 */
function findBestPatternMatch(content: string, patterns: string[]): { start: number, end: number, text: string } | null {
  let bestMatch = null;

  for (const pattern of patterns) {
    // Handle special case for line numbers
    if (pattern.startsWith('LINE_NUMBER_')) {
      const lineNum = parseInt(pattern.substring(12));
      const lines = content.split('\n');
      if (lineNum > 0 && lineNum <= lines.length) {
        let charPos = 0;
        for (let i = 0; i < lineNum - 1; i++) {
          charPos += lines[i].length + 1;
        }
        const lineEnd = charPos + lines[lineNum - 1].length;
        return {
          start: charPos,
          end: lineEnd,
          text: lines[lineNum - 1]
        };
      }
      continue;
    }

    const index = content.indexOf(pattern);
    if (index !== -1) {
      return {
        start: index,
        end: index + pattern.length,
        text: pattern
      };
    }
  }

  return null;
}

/**
 * Find a section position based on description
 */
function findSectionPosition(content: string, description: string): { start: number, end: number } | null {
  // Extract section name from description
  const sectionNameMatch = description.match(/(?:after|before|in)\s+the\s+([a-zA-Z0-9]+)(?:\s+section|\s+part|\s+chapter)?/i);
  const positionType = description.match(/\b(after|before|in|at the end of|at the beginning of)\b/i)?.[1]?.toLowerCase() || 'after';

  if (!sectionNameMatch) return null;

  const sectionName = sectionNameMatch[1].toLowerCase();

  // Search for various section command patterns
  const sectionPatterns = [
    `\\section{${sectionName}}`,
    `\\section{${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)}}`,
    `\\subsection{${sectionName}}`,
    `\\subsection{${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)}}`,
    `\\subsubsection{${sectionName}}`,
    `\\chapter{${sectionName}}`,
    `\\part{${sectionName}}`
  ];

  // Look for each potential pattern
  for (const pattern of sectionPatterns) {
    const sectionIndex = content.toLowerCase().indexOf(pattern.toLowerCase());
    if (sectionIndex !== -1) {
      // Found the section, now determine where to position based on requested position
      if (positionType === 'before') {
        return { start: sectionIndex, end: sectionIndex };
      } else if (positionType === 'in' || positionType === 'at the beginning of') {
        // Find the actual end of the section command
        const cmdEndIndex = content.indexOf('}', sectionIndex);
        return { start: cmdEndIndex + 1, end: cmdEndIndex + 1 };
      } else { // 'after' or 'at the end of'
        // Find the next section or end of document
        const nextSectionIndex = findNextSectionCommand(content, sectionIndex + pattern.length);
        if (nextSectionIndex !== -1) {
          return { start: nextSectionIndex, end: nextSectionIndex };
        } else {
          // If no next section, just go to the next line after this section
          const eolIndex = content.indexOf('\n', sectionIndex);
          return { start: eolIndex + 1, end: eolIndex + 1 };
        }
      }
    }
  }

  return null;
}

/**
 * Find the next section command after a given position
 */
function findNextSectionCommand(content: string, startPos: number): number {
  const sectionCommands = ['\\section{', '\\subsection{', '\\subsubsection{', '\\chapter{', '\\part{'];

  let earliest = -1;
  for (const cmd of sectionCommands) {
    const pos = content.indexOf(cmd, startPos);
    if (pos !== -1 && (earliest === -1 || pos < earliest)) {
      earliest = pos;
    }
  }

  return earliest;
}

/**
 * Try to infer position from the suggestion content itself
 */
function inferPositionFromSuggestion(content: string, suggestion: string): { start: number, end: number } | null {
  // If suggestion is a section command, look for appropriate placement
  if (suggestion.trim().startsWith('\\section') || suggestion.trim().startsWith('\\subsection')) {
    // Look for the last section command in the document
    const sectionCommands = ['\\section{', '\\subsection{', '\\subsubsection{', '\\chapter{', '\\part{'];
    let lastSectionPos = -1;

    for (const cmd of sectionCommands) {
      const lastPos = content.lastIndexOf(cmd);
      if (lastPos > lastSectionPos) {
        lastSectionPos = lastPos;
      }
    }

    if (lastSectionPos !== -1) {
      // Find the end of this section
      const eolIndex = content.indexOf('\n', lastSectionPos);
      return { start: eolIndex + 1, end: eolIndex + 1 };
    }
  }

  // Look for common content overlaps between the document and suggestion
  if (suggestion.length > 30) {
    const lines = suggestion.split('\n');
    for (const line of lines) {
      if (line.trim().length > 20) {
        const index = content.indexOf(line);
        if (index !== -1) {
          return { start: index, end: index + line.length };
        }
      }
    }
  }

  return null;
}

/**
 * Gets the correct editor reference from either @uiw/react-codemirror or direct CodeMirror
 */
export const getEditorInstance = (ref: React.RefObject<any>): any => {
  if (!ref.current) return null;

  // For @uiw/react-codemirror
  if (ref.current.view) {
    return ref.current.view;
  }

  // Already a direct editor reference
  return ref.current;
};

/**
 * Validates an array of unified diff hunks against their headers.
 */
export const validateDiffHunks = (
  hunks: string[]
): { isValid: boolean; error?: string; invalidHunkIndex?: number } => {
  if (!Array.isArray(hunks)) {
      return { isValid: false, error: "Input is not an array of hunks." };
  }

  for (let i = 0; i < hunks.length; i++) {
      const hunk = hunks[i];
      if (typeof hunk !== 'string') {
           return { isValid: false, error: `Hunk at index ${i} is not a string.`, invalidHunkIndex: i };
      }

      // 1. Find hunk header
      const headerMatch = hunk.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!headerMatch) {
          if (hunk.trim() === '' || hunk.includes('index ') || hunk.startsWith('diff --git')) {
               console.warn(`Skipping validation for potentially non-content hunk ${i + 1}`);
               continue;
          }
           return { isValid: false, error: `Hunk ${i + 1}: Could not parse header '@@ -old,lines +new,lines @@'.`, invalidHunkIndex: i };
      }

      const oldLineCountHeader = parseInt(headerMatch[2] || '1', 10);
      const newLineCountHeader = parseInt(headerMatch[4] || '1', 10);

      // 2. Get lines *after* the header
      const headerEndIndex = hunk.indexOf('@@', headerMatch[0].indexOf('@@') + 2);
      if (headerEndIndex === -1) {
          return { isValid: false, error: `Hunk ${i + 1}: Malformed header or no content after header.`, invalidHunkIndex: i };
      }
      // Get content AFTER the header line itself
      const contentAfterHeader = hunk.substring(headerEndIndex + 2);
      // Split and **filter out completely empty lines** before processing
      const contentLines = contentAfterHeader.split('\n').filter((line, index, arr) => {
          // Keep non-empty lines OR keep the last line *only if* it's empty AND the content didn't end with \n (split adds extra empty string then)
          // A simpler filter: Keep only non-empty lines or lines with only whitespace (which might be valid context)
          // Let's refine: keep lines that are not *strictly* empty (''). Whitespace-only lines are context.
          // Filter logic: Remove the *very last* element ONLY if it's an empty string (artefact of split).
          if (index === arr.length - 1 && line === '') return false;
          return true; // Keep all other lines, including those with only whitespace
      });


      // 3. Count actual lines
      let actualOldLines = 0;
      let actualNewLines = 0;

      for (const line of contentLines) {
          // Ignore comments specific to diff tools like '\ No newline at end of file'
          if (line.startsWith('\\')) continue;

          if (line.startsWith('-')) {
              actualOldLines++;
          } else if (line.startsWith('+')) {
              actualNewLines++;
          } else if (line.startsWith(' ')) {
              actualOldLines++;
              actualNewLines++;
          } else {
               // Stricter: If a line doesn't start with known prefixes, it's invalid
               return {
                   isValid: false,
                   error: `Hunk ${i + 1}: Line "${line.substring(0, 50)}..." does not start with ' ', '+', '-', or '\\'.`,
                   invalidHunkIndex: i
               };
          }
      }

      // 4. Compare counts
      if (actualOldLines !== oldLineCountHeader) {
          return {
              isValid: false,
              error: `Hunk ${i + 1}: Header expected ${oldLineCountHeader} old lines ('-' or ' '), but found ${actualOldLines}.`,
              invalidHunkIndex: i
          };
      }
      if (actualNewLines !== newLineCountHeader) {
          return {
              isValid: false,
              error: `Hunk ${i + 1}: Header expected ${newLineCountHeader} new lines ('+' or ' '), but found ${actualNewLines}.`,
              invalidHunkIndex: i
          };
      }
       console.log(`Hunk ${i + 1} validated successfully.`);
  }

  return { isValid: true };
};
