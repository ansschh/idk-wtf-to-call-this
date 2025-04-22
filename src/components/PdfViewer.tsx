// --- START OF UPDATED FILE PdfViewer.tsx ---
"use client";

import React, { useEffect, useState, useRef } from 'react';
import {
  Loader, Download, ZoomIn, ZoomOut, RotateCw,
  ChevronLeft, ChevronRight, Maximize, Minimize,
  RefreshCw, Search, X, Printer,
  FileText
} from 'lucide-react';
import dynamic from 'next/dynamic';

// Import LatexRenderer dynamically (Keep if htmlPreview is used)
const LatexRenderer = dynamic(() => import('./LatexRenderer'), {
  ssr: false,
  loading: () => <div className="p-4 text-center text-gray-500">Loading preview renderer...</div> // Updated loading text
});

interface EnhancedPdfViewerProps {
  pdfData: string | ArrayBuffer | null;
  isLoading: boolean;
  error: string | null;
  htmlPreview?: string;
  documentTitle?: string;
  onRecompileRequest?: () => void;
  hideToolbar?: boolean; // Prop to control toolbar visibility
}

const EnhancedPdfViewer: React.FC<EnhancedPdfViewerProps> = ({
  pdfData,
  isLoading,
  error,
  htmlPreview, // Keep htmlPreview logic if needed
  documentTitle = 'document',
  onRecompileRequest,
  hideToolbar = false // Default to showing the toolbar
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [sanitizedPdfUrl, setSanitizedPdfUrl] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState(false);
  const [showDownloadPrompt, setShowDownloadPrompt] = useState(false);
  const [renderAttempts, setRenderAttempts] = useState(0);

  // --- Toolbar State (Keep state even if toolbar is hidden, maybe needed internally?) ---
  // Or remove these if they are TRULY only for the visual toolbar
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1); // Placeholder
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // --- End Toolbar State ---


  // Process PDF data when it changes (Keep this logic)
  useEffect(() => {
    setIframeError(false);
    setShowDownloadPrompt(false);
    // Reset zoom/rotation only if toolbar is visible? Or always? Resetting always is safer.
    setZoom(100);
    setRotation(0);
    setCurrentPage(1);
    setTotalPages(1); // Reset placeholder

    if (!pdfData) {
      setSanitizedPdfUrl(null);
      return;
    }

    try {
      if (typeof pdfData === 'string') {
         // Simplified: Assume string is either data URL or base64
         if (pdfData.startsWith('data:application/pdf')) {
           setSanitizedPdfUrl(pdfData);
         } else if (pdfData.match(/^[A-Za-z0-9+/=]+$/)) { // Basic Base64 check
           setSanitizedPdfUrl(`data:application/pdf;base64,${pdfData}`);
         } else {
           // Assume it might be a direct URL (though less common for dynamic data)
           // Or potentially malformed data
           console.warn("Received string PDF data that isn't a data URL or base64. Attempting to use directly.");
           setSanitizedPdfUrl(pdfData);
         }
      }
      else if (pdfData instanceof ArrayBuffer) {
        const blob = new Blob([pdfData], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setSanitizedPdfUrl(url);
        // Clean up blob URL when component unmounts or pdfData changes
        return () => URL.revokeObjectURL(url);
      } else {
          console.error("Unsupported pdfData type:", typeof pdfData);
          setIframeError(true);
      }
    } catch (err) {
      console.error("Error processing PDF data:", err);
      setIframeError(true);
    }
  }, [pdfData]);


  // --- REMOVED: useEffect attempting to modify iframe URL/DOM ---
  // This is often unreliable and blocked by security policies.
  // Relying on browser's native PDF viewer rendering is simpler.

  // Handle iframe load errors (keep essential error checking)
  useEffect(() => {
    if (!iframeRef.current || !sanitizedPdfUrl) return;
    const iframe = iframeRef.current; // Cache ref

    const handleIframeError = (event) => {
       console.error("Iframe loading error:", event);
       setIframeError(true);
       setShowDownloadPrompt(true); // Suggest download on error
    };

    const handleIframeLoad = () => {
       console.log("Iframe load event triggered.");
       // Basic check: If src is set but document is empty, it likely failed silently
       try {
         if (iframe.contentDocument && iframe.contentDocument.body.innerHTML === '') {
           console.warn("Iframe loaded but content seems empty.");
           // Don't immediately set error, browser might still be loading PDF plugin
           // setIframeError(true);
           // setShowDownloadPrompt(true);
         } else {
           console.log("Iframe loaded with content (or inaccessible).");
           // Successfully loaded (or cannot check due to cross-origin)
           setIframeError(false);
           setShowDownloadPrompt(false);
           // TODO: If needed, interact with PDF JS API here to get totalPages etc.
           // This requires the iframe contentWindow to be accessible and PDF JS to be loaded.
           // Example (may not work due to cross-origin):
           // try {
           //   const pdfViewerApp = iframe.contentWindow?.PDFViewerApplication;
           //   if (pdfViewerApp) {
           //     setTotalPages(pdfViewerApp.pagesCount);
           //     setCurrentPage(pdfViewerApp.page);
           //   }
           // } catch(apiError) { console.warn("Could not access PDF JS API", apiError); }
         }
       } catch (e) {
         console.warn("Cannot access iframe content document (likely cross-origin or security restriction). Assuming load was okay.", e);
          setIframeError(false); // Assume okay if we can't check
       }
    };

    iframe.addEventListener('error', handleIframeError);
    iframe.addEventListener('load', handleIframeLoad);

    // Fallback timeout in case 'load' doesn't fire correctly for failed PDF loads
    const timeout = setTimeout(() => {
        if (!iframeError && iframe.contentDocument && iframe.contentDocument.body.innerHTML === '') {
             console.warn("Timeout reached, iframe content still empty.");
             handleIframeError('timeout'); // Trigger error state after timeout
        }
    }, 5000); // 5 second timeout

    return () => {
      iframe.removeEventListener('error', handleIframeError);
      iframe.removeEventListener('load', handleIframeLoad);
      clearTimeout(timeout);
    };
  }, [sanitizedPdfUrl]); // Rerun when URL changes


  // Fullscreen handling (Keep if needed, but relates to the toolbar)
  useEffect(() => { /* ... fullscreen logic ... */ }, []);
  const toggleFullscreen = () => { /* ... fullscreen logic ... */ };

  // Other handlers (Keep if needed for other interactions, but toolbar buttons are gone)
  const handleDownloadPdf = () => { /* ... download logic ... */ };
  const retryRender = () => { /* ... retry logic ... */ };
  // Zoom/Rotate/Page change handlers are likely redundant without the toolbar
  // Search handlers are redundant without the toolbar

  // Render Loading State
  if (isLoading) {
     return (
       <div className="h-full flex items-center justify-center bg-gray-100"> {/* Light loading bg */}
         <div className="flex flex-col items-center">
           <Loader className="h-8 w-8 text-blue-500 animate-spin" />
           <p className="mt-3 text-gray-600 font-medium">Compiling LaTeX...</p>
         </div>
       </div>
     );
   }

  // Render Error State
  if (error) {
     return (
       <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-red-50 border border-red-200">
         <X className="h-10 w-10 text-red-400 mb-3" />
         <h3 className="font-semibold text-red-700 mb-2">Compilation Error</h3>
         <pre className="text-xs text-left text-red-600 bg-white p-3 rounded border border-red-100 max-h-60 overflow-auto w-full max-w-md font-mono">{error}</pre>
         {onRecompileRequest && (
            <button
              onClick={onRecompileRequest}
              className="mt-4 px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 flex items-center"
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Try Again
            </button>
         )}
       </div>
     );
   }

  // Render HTML Preview State (Keep if using)
  if (htmlPreview) { /* ... keep existing html preview logic ... */ }

  // Render No PDF State
   if (!sanitizedPdfUrl && !isLoading && !error) { // Added !isLoading and !error checks
     return (
       <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-gray-100">
         <FileText className="h-12 w-12 text-gray-300 mb-4" />
         <p className="text-gray-600 font-medium mb-2">No PDF Preview</p>
         <p className="text-gray-500 text-sm mb-4">Compile your document to see the preview.</p>
         {onRecompileRequest && (
            <button onClick={onRecompileRequest} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">Compile Now</button>
         )}
       </div>
     );
   }

  // --- Main PDF Viewer Render ---
  return (
    <div
      ref={containerRef}
       // --- CHANGE: Simplified container - focus on filling space ---
      className="h-full bg-gray-100 relative flex flex-col" // Light background for the area
    >
       {/* --- REMOVED: The entire !hideToolbar && (...) block --- */}

      {/* PDF Content Area - takes all available space */}
       {/* --- CHANGE: Ensure this div takes full height when toolbar is hidden --- */}
      <div className={`flex-1 overflow-auto relative ${hideToolbar ? 'h-full' : ''}`}>
        {/* Iframe Rendering */}
        {!iframeError && sanitizedPdfUrl && (
          <div className="h-full w-full">
            <iframe
              key={`pdf-iframe-${renderAttempts}`} // Re-render iframe on retry
              ref={iframeRef}
              src={sanitizedPdfUrl}
              className="border-0 w-full h-full" // Fill container
              title={documentTitle || "PDF Preview"}
              loading="eager" // Load eagerly as it's primary content
            />
          </div>
        )}

        {/* Download Prompt on iframe error */}
        {showDownloadPrompt && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 p-4">
            <div className="text-center max-w-md p-6 bg-white border border-gray-200 rounded shadow-md">
              <div className="h-12 w-12 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                <Download className="h-6 w-6 text-gray-500" />
              </div>
              <p className="text-gray-700 font-medium mb-2">Can't display PDF here?</p>
              <p className="text-gray-500 text-sm mb-4">Your browser might be blocking the inline preview.</p>
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 justify-center">
                <button onClick={handleDownloadPdf} className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">Download PDF</button>
                <button onClick={retryRender} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300">Retry Preview</button>
              </div>
            </div>
          </div>
        )}

        {/* Basic Iframe Error */}
        {iframeError && !showDownloadPrompt && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 p-4">
                <p className="text-gray-500">Loading PDF preview...</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default EnhancedPdfViewer;
// --- END OF UPDATED FILE PdfViewer.tsx ---