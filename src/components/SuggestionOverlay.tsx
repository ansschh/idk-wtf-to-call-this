// components/SuggestionOverlay.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Check, X, ChevronUp, ChevronDown, Edit } from 'lucide-react';
import { diffChars, type Change } from 'diff'; // Import diff library
import { EditorView } from '@codemirror/view'; // Import CodeMirror types
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued'; // Use a maintained fork if needed

export interface SuggestionData {
  text: string; // This now holds the FULL modified LaTeX content
  fileId?: string;
}

interface SuggestionOverlayProps {
  suggestion: SuggestionData; // Now uses the exported interface
  // ... rest of props
}



// Interface for the component props
interface SuggestionOverlayProps {
  suggestion: SuggestionData; // The suggestion object from Firestore message
  explanation: string; // The explanation text from the message content
  originalContent: string; // The original content *at the time the suggestion was requested*
  onApply: (appliedSuggestionText: string) => void; // Callback after applying
  onReject: () => void; // Callback for rejecting/closing
  editorView?: EditorView | null; // The CodeMirror 6 view instance
  fileName?: string; // Optional filename for display in the header
  // Removed position prop as it's now a modal
}

const SuggestionOverlay: React.FC<SuggestionOverlayProps> = ({
  suggestion,
  explanation,
  originalContent,
  onApply,
  onReject,
  editorView,
  fileName,
}) => {
  // State for managing the view (explanation vs diff)
  const [viewMode, setViewMode] = useState<'explanation' | 'diff'>('explanation');
  // Expand/collapse state (kept for potential future use, less relevant in modal)
  const [isExpanded, setIsExpanded] = useState(true);

  const fullSuggestedContent = suggestion.text; // The complete suggested file content

  // --- Inline Edit Logic ---
  const applyInlineChanges = () => {
    if (!editorView) {
      console.error("Editor view not available for applying inline changes.");
      alert("Error: Cannot apply inline edit. Editor not ready.");
      return;
    }

    const view = editorView;
    const currentState = view.state;

    // Calculate character-level differences
    const changes: Change[] = diffChars(originalContent, fullSuggestedContent);
    console.log("[SuggestOverlay] Calculated Diffs:", changes);

    let currentPos = 0;
    const cmChanges = [];

    // Convert diffs to CodeMirror transaction changes
    changes.forEach((part) => {
      if (part.added) {
        cmChanges.push({ from: currentPos, insert: part.value });
      } else if (part.removed) {
        const endDeletePos = currentPos + (part.count ?? 0); // Use part.count
        cmChanges.push({ from: currentPos, to: endDeletePos });
        currentPos = endDeletePos; // Advance position after defining deletion
      } else {
        currentPos += (part.count ?? 0); // Advance position for common parts
      }
    });

    // Filter out potential empty changes
    const finalCmChanges = cmChanges.filter(
      (change) => (change.insert && change.insert !== '') || (change.from !== change.to)
    );

    if (finalCmChanges.length === 0) {
      console.log("[SuggestOverlay] No actual changes detected after diffing.");
      onReject(); // Treat as rejection if no changes
      return;
    }

    console.log("[SuggestOverlay] CodeMirror Transaction Changes:", finalCmChanges);

    // Dispatch the transaction to the editor
    try {
      view.dispatch(
        currentState.update({
          changes: finalCmChanges,
          // Optional: Scroll to the first change
          // effects: EditorView.scrollIntoView(finalCmChanges[0].from, { y: "center" })
        })
      );
      console.log("[SuggestOverlay] Inline changes applied successfully.");
      onApply(fullSuggestedContent); // Notify parent with the full applied content
    } catch (error) {
      console.error("[SuggestOverlay] Error dispatching CodeMirror transaction:", error);
      alert("Error applying inline changes. Please review the diff and apply manually.");
    }
  };
  // --- End Inline Edit Logic ---

  // Handle keyboard shortcuts for the modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Apply on Ctrl+Enter or Cmd+Enter
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        applyInlineChanges();
      }
      // Reject on Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        onReject();
      }
    };
    // Add listener when modal mounts
    document.addEventListener('keydown', handleKeyDown);
    // Remove listener when modal unmounts
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [originalContent, fullSuggestedContent, onApply, onReject, editorView]); // Dependencies

  // Memoize the diff view component to avoid unnecessary re-renders
  const diffView = useMemo(() => (
    <ReactDiffViewer
      oldValue={originalContent}
      newValue={fullSuggestedContent}
      splitView={true}
      compareMethod={DiffMethod.CHARS} // Use character diff for accuracy
      // Styling for the diff viewer (dark theme)
      styles={{
          diffContainer: { fontSize: '0.8rem', lineHeight: '1.3', borderRadius: '4px' }, // Added border radius
          gutter: { minWidth: '20px', padding: '0 5px', backgroundColor: '#252526', borderRight: '1px solid #3c3c3c' }, // Styled gutter
          codeFold: { fontSize: '0.8rem' },
          line: { padding: '1px 5px'}, // Reduced line padding
          variables: {
              dark: {
                  colorScheme: 'dark',
                  addedBackground: 'rgba(0, 255, 0, 0.1)',
                  addedColor: '#9fefb0',
                  removedBackground: 'rgba(255, 0, 0, 0.1)',
                  removedColor: '#f098a0',
                  wordAddedBackground: 'rgba(0, 255, 0, 0.2)',
                  wordRemovedBackground: 'rgba(255, 0, 0, 0.2)',
                  emptyLineBackground: '#1e1e1e', // Match dialog bg
                  gutterBackground: '#252526', // Match header/footer bg
                  gutterColor: '#888',
                  lineHighlightBackground: '#2a2d2e',
                  codeFoldBackground: '#2a2d2e',
                  codeFoldContentColor: '#888',
                  defaultColor: '#c9d1d9',
              }
          }
      }}
      renderContent={(source) => <pre className="whitespace-pre-wrap break-words font-mono">{source}</pre>} // Use monospace font
      hideLineNumbers={false}
      useDarkTheme={true} // Explicitly enable dark theme
    />
  ), [originalContent, fullSuggestedContent]);

  return (
    // --- Modal Backdrop ---
    <div
      className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" // Added slight blur
      // Optional: Close on backdrop click
      // onClick={(e) => { if (e.target === e.currentTarget) onReject(); }}
    >
      {/* --- Dialog Container --- */}
      <div
        className="z-[100] bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden" // Keep overflow hidden on the main dialog
        // Prevent backdrop click handler from triggering when clicking dialog
        onClick={(e) => e.stopPropagation()}
      >
        {/* --- Header --- */}
        <div className="flex items-center justify-between bg-[#252526] px-4 py-2 border-b border-[#3c3c3c] flex-shrink-0">
          <div className="flex items-center">
            <Edit className="h-4 w-4 text-blue-400 mr-2" />
            <span className="text-base font-medium text-gray-200">
              AI Suggestion {fileName && `for ${fileName}`}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            {/* Diff/Info Toggle */}
            <button
              onClick={() => setViewMode(viewMode === 'explanation' ? 'diff' : 'explanation')}
              className="p-1.5 text-gray-400 hover:text-gray-200 rounded text-xs px-2 bg-gray-700 hover:bg-gray-600"
              title={viewMode === 'explanation' ? 'Show Diff' : 'Show Explanation'}
            >
              {viewMode === 'explanation' ? 'Diff' : 'Info'}
            </button>
            {/* Expand/Collapse (Less useful in modal, but kept) */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 text-gray-400 hover:text-gray-200 rounded"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {/* --- Close Button --- */}
            <button
              onClick={onReject}
              className="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-gray-700"
              title="Close (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
            {/* --- End Close Button --- */}
          </div>
        </div>

        {/* --- Content Area (Scrollable) --- */}
        {/* Only show content if expanded */}
        <div className={`flex-grow overflow-y-auto p-4 ${isExpanded ? '' : 'hidden'}`}>
          {viewMode === 'explanation' ? (
            <div className="text-sm text-gray-200 whitespace-pre-wrap prose prose-sm prose-invert max-w-none">
              {explanation} {/* Render explanation directly */}
            </div>
          ) : (
            // Diff Viewer container (no extra border needed)
            <div>
              {diffView}
            </div>
          )}
        </div>

        {/* --- Action Buttons Footer --- */}
        {/* Only show footer if expanded */}
        <div className={`flex justify-end space-x-3 p-4 border-t border-[#3c3c3c] bg-[#252526] flex-shrink-0 ${isExpanded ? '' : 'hidden'}`}>
          <button
            onClick={onReject}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 text-sm flex items-center"
            title="Reject (Esc)"
          >
            <X className="h-4 w-4 mr-1.5" /> Reject
          </button>
          <button
            onClick={applyInlineChanges}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm flex items-center"
            title="Apply (Ctrl+Enter)"
          >
            <Check className="h-4 w-4 mr-1.5" /> Apply
          </button>
        </div>
      </div> {/* End Dialog Container */}
    </div> // End Modal Backdrop
  );
};

export default SuggestionOverlay;