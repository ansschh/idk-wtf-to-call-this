// components/SuggestionOverlay.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Check, X, ChevronUp, ChevronDown, Edit, AlertTriangle, Copy, Loader } from 'lucide-react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { applyPatch, parsePatch } from 'diff';
import { EditorView } from '@codemirror/view';

interface SearchReplaceBlock {
  search: string;
  replace: string;
  explanation?: string;
}

interface SuggestionOverlayProps {
  mode: 'diff' | 'search_replace';
  diffHunks?: string[];
  searchReplaceBlocks?: SearchReplaceBlock[];
  explanation: string;
  originalContent: string;
  isLoadingFallback?: boolean;
  validationError?: string; // <-- ADDED Prop
  onApplyDiff: (hunksToApply: string[]) => void;
  onApplySearchReplace: (blocksToApply: SearchReplaceBlock[]) => void;
  onReject: () => void;
  editorView?: EditorView | null;
  fileName?: string;
}


// Helper function for copy to clipboard
const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text).then(() => {
      console.log("Code copied!");
  }).catch(err => {
      console.error("Failed to copy code:", err);
  });
};

const extractRawCode = (explanation: string): string | null => {
  const codeBlockRegex = /```(?:\w*\n)?([\s\S]*?)```/; // More lenient regex
  const match = explanation.match(codeBlockRegex);
  return match ? match[1].trim() : null;
};


// Define dark theme styles matching VS Code dark theme
const darkThemeStyles = {
  variables: {
    dark: {
      colorScheme: 'dark',
      addedBackground: 'rgba(0, 255, 0, 0.1)',
      addedColor: '#9fefb0',
      removedBackground: 'rgba(255, 0, 0, 0.1)',
      removedColor: '#f098a0',
      wordAddedBackground: 'rgba(0, 255, 0, 0.2)',
      wordRemovedBackground: 'rgba(255, 0, 0, 0.2)',
      emptyLineBackground: '#1e1e1e',
      gutterBackground: '#252526',
      gutterColor: '#888',
      lineHighlightBackground: '#2a2d2e',
      codeFoldBackground: '#2a2d2e',
      codeFoldContentColor: '#888',
      defaultColor: '#c9d1d9',
    }
  },
  line: {
    padding: '1px 5px',
    fontSize: '0.8rem',
    minHeight: '1rem',
  },
  marker: {
    fontSize: '0.8rem',
  },
  gutter: {
    minWidth: '30px',
    padding: '0 5px',
    fontSize: '0.8rem',
    backgroundColor: '#252526',
    borderRight: '1px solid #3c3c3c',
  },
  diffContainer: {
    backgroundColor: '#1e1e1e',
    borderRadius: '4px',
    border: '1px solid #3c3c3c',
    overflow: 'hidden',
    lineHeight: '1.3',
  },
  view: {},
  diffRemoved: {
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
  },
  diffAdded: {
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
  },
  wordDiff: {
    padding: '1px',
    borderRadius: '2px',
  },
  codeFold: {
    fontSize: '0.8rem',
  },
  emptyLinePlaceholder: {
    backgroundColor: '#252526',
    height: '1rem',
  },
  highlightedGutter: {
    backgroundColor: '#2a2d2e',
  }
};

const SuggestionOverlay: React.FC<SuggestionOverlayProps> = ({
  mode,
  diffHunks = [],
  searchReplaceBlocks = [],
  explanation,
  originalContent,
  isLoadingFallback = false,
  validationError, // <-- Destructure new prop
  onApplyDiff,
  onApplySearchReplace,
  onReject,
  editorView,
  fileName,
}) => {
  // Local state for view toggle: explanation vs. changes (diff or search/replace)
  const [viewMode, setViewMode] = useState<'explanation' | 'changes'>('changes'); // Default to changes view
  const [isExpanded, setIsExpanded] = useState(true);
  const [simulatedContent, setSimulatedContent] = useState<string | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  // Only run simulation if mode is diff AND there's no validation error
  const [isLoadingSimulation, setIsLoadingSimulation] = useState(mode === 'diff' && !validationError);
  const [rawCodeToCopy, setRawCodeToCopy] = useState<string | null>(null);


  // Simulate applying DIFF patches for display purposes (only in diff mode)
  useEffect(() => {
      if (mode !== 'diff' || validationError) {
           setIsLoadingSimulation(false);
           setSimulatedContent(null);
           setSimulationError(null);
           if (validationError) {
            setRawCodeToCopy(extractRawCode(explanation));
          }

           return;
      }
      setIsLoadingSimulation(true);
      setSimulationError(null);
      setSimulatedContent(null);
      setRawCodeToCopy(null);

      const simulate = async () => {
          let currentSimulatedContent = originalContent;
          let errorFound: string | null = null;
          try {
            if (!Array.isArray(diffHunks)) throw new Error("Invalid diffHunks format");
            for (let i = 0; i < diffHunks.length; i++) {
              const hunk = diffHunks[i];
              if (typeof hunk !== 'string') continue;
              let result = applyPatch(currentSimulatedContent, hunk);
              if (result === false) {
                 console.warn(`Simulating: Clean patch failed for Hunk ${i+1}, trying fuzzy.`);
                 try {
                     const parsed = parsePatch(hunk);
                     let fuzzyResult: string | false = currentSimulatedContent;
                     let applied = true;
                     for (const p of parsed) { const pr = applyPatch(fuzzyResult, p, { fuzzFactor: 2 }); if (pr === false) { applied = false; break; } fuzzyResult = pr; }
                     result = applied ? fuzzyResult : false;
                 } catch(parseErr){ result = false; }
              }
              if (result === false) { errorFound = `Could not simulate application of Hunk ${i + 1}.`; break; }
              currentSimulatedContent = result;
            }
          } catch (err) { errorFound = `Error simulating patch: ${err instanceof Error ? err.message : 'Unknown'}`; }

          setSimulationError(errorFound);
          setSimulatedContent(errorFound ? null : currentSimulatedContent);
          setIsLoadingSimulation(false);
      };
      simulate();
  }, [mode, diffHunks, originalContent, validationError, explanation]);

  // Handle Apply click based on mode
  const handleApply = () => {
    // --- DISABLE APPLY IF VALIDATION ERROR ---
    if (validationError) return;
    // -----------------------------------------
    if (mode === 'diff' && !simulationError && diffHunks) {
        onApplyDiff(diffHunks);
    } else if (mode === 'search_replace' && searchReplaceBlocks) {
        onApplySearchReplace(searchReplaceBlocks);
    }
};


  // Memoize the view for the changes (either diff or search/replace)
  const changesView = useMemo(() => {
    if (isLoadingSimulation || isLoadingFallback) {
        return ( <div className="p-4 text-gray-400 text-center flex items-center justify-center min-h-[150px]"> <Loader className="h-5 w-5 animate-spin mr-2" /> {isLoadingFallback ? 'Requesting fallback...' : 'Simulating changes...'} </div> );
    }


    if (validationError) {
      const codeToCopy = rawCodeToCopy ?? 'No code block found in explanation.';
      return (
          <div className="p-4 text-red-300 bg-red-900/20 border border-red-700/50 rounded text-sm">
              <div className="flex items-start mb-2">
                <AlertTriangle className="h-5 w-5 mr-2 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block">Invalid Suggestion Format</strong>
                  <p className="text-xs text-red-400">{validationError}</p>
                </div>
              </div>
              <p className="mb-3 text-red-200">The suggested changes could not be applied automatically due to formatting issues in the diff.</p>
              <p className="text-xs text-gray-400 mb-3">You can review the explanation (click "Info") to find the suggested code block and apply it manually if desired.</p>
              {rawCodeToCopy && (
                  <button
                     onClick={() => copyToClipboard(rawCodeToCopy)}
                     className="w-full text-left px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center text-gray-300"
                     title="Copy the raw code suggestion from the explanation"
                   >
                     <Copy className="h-3.5 w-3.5 mr-1.5" />
                     Copy Raw Code Suggestion
                   </button>
              )}
          </div>
      );
 }



    if (mode === 'diff') {
        if (simulationError) {
            const failedHunkDisplay = diffHunks.join('\n\n---\n\n');
            return (
                <div className="p-4 text-red-300 bg-red-900/20 border border-red-700/50 rounded text-sm">
                    <div className="flex items-center mb-2">
                      <AlertTriangle className="h-5 w-5 mr-2 text-red-400" />
                      <strong>Preview Error:</strong>
                    </div>
                    <p className="mb-3">{simulationError}</p>
                    <details className="bg-gray-800/30 p-2 rounded border border-gray-700">
                      <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-200">
                        View Problematic Diff
                      </summary>
                      <pre className="mt-2 text-xs text-red-200 whitespace-pre-wrap font-mono max-h-60 overflow-auto">
                        {failedHunkDisplay}
                      </pre>
                    </details>
                </div>
            );
        }
        if (simulatedContent === null) {
          return <div className="p-4 text-gray-400">Could not generate preview.</div>;
        }
        return (
          <ReactDiffViewer
            oldValue={originalContent}
            newValue={simulatedContent}
            splitView={true}
            compareMethod={DiffMethod.WORDS}
            styles={darkThemeStyles}
            renderContent={(source) => <pre className="whitespace-pre-wrap break-words font-mono">{source}</pre>}
            hideLineNumbers={false}
            useDarkTheme={true}
            leftTitle="Original"
            rightTitle="Suggested (Simulated)"
          />
        );
    }

    if (mode === 'search_replace') {
        if (!searchReplaceBlocks || searchReplaceBlocks.length === 0) {
            return <div className="p-4 text-gray-400">No search/replace edits provided in fallback.</div>;
        }
        return (
            <div className="space-y-4">
                {searchReplaceBlocks.map((block, index) => (
                    <div key={index} className="border border-gray-700 rounded">
                        <div className="bg-red-900/20 p-2 border-b border-gray-700">
                            <strong className="text-red-300 text-xs font-mono">SEARCH (Find This):</strong>
                            <div className="relative group mt-1">
                                <pre className="text-red-200 text-xs whitespace-pre-wrap font-mono bg-gray-800/40 p-2 rounded max-h-40 overflow-auto">
                                  {block.search}
                                </pre>
                                <button 
                                  onClick={() => copyToClipboard(block.search)}
                                  className="absolute top-1 right-1 p-1 bg-gray-700/50 text-gray-400 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-600 hover:text-gray-200"
                                  title="Copy search block"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                            </div>
                        </div>
                        <div className="bg-green-900/20 p-2">
                             <strong className="text-green-300 text-xs font-mono">REPLACE With This:</strong>
                             <div className="relative group mt-1">
                                <pre className="text-green-200 text-xs whitespace-pre-wrap font-mono bg-gray-800/40 p-2 rounded max-h-40 overflow-auto">
                                  {block.replace}
                                </pre>
                                <button 
                                  onClick={() => copyToClipboard(block.replace)}
                                  className="absolute top-1 right-1 p-1 bg-gray-700/50 text-gray-400 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-600 hover:text-gray-200"
                                  title="Copy replace block"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return null;
  }, [
    mode,
    originalContent,
    simulatedContent,
    simulationError,
    isLoadingSimulation,
    isLoadingFallback,
    diffHunks,
    searchReplaceBlocks,
  ]);

  // Handle keyboard shortcuts (apply with Ctrl/Cmd+Enter, reject with Escape)
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        const canApply = !validationError && !isLoadingFallback && (
          (mode === 'diff' && simulationError === null && diffHunks && diffHunks.length > 0) ||
          (mode === 'search_replace' && searchReplaceBlocks && searchReplaceBlocks.length > 0)
      );
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canApply && !isLoadingFallback) {
              e.preventDefault();
              handleApply();
          }
          if (e.key === 'Escape') {
              e.preventDefault();
              onReject();
          }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    mode,
    diffHunks,
    searchReplaceBlocks,
    onApplyDiff,
    onApplySearchReplace,
    onReject,
    simulationError,
    isLoadingFallback,
  ]);

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div
        className="z-[100] bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between bg-[#252526] px-4 py-2 border-b border-[#3c3c3c] flex-shrink-0">
          <div className="flex items-center">
            <Edit className="h-4 w-4 text-blue-400 mr-2" />
            <span className="text-base font-medium text-gray-200">
              AI Suggestion {fileName && `for ${fileName}`} {mode === 'search_replace' && '(Fallback)'}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() =>
                setViewMode(viewMode === 'explanation' ? 'changes' : 'explanation')
              }
              className="p-1.5 text-gray-400 hover:text-gray-200 rounded text-xs px-2 bg-gray-700 hover:bg-gray-600"
              title={
                viewMode === 'explanation'
                  ? `Show ${mode === 'diff' ? 'Diff' : 'Search/Replace'}`
                  : 'Show Explanation'
              }
            >
              {viewMode === 'explanation'
                ? mode === 'diff'
                  ? 'Diff'
                  : 'S/R'
                : 'Info'}
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 text-gray-400 hover:text-gray-200 rounded"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 transition-transform" />
              ) : (
                <ChevronDown className="h-4 w-4 transition-transform" />
              )}
            </button>
            <button
              onClick={onReject}
              className="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-gray-700"
              title="Close (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className={`flex-grow overflow-y-auto p-4 ${isExpanded ? '' : 'hidden'}`}>
          {viewMode === 'explanation' ? (
            <div className="text-sm text-gray-200 whitespace-pre-wrap prose prose-sm prose-invert max-w-none">
              {validationError && (
                   <div className="mb-4 p-3 text-red-300 bg-red-900/20 border border-red-700/50 rounded text-xs">
                       <strong className="block mb-1">Invalid Format Error:</strong>
                       {validationError}
                   </div>
               )}
              {explanation}
            </div>
          ) : (
            <div>{changesView}</div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`flex justify-end space-x-3 p-4 border-t border-[#3c3c3c] bg-[#252526] flex-shrink-0 ${
            isExpanded ? '' : 'hidden'
          }`}
        >
          <button
            onClick={onReject}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 text-sm flex items-center"
            title="Reject (Esc)"
          >
            <X className="h-4 w-4 mr-1.5" /> Reject
          </button>
          <button
            onClick={handleApply}
            disabled={
              isLoadingFallback ||
              (mode === 'diff' && simulationError !== null) ||
              (mode === 'search_replace' &&
                (!searchReplaceBlocks || searchReplaceBlocks.length === 0))
            }
            className={`px-4 py-2 rounded text-sm flex items-center ${
              isLoadingFallback ||
              (mode === 'diff' && simulationError !== null) ||
              (mode === 'search_replace' &&
                (!searchReplaceBlocks || searchReplaceBlocks.length === 0))
                ? 'bg-gray-500 text-gray-300 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
            title={
              isLoadingFallback
                ? 'Loading Fallback...'
                : simulationError ?? 'Apply (Ctrl+Enter)'
            }
          >
            {isLoadingFallback ? (
              <Loader className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-1.5" />
            )}
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuggestionOverlay;
