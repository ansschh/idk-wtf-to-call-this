// components/DiffViewer.tsx
import React from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued'; // Use a maintained fork

interface DiffViewerProps {
  originalText: string;
  updatedText: string;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ originalText, updatedText }) => {
  // Define dark theme styles matching VS Code dark
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
        emptyLineBackground: '#1e1e1e', // Match editor bg
        gutterBackground: '#1e1e1e',
        gutterColor: '#888',
        lineHighlightBackground: '#2a2d2e',
        codeFoldBackground: '#2a2d2e',
        codeFoldContentColor: '#888',
        defaultColor: '#c9d1d9', // Default code color
      }
    },
    line: {
        padding: '2px 4px', // Reduced padding
        fontSize: '0.75rem', // Smaller font size
    },
    marker: { // +/- symbols
        fontSize: '0.75rem',
    },
    gutter: {
        minWidth: '30px', // Ensure enough space for line numbers
        padding: '0 5px',
        fontSize: '0.75rem',
    },
     diffContainer: {
        backgroundColor: '#1e1e1e', // Match editor background
        borderRadius: '4px',
        border: '1px solid #3c3c3c',
        overflow: 'hidden', // Clip content
        maxHeight: '40vh', // Limit height for overlay
        overflowY: 'auto', // Enable scrolling if needed
        scrollbarWidth: 'thin', // For Firefox
        scrollbarColor: '#555 #1e1e1e', // For Firefox
     },
    diffRemoved: {
        backgroundColor: 'rgba(255, 0, 0, 0.1)', // Slightly transparent red
    },
    diffAdded: {
         backgroundColor: 'rgba(0, 255, 0, 0.1)', // Slightly transparent green
    },
    wordDiff: {
        padding: '1px', // Minimal padding for word diffs
        borderRadius: '2px',
    },
    codeFold: {
         fontSize: '0.75rem',
    }

  };

  return (
    <div className="text-xs border border-gray-700 rounded overflow-hidden">
         <ReactDiffViewer
            oldValue={originalText}
            newValue={updatedText}
            splitView={true}
            compareMethod={DiffMethod.WORDS} // Or DiffMethod.CHARS for more granularity
            styles={darkThemeStyles}
            useDarkTheme={true}
            hideLineNumbers={false} // Show line numbers for context
            renderContent={(source) => <pre className="whitespace-pre-wrap break-words font-mono">{source}</pre>}
         />
    </div>

  );
};

export default DiffViewer;