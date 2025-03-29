// utils/editorUtils.ts
import { EditorView, ViewUpdate } from '@codemirror/view';
import { LaTeXNode, LaTeXTreeProcessor } from './LaTeXTreeProcessor';
import { EditIntentAnalyzer } from './EditIntentAnalyzer';
import { DocumentContextManager } from './DocumentContextManager';

/**
 * Safely applies changes to the CodeMirror editor
 * This function handles different ways to update editor content based on what API is available
 */
/**
 * A robust utility for safely applying editor changes with multiple strategies
 * This can handle various edit scenarios including insertions, deletions, and replacements
 */
// Enhanced version of safelyApplyEditorChanges from editorUtils.ts

// utils/editorUtils.ts (append or update with the following function)
/**
 * Applies a full content change to the editor
 */
export const applyFullContentChange = (
  editorRef: React.RefObject<any>,
  newContent: string
): boolean => {
  if (!editorRef.current) {
    console.error("Editor reference is not available");
    return false;
  }

  try {
    const editor = editorRef.current;
    let currentContent = '';

    if (editor.view && editor.view.state) {
      currentContent = editor.view.state.doc.toString();
      // For CodeMirror 6: create and dispatch a transaction that replaces the entire document.
      const transaction = editor.view.state.update({
        changes: { from: 0, to: currentContent.length, insert: newContent }
      });
      editor.view.dispatch(transaction);
      return true;
    } else if (typeof editor.getValue === 'function') {
      currentContent = editor.getValue();
      editor.setValue(newContent);
      return true;
    } else {
      console.error("Editor content retrieval method not found");
      return false;
    }
  } catch (error) {
    console.error("Error applying full content change:", error);
    return false;
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