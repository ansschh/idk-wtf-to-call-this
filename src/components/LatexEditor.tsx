import React, { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror'; // Import ReactCodeMirrorRef
import { doc, getDoc, updateDoc, serverTimestamp, collection, addDoc, getDocs, query, where, orderBy, deleteDoc } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { authenticateWithFirebase } from "@/lib/firebase-auth";
import ChatWindow from './ChatWindow'; // Use the correct path
import ReactDOM from 'react-dom';
import chatService from '@/services/chatService'; // Import chatService
import { createPatch } from 'diff';
import { basicSetup } from 'codemirror'
import { keymap, EditorView } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { search } from '@codemirror/search';
import { StreamLanguage } from '@codemirror/language'
import ProjectFileTree from './ProjectFileTree';
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { applyUnifiedDiffPatch } from '../utils/editorUtils';
import { EditorState } from '@codemirror/state'; // Import EditorState if using onCreateEditor state
import { applyMultipleUnifiedDiffPatches, applySearchReplaceBlocks, validateDiffHunks } from '../utils/editorUtils';
import {
  Loader, Save, Download, Play, Edit, Eye, Layout, Menu,
  FileText, Folder, FolderOpen, RefreshCw, ChevronLeft, ChevronRight, ChevronDown,
  MoreVertical, FilePlus, FolderPlus, File, MessageSquare,
  X, Upload, FileUp, Trash, Plus, Edit2, Trash2, Copy,
  Home
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ChatProvider, useChat } from '../context/ChatContext';
import ChatPanel from './ChatWindow';
import HeaderChatButton from './HeaderChatButton';
import { compileLatex } from "@/services/latexService";
import SuggestionOverlay from './SuggestionOverlay';

// Import components
import EnhancedSidebar from '../components/EnhancedSidebar';
import EditableProjectName from '../components/EditableProjectName';
import PdfViewer from "../components/PdfViewer";

const editorExtensions = [
  StreamLanguage.define(stex),
  basicSetup,
  keymap.of([indentWithTab]),
  EditorView.lineWrapping,
  search({ top: false }), // Keep search enabled
  EditorView.theme({

    // --- Existing Styles ---
    "&": { height: "100%", fontSize: "14px" },
    ".cm-content": { fontFamily: "monospace" },
    ".cm-gutters": { backgroundColor: "#f3f4f6", borderRight: "1px solid #e5e7eb", color: "#6b7280" },
    ".cm-activeLine": { backgroundColor: "rgba(239, 246, 255, 0.8)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(219, 234, 254, 0.8)", fontWeight: "bold" },
    ".cm-keyword": { color: "#1d4ed8", fontWeight: "bold" },
    ".cm-comment": { color: "#15803d", fontStyle: "italic" },
    ".cm-string": { color: "#b91c1c" },
    ".cm-bracket": { color: "#374151", fontWeight: "bold" },
    ".cm-tag": { color: "#be185d", fontWeight: "bold" },
    ".cm-operator": { color: "#57534e" },
    ".cm-number": { color: "#854d0e" },
    ".cm-variableName": { color: "#047857" },
    ".cm-m-stex.cm-keyword": { color: "#1d4ed8", fontWeight: "bold" },
    ".cm-m-stex.cm-tag": { color: "#be185d", fontWeight: "bold" },
    ".cm-m-stex.cm-bracket": { color: "#374151", fontWeight: "bold" },

    // --- UPDATED: Search Panel Styles ---
    ".cm-search": {
        backgroundColor: "#ffffff",
        borderTop: "1px solid #e5e7eb",
        padding: "8px 12px", // Slightly more padding
        display: "flex",
        alignItems: "center",
        gap: "10px", // Increased gap
        color: "#374151",
        flexWrap: "wrap",
        minHeight: "42px", // Adjusted height
    },
     ".cm-search > .cm-textfield": {
       flexGrow: 1,
       flexShrink: 1,
       minWidth: '120px',
     },
     ".cm-search > label": {
        fontSize: "0.875rem",
        marginRight: "4px",
        whiteSpace: 'nowrap',
        flexShrink: 0,
     },
    ".cm-textfield": { // Inputs
        backgroundColor: "#ffffff", // White background
        border: "1px solid #d1d5db", // border-gray-300
        borderRadius: "0.375rem", // rounded-md
        padding: "6px 10px", // Adjusted padding
        fontSize: "0.875rem",
        color: "#111827",
        height: "34px", // Set explicit height
        boxSizing: 'border-box',
    },
    ".cm-textfield:focus": {
        borderColor: "#2563eb", // border-blue-600
        boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.3)", // ring-2 ring-blue-300/30
        outline: "none",
    },

     // --- UPDATED: Materialistic Button Styles ---
    ".cm-button": {
        backgroundColor: "#ffffff", // White background
        color: "#374151", // text-gray-700 - Default text
        border: "1px solid #d1d5db", // border-gray-300
        borderRadius: "0.375rem", // rounded-md
        padding: "0 12px", // Horizontal padding
        fontSize: "0.875rem", // text-sm
        fontWeight: "500", // font-medium
        cursor: "pointer",
        transition: "background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
        marginLeft: "4px",
        height: "34px", // Match input height
        boxSizing: 'border-box',
        display: 'inline-flex', // Align icon/text if needed
        alignItems: 'center', // Align icon/text if needed
        justifyContent: 'center', // Center content
        flexShrink: 0,
        whiteSpace: 'nowrap',
        userSelect: 'none', // Prevent text selection on click
        boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 1px 0 rgba(0,0,0,0.03)", // Subtle shadow
    },
    ".cm-button:hover": {
        backgroundColor: "#f9fafb", // bg-gray-50 - Subtle hover
        borderColor: "#adb5bd", // Slightly darker border
        color: "#1f2937", // text-gray-800
    },
    ".cm-button:active": {
        backgroundColor: "#f3f4f6", // bg-gray-100 - Pressed state
        boxShadow: "inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)", // Inset shadow when pressed
    },
    ".cm-button:focus-visible": { // Keyboard focus indication
        outline: 'none',
        borderColor: "#2563eb", // border-blue-600
        boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.3)", // Ring effect
    },
    ".cm-button:disabled": {
        backgroundColor: "#f3f4f6", // bg-gray-100
        color: "#9ca3af", // text-gray-400
        borderColor: "#e5e7eb", // border-gray-200
        cursor: "not-allowed",
        boxShadow: 'none',
        opacity: 0.7,
    },
     // Group for checkboxes
     ".cm-search > div:has(input[type=checkbox])": {
       display: 'flex',
       alignItems: 'center',
       gap: '10px', // Space between checkboxes
       marginLeft: 'auto', // Push checkboxes towards the right (if space allows)
       flexWrap: 'nowrap', // Prevent checkboxes themselves wrapping individually
       flexShrink: 0,
     },
    ".cm-search label": { // General label styling (includes checkbox labels)
       display: 'flex',
       alignItems: 'center',
       fontSize: "0.8rem",
       cursor: 'pointer',
       userSelect: 'none',
       color: '#4b5563',
       whiteSpace: 'nowrap',
    },
     ".cm-search input[type=checkbox]": {
       marginRight: '4px',
       height: '14px',
       width: '14px',
       cursor: 'pointer',
       appearance: 'none',
       border: '1px solid #d1d5db',
       borderRadius: '3px',
       verticalAlign: 'middle', // Align checkbox better with text
       position: 'relative', // Needed for custom checkmark
       top: '-1px', // Fine-tune vertical alignment
     },
     ".cm-search input[type=checkbox]:checked": {
        backgroundColor: '#2563eb',
        borderColor: '#2563eb',
        backgroundImage: `url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e")`,
        backgroundSize: '100% 100%',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
     },
     ".cm-search input[type=checkbox]:focus": {
        outline: 'none',
        boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.4)", // Focus ring like Tailwind
     },
    ".cm-search-match": {
        backgroundColor: "rgba(253, 224, 71, 0.4)" // bg-yellow-200/40 more visible yellow
     },
      ".cm-search-match-selected": {
        backgroundColor: "rgba(249, 115, 22, 0.5)" // bg-orange-500/50 more visible orange
     },
     // Close button specific styling if needed
     ".cm-search > button[name='close']": {
         marginLeft: 'auto', // Push close button to the far right
         padding: '5px', // Make it smaller padding
         border: 'none',
         background: 'transparent',
         boxShadow: 'none',
         color: '#6b7280', // text-gray-500
     },
     ".cm-search > button[name='close']:hover": {
         background: '#f3f4f6', // bg-gray-100
         color: '#1f2937', // text-gray-800
     }

  })
];

// Define types for the internal file structure
interface FileTreeItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  parentId: string | null;
  content?: string;
  children?: FileTreeItem[];
}

interface SearchReplaceBlock {
  search: string;
  replace: string;
  explanation?: string;
}


// For file mentions in chat
interface FileMention {
  id: string;
  name: string;
  type: 'file' | 'folder';
}

interface TextWithMentions {
  text: string;
  mentions: FileMention[];
}

// Editor extensions to ensure full height
const editorSetup = EditorView.theme({
  "&": {
    height: "100%",
    maxHeight: "100%"
  },
  ".cm-scroller": {
    overflow: "auto !important" // Force scrolling to be enabled
  },
  ".cm-content": {
    minHeight: "100%",
    paddingBottom: "50px" // Add padding at the bottom for better scrolling experience
  },
  ".cm-editor": {
    height: "100%",
    overflow: "hidden" // Hide overflow on the editor container
  }
});

// Determine if a file is an image
const isImageFile = (filename: string): boolean => {
  if (!filename) return false;
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.bmp', '.webp'];
  const lowerFilename = filename.toLowerCase();
  return imageExtensions.some(ext => lowerFilename.endsWith(ext));
};

// Custom theme extension for LaTeX syntax highlighting
const latexTheme = EditorView.theme({
  "&.cm-focused": {
    outline: "none"
  },
  ".cm-line": {
    padding: "0 4px"
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(73, 72, 62, 0.3)"
  },
  ".cm-gutters": {
    backgroundColor: "#1f2937",
    color: "#6b7280",
    border: "none"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(73, 72, 62, 0.3)"
  },
  // LaTeX-specific syntax highlighting
  ".cm-keyword": { color: "#93c5fd", fontWeight: "bold" },
  ".cm-comment": { color: "#6b7280", fontStyle: "italic" },
  ".cm-string": { color: "#fde68a" },
  ".cm-tag": { color: "#f472b6", fontWeight: "bold" },
  ".cm-bracket": { color: "#e5e7eb", fontWeight: "bold" },
  ".cm-property": { color: "#60a5fa" },
  ".cm-m-stex.cm-keyword": { color: "#f472b6", fontWeight: "bold" },
  ".cm-m-stex.cm-builtin": { color: "#93c5fd", fontWeight: "bold" },
  ".cm-m-stex.cm-tag": { color: "#f472b6", fontWeight: "bold" },
  ".cm-m-stex.cm-bracket": { color: "#e5e7eb", fontWeight: "bold" },
  ".cm-m-stex.cm-comment": { color: "#6b7280", fontStyle: "italic" },
  ".cm-m-stex.cm-string": { color: "#fde68a" },
});

// Performance optimization styles to reduce repaints during resize
const performanceStyles = `
  body.resizing * {
    pointer-events: none;
  }
  body.resizing .resize-handle {
    pointer-events: auto !important;
  }
  body.resizing .cm-editor * {
    will-change: transform;
    transition: none !important;
  }
  
  .resize-handle {
    touch-action: none;
    will-change: transform;
  }
  
  .panel-transition {
    transition: width 0.1s ease, height 0.1s ease;
  }
  
  body.resizing .panel-transition {
    transition: none !important;
  }
  
  .file-mention {
    display: inline-flex;
    align-items: center;
    background-color: rgba(59, 130, 246, 0.2);
    border-radius: 0.25rem;
    padding: 0 0.375rem;
    color: rgb(147, 197, 253);
    cursor: pointer;
    white-space: nowrap;
  }
  
  .file-mention:hover {
    background-color: rgba(59, 130, 246, 0.3);
  }
  
  .mention-list {
    max-height: 200px;
    overflow-y: auto;
    contain: content;
  }
`;

// Dynamically import Image Preview
const ImagePreview = dynamic(() => import('./ImagePreview'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-gray-900">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  ),
});

// Enhanced ResizablePanel for smooth resizing
const ResizablePanel = ({
  children,
  direction,
  initialSize,
  minSize = 100,
  maxSize = 800,
  className = '',
  onChange,
  resizeFrom = 'both' // Control which side has resize handles
}) => {
  const [size, setSize] = useState(initialSize);
  const editorRef = useRef<{ view?: EditorView } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null); // <--- ADD THIS LINE
  const isResizing = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null); // Make sure this is also typed if possible

  const startPos = useRef(0);
  const startSize = useRef(0);
  const rafId = useRef(null);
  let cmInstance: any = null;

  useEffect(() => {
    if (editorRef.current && !cmInstance) {
      cmInstance = editorRef.current;
      console.log("CodeMirror instance captured:", cmInstance);
    }
  }, [editorRef.current]);


  // Update size if initialSize changes and we're not currently resizing
  useEffect(() => {
    if (!isResizing.current) {
      setSize(initialSize);
    }
  }, [initialSize]);

  // Optimized resize handler using requestAnimationFrame
  const handleResize = useCallback((clientPos, edge) => {
    if (!isResizing.current || !containerRef.current) return;

    // Cancel any pending animation frame
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
    }

    // Schedule the resize calculation on the next animation frame
    rafId.current = requestAnimationFrame(() => {
      if (!containerRef.current) return;

      const currentPos = clientPos;

      // Calculate delta based on resize direction and edge
      let delta;
      if (direction === 'horizontal') {
        delta = edge === 'start'
          ? startPos.current - currentPos
          : currentPos - startPos.current;
      } else {
        delta = currentPos - startPos.current;
      }

      // Calculate new size with constraints
      let newSize = startSize.current + delta;
      newSize = Math.max(minSize, Math.min(maxSize, newSize));

      // Update size
      setSize(newSize);
      if (onChange) onChange(newSize);
    });
  }, [minSize, maxSize, onChange, direction]);

  // Handle mouse down event
  const handleMouseDown = (e, edge) => {
    e.preventDefault();
    isResizing.current = true;
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    startSize.current = size;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    // Optimize performance during resize by adding a resize class to body
    document.body.classList.add('resizing');

    // Add event listeners to document
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };


  const handleMouseMove = useCallback((e) => {
    if (!isResizing.current) return;
    const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;

    // Get the current container bounds
    const containerRect = containerRef.current?.getBoundingClientRect();

    // Determine which edge we're resizing from
    let edge = 'end';
    if (containerRect) {
      if (direction === 'horizontal') {
        // Detect if we're resizing from the left edge (start)
        const isLeftResize = startPos.current < containerRect.left + 10;
        edge = isLeftResize ? 'start' : 'end';
      }
    }

    handleResize(currentPos, edge);
  }, [direction, handleResize]);

  const handleMouseUp = useCallback(() => {
    isResizing.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.body.classList.remove('resizing');

    // Clean up animation frame if still pending
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }

    // Remove event listeners
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  // Add event listeners when component mounts
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Set up container style
  const containerStyle = {
    position: 'relative',
    ...(direction === 'horizontal'
      ? { width: `${size}px`, height: '100%' }
      : { width: '100%', height: `${size}px` }),
    transition: isResizing.current ? 'none' : 'width 0.1s ease, height 0.1s ease'
  };

  return (
    <div ref={containerRef} className={`${className} panel-transition`} style={containerStyle}>
      {children}

      {/* Left resize handle for horizontal */}
      {direction === 'horizontal' && (resizeFrom === 'both' || resizeFrom === 'start') && (
        <div
          className="absolute left-0 top-0 w-1 h-full cursor-col-resize hover:bg-blue-500 z-10 resize-handle"
          onMouseDown={(e) => handleMouseDown(e, 'start')}
        >
          <div className="absolute inset-0 w-4 -ml-1.5 group-hover:bg-blue-500/10 group-active:bg-blue-500/20" />
        </div>
      )}

      {/* Right resize handle for horizontal */}
      {direction === 'horizontal' && (resizeFrom === 'both' || resizeFrom === 'end') && (
        <div
          className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-blue-500 z-10 resize-handle"
          onMouseDown={(e) => handleMouseDown(e, 'end')}
        >
          <div className="absolute inset-0 w-4 -mr-1.5 group-hover:bg-blue-500/10 group-active:bg-blue-500/20" />
        </div>
      )}

      {/* Bottom resize handle for vertical */}
      {direction === 'vertical' && (
        <div
          className="absolute bottom-0 left-0 h-1 w-full cursor-row-resize hover:bg-blue-500 z-10 resize-handle"
          onMouseDown={(e) => handleMouseDown(e, 'end')}
        >
          <div className="absolute inset-0 h-4 -mb-1.5 group-hover:bg-blue-500/10 group-active:bg-blue-500/20" />
        </div>
      )}
    </div>
  );
};

// File mention utility functions
const parseMentions = (text, availableFiles) => {
  const mentions = [];

  // Regular expression to match mentions in the format @[name](id)
  const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;

  // Find all mentions in the format @[name](id)
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    const name = match[1];
    const id = match[2];

    // Try to find the file type
    const fileInfo = availableFiles.find(f => f.id === id);
    const type = fileInfo?.type === 'folder' ? 'folder' : 'file';

    mentions.push({ id, name, type });
  }

  // Replace mentions with plain text version for storage
  const cleanText = text.replace(mentionRegex, '@$1');

  return { text: cleanText, mentions };
};

const renderTextWithMentions = (text, mentions = [], onFileSelect = null) => {
  if (!mentions || mentions.length === 0) {
    return text;
  }

  // Create a map of mentions for quick lookup
  const mentionMap = new Map();
  mentions.forEach(mention => {
    mentionMap.set(mention.name, mention);
  });

  // Split the message by @ symbol
  const parts = text.split('@');

  if (parts.length === 1) {
    return text; // No @ symbols
  }

  // Render each part, checking for mentions
  return (
    <>
      {parts[0]}
      {parts.slice(1).map((part, index) => {
        // Check if this part starts with a mention name
        const mentionName = mentions.find(m => part.startsWith(m.name))?.name;

        if (mentionName) {
          const mention = mentionMap.get(mentionName);
          const restOfText = part.substring(mentionName.length);

          return (
            <React.Fragment key={`mention-${index}`}>
              <span
                className="file-mention"
                onClick={() => mention && onFileSelect && onFileSelect(mention.id)}
              >
                @{mentionName}
              </span>
              {restOfText}
            </React.Fragment>
          );
        }

        return <React.Fragment key={`text-${index}`}>@{part}</React.Fragment>;
      })}
    </>
  );
};



// Interface for the EnhancedLatexEditor component
interface EnhancedLatexEditorProps {
  projectId: string;
  userId: string;
  debug?: boolean;
}

// Main editor component wrapper with ChatProvider
const EnhancedLatexEditorWrapper: React.FC<EnhancedLatexEditorProps> = (props) => {
  return (
    <ChatProvider>
      <EnhancedLatexEditor {...props} />
    </ChatProvider>
  );
};

// Main editor component
const EnhancedLatexEditor: React.FC<EnhancedLatexEditorProps> = ({ projectId, userId, debug = false }) => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [projectData, setProjectData] = useState<any>(null);
  const [files, setFiles] = useState<FileTreeItem[]>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState("split");
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [editedProjectName, setEditedProjectName] = useState("");
  const [isCompiling, setIsCompiling] = useState(false);
  const [compilationError, setCompilationError] = useState(null);
  const [pdfData, setPdfData] = useState(null);
  const [htmlPreview, setHtmlPreview] = useState(null);
  const [autoCompile, setAutoCompile] = useState(false);
  const [compileTimeout, setCompileTimeout] = useState(null);
  const [currentFileId, setCurrentFileId] = useState(null);
  const [currentFileName, setCurrentFileName] = useState("");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [originalContentForDiff, setOriginalContentForDiff] = useState<string>('');
  const { activeSessionId } = useChat();
  const [renamingItem, setRenamingItem] = useState<{ id: string | null; name: string }>({ id: null, name: "" });
  const renameInputRef = useRef<HTMLInputElement>(null); // Ref for the input field


  const [chatMessages, setChatMessages] = useState<any[]>([]); // Assuming ChatWindow needs this for context history
  const [setActiveSessionId] = useState<string | null>(null); // Needed for fallback call
  const [isLoadingFallback, setIsLoadingFallback] = useState<boolean>(false); // State for fallback loading

  // Ref to store original messages context for fallback call
  const originalMessagesForFallback = useRef<Array<{ role: string; content: string }>>([]);


  // Chat and suggestion state
  const { isChatOpen, openChat, closeChat, toggleChat } = useChat();
  const [activeSuggestion, setActiveSuggestion] = useState<{
    text: string;
    range?: { start: number, end: number };
    fileId?: string;
  } | null>(null);
  const [chatFileList, setChatFileList] = useState([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const contextActiveSessionId = useChat();

  // File tree specific state
  const [expandedFolders, setExpandedFolders] = useState({});
  const [isDragging, setIsDragging] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [fileContextMenu, setFileContextMenu] = useState(null);

  // Determine if the current file is an image
  const isImageView = currentFileName && isImageFile(currentFileName);

  // State and refs for resizing
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [editorRatio, setEditorRatio] = useState(0.5); // Editor takes 50% of available space in split mode
  // State for your editor’s content

  const [code, setCode] = useState<string>("");
  const [isSaved, setIsSaved] = useState<boolean>(true);
  const [isEditorReady, setIsEditorReady] = useState(false); // <--- ADD THIS LINE

  const [modalSuggestion, setModalSuggestion] = useState<{
    mode: 'diff' | 'search_replace'; // Track mode
    diffHunks?: string[];
    searchReplaceBlocks?: SearchReplaceBlock[];
    explanation: string;
    originalContent: string;
  } | null>(null);


  const [originalContentForOverlayDiff, setOriginalContentForOverlayDiff] = useState<string>('');
  const editorRef = useRef<{ view?: EditorView } | null>(null); // Ensure this ref is correctly typed
  const [activeSession, setActiveSession] = useState<any>(null); // Assuming you get this from context or prop

  const handleProjectTitleChange = useCallback((newTitle: string) => {
    setProjectData(prevData => {
      if (!prevData) return null; // Should ideally not happen if title was editable
      return {
        ...prevData,
        title: newTitle
      };
    });
     // No need to call showNotification here, EditableProjectName can handle it
     // or pass a dedicated notification function prop if preferred.
  }, [setProjectData]); // Dependency: setProjectData

  // Helper function to show notifications
  const showNotification = (message, type = "success") => {
    const notification = document.createElement('div');
    notification.className = `fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg z-50 ${type === "success" ? "bg-green-600 text-white" :
      type === "error" ? "bg-red-600 text-white" :
        "bg-blue-600 text-white"
      }`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 3000);
  };

  // --- MODIFIED requestSearchReplaceFallback ---
  // Ensure this function uses the stored originalMessagesForFallback.current
  const requestSearchReplaceFallback = useCallback(async () => {
    // **Ensure we have context stored**
    if (!modalSuggestion || originalMessagesForFallback.current.length === 0) {
      showNotification("Cannot request fallback: Missing original context.", "error");
      setIsLoadingFallback(false); // Stop loading
      // Close the modal if we can't fallback
      setModalSuggestion(null);
      setOriginalContentForOverlayDiff('');
      return;
    }
    console.log("[LatexEditor] Requesting Search/Replace fallback using stored context...");
    setIsLoadingFallback(true); // Show loading state in modal
    // Keep modal open, maybe update explanation slightly
    setModalSuggestion(prev => prev ? { ...prev, explanation: prev.explanation + "\n\n(Attempting fallback...)" } : null);

    try {
      // Get the fallback data using the *stored* context
      const currentModelId = 'gpt-4o';
      const fallbackData = await chatService.getSearchReplaceFallback(
        originalMessagesForFallback.current,
        currentModelId // Pass model
      );

      if (fallbackData.error || !fallbackData.search_replace_blocks || fallbackData.search_replace_blocks.length === 0) {
        throw new Error(fallbackData.error || "Fallback generated no valid search/replace blocks.");
      }

      // Success: Update modal state for search/replace mode
      setModalSuggestion(prev => prev ? {
        ...prev, // Keep original originalContent
        mode: 'search_replace', // <-- CHANGE MODE
        diffHunks: undefined, // Clear diff hunks
        searchReplaceBlocks: fallbackData.search_replace_blocks, // Add S/R blocks
        explanation: fallbackData.explanation || prev.explanation // Use new explanation if provided
      } : null);
      setIsLoadingFallback(false);
      console.log("[LatexEditor] Fallback successful. Switched modal to search/replace mode.");

    } catch (error) {
      console.error("Error requesting/processing Search/Replace fallback:", error);
      showNotification(`Failed to get fallback suggestion: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
      setIsLoadingFallback(false);
      // Keep the modal open but indicate fallback failure
      setModalSuggestion(prev => prev ? { ...prev, explanation: prev.explanation + "\n\n(Fallback request failed.)" } : null);
      // Optionally close modal on fallback failure:
      // setModalSuggestion(null);
      // setOriginalContentForOverlayDiff('');
    } finally {
      // Clear the stored context once fallback attempt is done (success or fail)
      // originalMessagesForFallback.current = []; // Maybe clear later, upon final apply/reject? Let's clear on reject/apply.
    }
  }, [modalSuggestion, showNotification /* Add deps: chatService, setModalSuggestion, etc. */]); // Add dependencies
  // --- END MODIFIED requestSearchReplaceFallback ---


  // --- MODIFIED handleShowSuggestion ---
  const handleShowSuggestion = useCallback(async (
    diffHunks: string[],
    explanation: string,
    originalContent: string // Editor content when suggestion was requested
  ) => {
    console.log("[LatexEditor] Received suggestion. Validating diff hunks...");
    if (!editorRef.current?.view) {
      console.warn("Editor view not ready when receiving suggestion.");
      showNotification("Cannot display suggestion: Editor not ready.", "warning");
      return;
    }

    // **VALIDATE THE HUNKS**
    const validationResult = validateDiffHunks(diffHunks);

    // --- MODIFIED BLOCK for INVALID Diffs ---
    if (!validationResult.isValid) {
      const errorMsg = `Diff validation failed: ${validationResult.error}. Hunk index: ${validationResult.invalidHunkIndex}`;
      console.error(`[LatexEditor] ${errorMsg}`); // Log the error for debugging

      // SHOW notification, but make it less alarming (warning)
      showNotification(`Suggestion format is invalid. See details in overlay.`, "warning");

      // DO NOT attempt fallback here
      // DO NOT store context here

      // Set state for the overlay to show the error message
      setOriginalContentForOverlayDiff(originalContent); // Keep original for context if needed
      setModalSuggestion({
        mode: 'diff', // Keep mode as diff initially, overlay will handle display
        diffHunks,    // Pass invalid hunks (overlay might use them for debug display)
        explanation,
        originalContent,
        validationError: errorMsg // <-- ADD validation error message
      });
      setIsLoadingFallback(false); // Ensure loading is off
      originalMessagesForFallback.current = []; // Clear any potentially stale context

    } else {
      // --- Diff is VALID, proceed as before ---
      console.log("[LatexEditor] Diff validation successful. Showing suggestion modal (diff mode).");

      // Store context in case *application* fails later, triggering the Search/Replace fallback
      try {
        // Fetch history (ensure activeSessionId is available from context/props)
        const currentSessionId = contextActiveSessionId; // Read from chat context
        if (!currentSessionId) throw new Error("Active session ID not available for fallback context.");

        // Fetch history - Ensure getSessionMessages is robust or handle potential errors
        const history = await chatService.getSessionMessages(currentSessionId);
        const currentModelId = activeSession?.currentModel?.id || 'gpt-4o'; // Get current model

        const currentContext = chatService.prepareMessagesForLLM(history, {
          // Provide necessary params for context preparation
          content: "Context for fallback if diff application fails", // Placeholder content
          projectId,
          sessionId: currentSessionId,
          userId,
          userName: 'User', // Replace if available
          model: currentModelId,
          currentFile: { id: currentFileId || '', name: currentFileName || '', content: originalContent }
        });
        originalMessagesForFallback.current = currentContext; // Store for potential later fallback
        console.log("[LatexEditor] Stored context for potential apply failure fallback.");

      } catch (err) {
        console.error("Failed to prepare context for potential apply failure fallback:", err);
        originalMessagesForFallback.current = []; // Clear context if preparation failed
        showNotification("Warning: Could not prepare context for potential fallback.", "warning");
      }

      // Set state to show the valid diff in the overlay
      setOriginalContentForOverlayDiff(originalContent);
      setModalSuggestion({
        mode: 'diff',
        diffHunks,
        explanation,
        originalContent,
        validationError: undefined // <-- Explicitly set no validation error
      });
      setIsLoadingFallback(false); // Ensure loading is off
    }
  }, [
    contextActiveSessionId, // Added dependency
    activeSession,         // Added dependency for model ID
    projectId, userId, currentFileId, currentFileName, // Existing dependencies
    showNotification, // Existing dependency
    // Ensure setModalSuggestion, setOriginalContentForOverlayDiff, setIsLoadingFallback are stable or included
  ]);

  // --- END MODIFIED handleShowSuggestion ---



  const handleCloseSuggestion = useCallback(() => {
    console.log("[LatexEditor] Closing suggestion modal.");
    setModalSuggestion(null);
  }, []);

  // handleApplyAndCloseSuggestion: Now triggers fallback on diff failure
  const handleApplyDiffSuggestion = useCallback((hunksToApply: string[]) => {
    console.log("[LatexEditor] Applying suggestion using multiple patches.");
    if (!editorRef.current?.view) { /* ... error handling ... */ return; }

    const patchResult = applyMultipleUnifiedDiffPatches(editorRef, hunksToApply);

    if (!patchResult.success) {
      // Failed applying DIFF
      // Trigger Fallback - relies on context stored in handleShowSuggestion
      requestSearchReplaceFallback(); // <-- Call the updated fallback function
    }


    if (patchResult.success && patchResult.finalContent !== undefined) {
      // --- SUCCESS applying DIFF ---
      if (patchResult.finalContent !== code) {
        setCode(patchResult.finalContent);
        setIsSaved(false);
      } else {
        setIsSaved(true); // No change means it's still saved
      }
      showNotification("Suggestion applied via patch");
      setModalSuggestion(null); // Close modal on success
      setOriginalContentForOverlayDiff('');
      originalMessagesForFallback.current = []; // Clear stored messages
    } else {
      // --- FAILED applying DIFF ---
      console.error(`Failed to apply patch: ${patchResult.error}. Hunk index: ${patchResult.failedHunkIndex}`);
      showNotification(`Diff apply failed: ${patchResult.error || 'Patch invalid'}. Requesting fallback...`, "warning");
      // --- Trigger Fallback ---
      requestSearchReplaceFallback();
      // --- DO NOT close modal here, wait for fallback result ---
    }
  }, [code, setCode, setIsSaved /*, other dependencies like activeSessionId, userId etc. for fallback */]);

  // NEW Handler for applying Search/Replace blocks
  // --- Apply S/R Handler ---
  const handleApplySearchReplace = useCallback((blocksToApply: SearchReplaceBlock[]) => {
    console.log("[LatexEditor] Applying suggestion using Search/Replace.");
    if (!editorRef.current?.view) { /* ... error handling ... */ return; }

    const applyResult = applySearchReplaceBlocks(editorRef, blocksToApply);

    if (applyResult.success && applyResult.finalContent !== undefined) {
      // --- SUCCESS applying S/R ---
      if (applyResult.finalContent !== code) { // Only mark unsaved if content changes
        setCode(applyResult.finalContent);
        setIsSaved(false);
      }
      showNotification("Suggestion applied via Search/Replace");
      setModalSuggestion(null); // Close modal
      setOriginalContentForOverlayDiff('');
      originalMessagesForFallback.current = []; // Clear stored messages
    } else {
      // --- FAILED applying S/R ---
      console.error(`Failed to apply Search/Replace: ${applyResult.error}. Block index: ${applyResult.failedBlockIndex}`);
      showNotification(`Search/Replace failed: ${applyResult.error || 'Could not apply changes'}. Please check the console. You may need to apply changes manually.`, "error");
      // Keep modal open to allow user to potentially copy/paste? Or close? Let's close on S/R failure for now.
      setModalSuggestion(null);
      setOriginalContentForOverlayDiff('');
      originalMessagesForFallback.current = [];
    }
  }, [code, setCode, setIsSaved /*, other deps */]);
  // --- Reject Handler ---
  const handleRejectAndClose = useCallback(() => {
    console.log("[LatexEditor] Suggestion rejected/closed.");
    setModalSuggestion(null);
    setOriginalContentForOverlayDiff('');
    setIsLoadingFallback(false);
    originalMessagesForFallback.current = []; // Clear stored context on reject
  }, [ /* Add setter dependencies */]);


  // Replace the existing handleApplyAndCloseSuggestion function
  const handleApplyAndCloseSuggestion = useCallback((
    hunksToApply: string[] // Receives the array of hunks from overlay's onApply
  ) => {
    console.log("[LatexEditor] Applying suggestion using multiple patches.");

    // 1. Ensure editor instance is available
    if (!editorRef.current?.view) {
      console.error("Editor view missing, cannot apply suggestion patch.");
      showNotification("Error applying suggestion (editor unavailable)", "error");
      setModalSuggestion(null);
      setOriginalContentForOverlayDiff(''); // Clear stored original content
      return;
    }

    // 2. Apply the patches using the utility function
    // applyMultipleUnifiedDiffPatches takes the ref and the array of hunk strings
    const patchResult = applyMultipleUnifiedDiffPatches(editorRef, hunksToApply);

    // 3. Update state based on patch result
    if (patchResult.success && patchResult.finalContent !== undefined) {
      // Only update React state if patching succeeded AND content changed
      if (patchResult.finalContent !== code) { // Compare with current React state
        setCode(patchResult.finalContent);
        setIsSaved(false); // Mark as unsaved
        showNotification("Suggestion applied");
        console.log("[LatexEditor] Suggestion applied successfully via patch.");
      } else {
        // Content didn't change after applying all patches
        showNotification("Suggestion applied (no effective changes)");
        console.log("[LatexEditor] Suggestion applied via patch, but content was identical.");
        // Mark as saved because no change occurred relative to the editor's state before apply
        // However, if the original state WAS unsaved, it remains unsaved.
        // Let's keep it simple: if apply was called, mark unsaved unless proven otherwise.
        // Revisit this if needed. For now, assume applying means potential change.
        setIsSaved(false);
      }
      // Optional: Trigger auto-compile or auto-save
      // if (autoCompile) { handleCompile(); }
    } else {
      // Handle patching failure
      console.error(`Failed to apply patch: ${patchResult.error}. Hunk index: ${patchResult.failedHunkIndex}`);
      showNotification(`Error applying suggestion: ${patchResult.error || 'Patch failed'}. Please check console for details.`, "error");
      // You could offer a fallback here, e.g., copy suggestion to clipboard
    }

    // 4. Close the modal and clear the stored original content
    setModalSuggestion(null);
    setOriginalContentForOverlayDiff('');

    // Add dependencies: code, setCode, setIsSaved, showNotification, autoCompile, handleCompile etc.
  }, [code /* Add other dependencies */]);


  const contentRef = useRef(null);
  const isResizingSidebar = useRef(false);
  const isResizingEditor = useRef(false);
  const resizeStartX = useRef(0);
  const initialSidebarWidth = useRef(0);
  const saveButtonRef = useRef(null);
  const compileButtonRef = useRef(null);
  const contextMenuRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragNode = useRef(null);
  const dragOverNode = useRef(null);

  const handleEditorCreate = useCallback((view: EditorView, state: EditorState) => {
    console.log("[LatexEditor] handleEditorCreate: Editor view instance CAPTURED.");
    // Store the view instance in the ref
    editorRef.current = { view: view };
    setTimeout(() => setIsEditorReady(true), 0);
  }, []); // Empty dependency array

  useEffect(() => {
    console.log("[LatexEditor Effect] editorRef.current?.view value:", editorRef.current?.view);
    // You could add more logic here to see if it becomes null/undefined later
  }, [editorRef.current?.view]); // Run when the view instance itself changes

  /**
   * Called when the user applies a suggestion from the SuggestionOverlay component.
   * @param {string} appliedFullContent The full content of the suggestion that was applied
   *
   * This function can be used to update local state, mark the document as unsaved, or trigger
   * auto-compilation/auto-save if the user has enabled those features.
   *
   * If the active suggestion state is managed in this component, it should be cleared here.
   * If the user has enabled auto-save/auto-compile, that should be triggered here as well.
   */
  const handleApplySuggestionCallback = (appliedFullContent: string) => {
    console.log("[LatexEditor] Suggestion application confirmed by ChatWindow overlay.");

    // Get the current content *after* the overlay modified the editor
    const currentEditorContent = editorRef.current?.view?.state.doc.toString() ?? appliedFullContent;
    setCode(currentEditorContent); // Sync React state with editor

    setIsSaved(false); // Mark as unsaved
    showNotification("Suggestion applied");

    // Optional: Trigger auto-save or auto-compile
    // if (autoCompile) { handleCompile(); }
  };



  // Add performance styles
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = performanceStyles;
    document.head.appendChild(styleElement);

    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  // Set up keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Save shortcut (Ctrl+S)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!isSaved && currentFileId) {
          saveButtonRef.current?.click();
        }
      }

      // Compile shortcut (Ctrl+Enter)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (currentFileId) {
          compileButtonRef.current?.click();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSaved, currentFileId]);

  // Handle auto-compilation
  useEffect(() => {
    if (!autoCompile || isSaved || !currentFileId) return;

    // Clear previous timeout
    if (compileTimeout) {
      clearTimeout(compileTimeout);
    }

    // Set a new timeout to compile after typing stops
    const timeout = setTimeout(() => {
      handleCompile();
    }, 2000); // 2 second delay

    setCompileTimeout(timeout);

    // Cleanup
    return () => {
      if (compileTimeout) clearTimeout(compileTimeout);
    };
  }, [code, autoCompile, isSaved, currentFileId]);

  // Process files for chat mentions
  useEffect(() => {
    // Convert files to a format suitable for chat file references
    const formatFilesForChat = () => {
      return files.filter(f => !f.deleted).map(file => ({
        id: file.id,
        name: file._name_ || file.name || 'Untitled',
        type: file.type || 'file'
      }));
    };

    setChatFileList(formatFilesForChat());
  }, [files]);

  // Load project data
  useEffect(() => {
    if (!projectId || !userId) {
      setError("Missing project ID or user ID");
      setLoading(false);
      return;
    }

    const fetchProjectData = async () => {
      try {
        setLoading(true);

        // Authenticate with Firebase
        await authenticateWithFirebase(userId);

        // Get project details
        const projectRef = doc(db, "projects", projectId);
        const projectDoc = await getDoc(projectRef);

        if (!projectDoc.exists()) {
          throw new Error("Project not found");
        }

        const project = {
          id: projectDoc.id,
          ...projectDoc.data()
        };

        setProjectData(project);

        // Fetch project files
        await refreshFiles();

        setLoading(false);
      } catch (error) {
        console.error("Error fetching project data:", error);
        setError(error instanceof Error ? error.message : "An error occurred");
        setLoading(false);
      }
    };

    fetchProjectData();
  }, [projectId, userId]);

  // Setup global event listeners for resizing
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingSidebar.current && containerRef.current) {
        // Resize sidebar
        const containerRect = containerRef.current.getBoundingClientRect();
        const newWidth = e.clientX - containerRect.left;
        const constrainedWidth = Math.max(180, Math.min(400, newWidth));
        setSidebarWidth(constrainedWidth);
      } else if (isResizingEditor.current && contentRef.current) {
        // Resize editor/preview split
        const containerRect = contentRef.current.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const offsetX = e.clientX - containerRect.left;
        const newRatio = Math.max(0.2, Math.min(0.8, offsetX / containerWidth));
        setEditorRatio(newRatio);
      }
    };

    const handleMouseUp = () => {
      if (isResizingSidebar.current || isResizingEditor.current) {
        isResizingSidebar.current = false;
        isResizingEditor.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.body.classList.remove('resizing');
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Handle sidebar resize start
  const startSidebarResize = (e) => {
    e.preventDefault();
    isResizingSidebar.current = true;
    resizeStartX.current = e.clientX;
    initialSidebarWidth.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('resizing');
  };

  const startEditProjectName = () => {
    setEditedProjectName(projectData?.title || "Untitled Project");
    setIsEditingProjectName(true);
  };

  const cancelEditProjectName = () => {
    setIsEditingProjectName(false);
  };

  const handleSaveProjectName = async () => {
    if (!editedProjectName.trim() || !projectId) {
      setIsEditingProjectName(false);
      return;
    }

    try {
      // Update the project title in Firestore
      const projectRef = doc(db, "projects", projectId);
      await updateDoc(projectRef, {
        title: editedProjectName.trim(),
        lastModified: serverTimestamp()
      });

      // Update local state
      setProjectData(prev => ({
        ...prev,
        title: editedProjectName.trim()
      }));

      setIsEditingProjectName(false);
      showNotification("Project name updated successfully");
    } catch (error) {
      console.error("Error updating project name:", error);
      showNotification("Failed to update project name", "error");
      setIsEditingProjectName(false);
    }
  };

  // Handle editor-preview split resize start
  const startEditorResize = (e) => {
    e.preventDefault();
    isResizingEditor.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.classList.add('resizing');
  };

  // Helper function to build file tree
  const buildFileTree = (files) => {
    const tree = [];
    const itemMap = new Map();

    // First create all items
    files.forEach(file => {
      // Skip deleted files
      if (file.deleted === true) {
        return;
      }

      const item = {
        id: file.id,
        name: file._name_ || file.name || 'Untitled',
        type: file.type || 'file',
        parentId: file.parentId,
        content: file.content,
        children: file.type === 'folder' ? [] : undefined
      };
      itemMap.set(file.id, item);
    });

    // Then build the tree structure
    files.forEach(file => {
      // Skip deleted files
      if (file.deleted === true) {
        return;
      }

      const item = itemMap.get(file.id);
      if (item) {
        if (!file.parentId) {
          // Root item
          tree.push(item);
        } else {
          // Child item
          const parent = itemMap.get(file.parentId);
          if (parent && parent.children) {
            parent.children.push(item);
          } else if (!parent) {
            // If parent is not found, add as root item
            tree.push(item);
          }
        }
      }
    });

    // Sort the tree - folders first, then alphabetically
    const sortItems = (items) => {
      return items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    };

    const sortTree = (items) => {
      sortItems(items);
      items.forEach(item => {
        if (item.children) {
          sortTree(item.children);
        }
      });
    };

    sortTree(tree);
    return tree;
  };

  // Refresh files list
  const refreshFiles = async () => {
    try {
      // Use only projectId filter to avoid index issues
      const filesQuery = query(
        collection(db, "projectFiles"),
        where("projectId", "==", projectId)
      );

      const filesSnapshot = await getDocs(filesQuery);
      const filesList = [];

      filesSnapshot.forEach((doc) => {
        const data = doc.data();
        // Filter out deleted files client-side
        if (data.deleted !== true) {
          filesList.push({
            id: doc.id,
            _name_: data._name_ || data.name || "Untitled",
            name: data._name_ || data.name || "Untitled", // For consistency
            type: data.type || 'file',
            projectId: data.projectId,
            parentId: data.parentId,
            content: data.content || '',
            createdAt: data.createdAt,
            lastModified: data.lastModified || data.updatedAt || serverTimestamp(),
            ...data // Include other fields
          });
        }
      });

      console.log(`Refreshed ${filesList.length} files`);
      setFiles(filesList);

      // If no file is currently selected, try to select one
      if (!currentFileId) {
        selectDefaultFile(filesList);
      }

      return filesList;
    } catch (error) {
      console.error("Error refreshing files:", error);
      showNotification("Failed to load project files", "error");
      return [];
    }
  };

  // Helper to select a default file
  const selectDefaultFile = (filesList) => {
    // Get project details to check for last compiled file
    const projectRef = doc(db, "projects", projectId);
    getDoc(projectRef).then(projectDoc => {
      if (projectDoc.exists()) {
        const projectData = projectDoc.data();

        // First priority: Check if there's a last compiled file
        if (projectData?.lastCompiledFileId) {
          const lastCompiledFile = filesList.find(f => f.id === projectData.lastCompiledFileId);
          if (lastCompiledFile) {
            setCurrentFileId(lastCompiledFile.id);
            setCurrentFileName(lastCompiledFile._name_ || lastCompiledFile.name || '');
            setCode(lastCompiledFile.content || '');
            return;
          }
        }

        // Second priority: Find main.tex
        const mainFile = filesList.find(f =>
          (f._name_ === 'main.tex' || f.name === 'main.tex') && f.type === 'file'
        );
        if (mainFile) {
          setCurrentFileId(mainFile.id);
          setCurrentFileName(mainFile._name_ || mainFile.name || '');
          setCode(mainFile.content || '');
          return;
        }

        // Third priority: Find any .tex file
        const anyTexFile = filesList.find(f =>
          ((f._name_?.toLowerCase() || f.name?.toLowerCase() || '').endsWith('.tex')) &&
          f.type === 'file'
        );
        if (anyTexFile) {
          setCurrentFileId(anyTexFile.id);
          setCurrentFileName(anyTexFile._name_ || anyTexFile.name || '');
          setCode(anyTexFile.content || '');
        }
      }
    }).catch(error => {
      console.error("Error getting project data:", error);
    });
  };

  // Handle code changes
  const handleCodeChange = (value) => {
    setCode(value);
    setIsSaved(false);
  };

  // Handle file selection
  const handleFileSelect = async (fileId) => {
    if (fileId === currentFileId) return;

    // If there are unsaved changes in the current file, prompt the user
    if (!isSaved && currentFileId) {
      if (window.confirm("You have unsaved changes. Do you want to save them before switching files?")) {
        await handleSave();
      }
    }

    try {
      console.log(`Selecting file: ${fileId}`);

      // Try both collection names for consistency
      let fileData = null;
      let foundDoc = false;

      // Try projectFiles first
      try {
        const fileRef = doc(db, "projectFiles", fileId);
        const fileDoc = await getDoc(fileRef);
        if (fileDoc.exists()) {
          fileData = fileDoc.data();
          foundDoc = true;
          console.log(`Found file in projectFiles collection`);
        }
      } catch (err) {
        console.log("Document not found in projectFiles");
      }

      // If not found, try project_files
      if (!foundDoc) {
        try {
          const fileRef = doc(db, "project_files", fileId);
          const fileDoc = await getDoc(fileRef);
          if (fileDoc.exists()) {
            fileData = fileDoc.data();
            foundDoc = true;
            console.log(`Found file in project_files collection`);
          }
        } catch (err) {
          console.log("Document not found in project_files");
        }
      }

      if (foundDoc && fileData) {
        setCurrentFileId(fileId);
        // Handle different field names for the filename
        const fileName = fileData._name_ || fileData.name || "Untitled";
        setCurrentFileName(fileName);

        // Check if it's an image file
        if (isImageFile(fileName)) {
          console.log("Selected an image file:", fileName);
          // For image files, set an empty code as we'll show the ImagePreview component
          setCode("");
          // Set view mode to ensure ImagePreview is visible
          if (viewMode === "code") {
            setViewMode("split");
          }
        } else {
          // For non-image files, set the content
          setCode(fileData.content || "");
        }

        setIsSaved(true);

        // For .tex files, save as last opened file for this project
        if (fileName.toLowerCase().endsWith('.tex')) {
          try {
            // Update the project with current file as last opened
            const projectRef = doc(db, "projects", projectId);
            await updateDoc(projectRef, {
              lastOpenedFileId: fileId,
              lastModified: serverTimestamp()
            });
          } catch (updateError) {
            console.error("Error updating last opened file:", updateError);
          }
        }
      } else {
        console.error("File not found:", fileId);
        showNotification("File not found", "error");
      }
    } catch (error) {
      console.error("Error loading file:", error);
      showNotification("Failed to load file", "error");
    }
  };

  // Create a new file
  const handleCreateFile = async (parentId = null) => {
    const fileName = prompt("Enter file name:");
    if (!fileName) return;

    try {
      const fileData = {
        _name_: fileName,
        name: fileName, // For consistency
        type: 'file',
        projectId: projectId,
        parentId: parentId,
        ownerId: userId,
        content: '',
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, "projectFiles"), fileData);

      await refreshFiles();
      showNotification(`File "${fileName}" created`);

      // Select the new file
      handleFileSelect(docRef.id);
    } catch (error) {
      console.error("Error creating file:", error);
      showNotification("Failed to create file", "error");
    }
  };

  // Create a new folder
  const handleCreateFolder = async (parentId = null) => {
    const folderName = prompt("Enter folder name:");
    if (!folderName) return;

    try {
      const folderData = {
        _name_: folderName,
        name: folderName, // For consistency
        type: 'folder',
        projectId: projectId,
        parentId: parentId,
        ownerId: userId,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp()
      };

      await addDoc(collection(db, "projectFiles"), folderData);

      await refreshFiles();
      showNotification(`Folder "${folderName}" created`);
    } catch (error) {
      console.error("Error creating folder:", error);
      showNotification("Failed to create folder", "error");
    }
  };

  // Delete file or folder
  const handleDeleteItem = async (itemId) => {
    const item = files.find(f => f.id === itemId);
    if (!item) return;

    if (!window.confirm(`Are you sure you want to delete this ${item.type}?`)) {
      return;
    }

    try {
      // If it's the current file, clear selection
      if (currentFileId === itemId) {
        setCurrentFileId(null);
        setCurrentFileName('');
        setCode('');
      }

      // Mark as deleted rather than actually deleting
      const itemRef = doc(db, "projectFiles", itemId);
      await updateDoc(itemRef, {
        deleted: true,
        lastModified: serverTimestamp()
      });

      await refreshFiles();
      showNotification(`Item deleted`);
    } catch (error) {
      console.error(`Error deleting item:`, error);
      showNotification(`Failed to delete item`, "error");
    }
  };

  // Move file or folder
  const moveFile = async (fileId, newParentId) => {
    try {
      // Get the file being moved
      const fileToMove = files.find(f => f.id === fileId);
      if (!fileToMove) {
        console.error('File not found:', fileId);
        return;
      }

      // Don't do anything if parent hasn't changed
      if (fileToMove.parentId === newParentId) {
        return;
      }

      // Check that we're not creating a circular reference
      if (fileToMove.type === 'folder' && newParentId !== null) {
        // Check if newParentId is a descendant of fileId
        const isDescendant = (parentId, potentialDescendantId) => {
          if (parentId === potentialDescendantId) return true;

          const descendants = files.filter(f => f.parentId === parentId);
          return descendants.some(d => d.type === 'folder' && isDescendant(d.id, potentialDescendantId));
        };

        if (isDescendant(fileId, newParentId)) {
          showNotification('Cannot move a folder inside itself', 'error');
          return;
        }
      }

      // Update the file's parent in Firestore
      const fileRef = doc(db, "projectFiles", fileId);
      await updateDoc(fileRef, {
        parentId: newParentId,
        lastModified: serverTimestamp()
      });

      // Expand the target folder automatically
      if (newParentId !== null) {
        setExpandedFolders(prev => ({
          ...prev,
          [newParentId]: true
        }));
      }

      // Refresh files to show the updated structure
      await refreshFiles();

      showNotification('File moved successfully');
    } catch (error) {
      console.error('Error moving file:', error);
      showNotification('Failed to move file', 'error');
    }
  };

  // Toggle folder expand/collapse
  const toggleFolder = (folderId, e) => {
    if (e) {
      e.stopPropagation();
    }

    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  // Context menu handlers
  const handleContextMenu = (event, itemId) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      itemId
    });
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target)) {
        setContextMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Drag and drop handlers
  const handleDragStart = (e, fileId) => {
    e.stopPropagation();
    // Set the data to be transferred
    e.dataTransfer.setData('text/plain', fileId);
    // Set drag effect
    e.dataTransfer.effectAllowed = 'move';
    // Set visual feedback
    setIsDragging(fileId);
    dragNode.current = e.currentTarget;

    // Add visual styling to dragged element
    setTimeout(() => {
      if (dragNode.current) {
        dragNode.current.style.opacity = '0.4';
      }
    }, 0);
  };

  const handleDragOver = (e, fileId, isFolder) => {
    e.preventDefault();
    e.stopPropagation();

    // Only allow drop on folders or top level
    if (isFolder || fileId === 'root') {
      e.dataTransfer.dropEffect = 'move';
      setDragOverTarget(fileId);
      dragOverNode.current = e.currentTarget;
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  };

  const handleDragEnter = (e, fileId, isFolder) => {
    e.preventDefault();
    e.stopPropagation();

    // Visual feedback for valid drop targets
    if (isFolder || fileId === 'root') {
      setDragOverTarget(fileId);
      dragOverNode.current = e.currentTarget;

      // Add highlighting to drop target
      e.currentTarget.classList.add('drag-over');
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Remove highlighting when leaving potential drop target
    e.currentTarget.classList.remove('drag-over');

    // Only clear if we're leaving this specific target (not its children)
    if (e.currentTarget === dragOverNode.current) {
      setDragOverTarget(null);
      dragOverNode.current = null;
    }
  };

  const handleDragEnd = (e) => {
    e.stopPropagation();

    // Reset drag state
    setIsDragging(null);
    setDragOverTarget(null);

    // Clear styles
    if (dragNode.current) {
      dragNode.current.style.opacity = '1';
      dragNode.current = null;
    }

    // Remove drag-over class from all elements
    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
  };

  // Handle the actual drop
  const handleDrop = async (e, targetId, isFolder) => {
    e.preventDefault();
    e.stopPropagation();

    // Clear visual feedback
    setIsDragging(null);
    setDragOverTarget(null);

    if (dragNode.current) {
      dragNode.current.style.opacity = '1';
      dragNode.current = null;
    }

    // Remove drag-over class from all elements
    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });

    // Get the dragged item id
    const draggedItemId = e.dataTransfer.getData('text/plain');
    if (!draggedItemId) return;

    // Don't do anything if dropping onto itself
    if (draggedItemId === targetId) {
      return;
    }

    // Check if targetId is a valid folder (or root)
    if (targetId === 'root' || (isFolder && targetId)) {
      // Move the file
      await moveFile(draggedItemId, targetId === 'root' ? null : targetId);
    }
  };


  const refreshFilesAndProject = useCallback(async () => {
    if (!projectId || !userId) return;
    setLoading(true); // Indicate loading during refresh
    try {
      await authenticateWithFirebase(userId); // Ensure Firebase auth

      // Fetch project details
      const projRef = doc(db, "projects", projectId);
      const projDoc = await getDoc(projRef);
      if (!projDoc.exists()) throw new Error("Project not found");
      setProjectData({ id: projDoc.id, ...projDoc.data() });

      // Fetch project files (handle potential collection name difference)
      let filesList: FileTreeItem[] = [];
      const collectionsToTry = ["projectFiles", "project_files"]; // Prioritize 'projectFiles'
      let foundFiles = false;

      for (const collName of collectionsToTry) {
        try {
          const filesQuery = query(
            collection(db, collName),
            where("projectId", "==", projectId),
            where("deleted", "!=", true) // Exclude deleted files
            // Removed orderBy('order') - handle sorting client-side to avoid index need
          );
          const filesSnapshot = await getDocs(filesQuery);
          if (!filesSnapshot.empty) {
             filesList = filesSnapshot.docs.map(doc => ({
              id: doc.id,
              ...(doc.data() as any),
              name: doc.data()._name_ || doc.data().name || "Untitled", // Prioritize _name_
              // Ensure all necessary fields for FileTreeItem are mapped
              type: doc.data().type || 'file',
              parentId: doc.data().parentId || null,
              content: doc.data().content || '',
              order: doc.data().order || 0,
              deleted: doc.data().deleted || false,
              createdAt: doc.data().createdAt, // Keep original timestamps if needed
              lastModified: doc.data().lastModified, // Keep original timestamps if needed

            } as FileTreeItem)).sort((a, b) => (a.order || 0) - (b.order || 0)); // Client-side sort
            foundFiles = true;
            break; // Stop after finding files in one collection
          }
        } catch (queryError) {
          console.warn(`Error querying ${collName}:`, queryError);
          // Continue to try the next collection name
        }
      }

      if (!foundFiles) {
        console.warn(`No files found for project ${projectId} in checked collections.`);
        // Optionally create default files if filesList is empty here
        // await initializeDefaultFilesIfNeeded(projectId, userId);
        // Then re-fetch or update filesList
      }

      setFiles(filesList);

      // Select default file if none selected OR current is gone
       const currentFileExists = filesList.some(f => f.id === currentFileId);
       if (!currentFileId || !currentFileExists) {
          if (filesList.length > 0) {
             const mainTex = filesList.find(f => f.name === 'main.tex');
             const firstTex = filesList.find(f => f.name?.toLowerCase().endsWith('.tex'));
             const fileToSelect = mainTex || firstTex || filesList[0];
             // Only call handleFileSelect if necessary to avoid loops
             if(currentFileId !== fileToSelect.id) {
                await handleFileSelect(fileToSelect.id, fileToSelect.name, fileToSelect.content || "");
             } else if (!currentFileExists) {
                // If current file is gone, but was already the default, reset state
                 setCurrentFileId(null);
                 setCurrentFileName("");
                 setCode("");
                 setIsSaved(true);
             }
          } else {
               // No files exist at all
               setCurrentFileId(null);
               setCurrentFileName("");
               setCode("");
               setIsSaved(true);
          }
       } else {
          // Current file still exists, refresh its content if needed
          const currentFileInfo = filesList.find(f => f.id === currentFileId);
          if (currentFileInfo && currentFileInfo.content !== code && !isImageFile(currentFileInfo.name) && !isSaved) {
              // Optional: Maybe only reload if saved? Or prompt user?
              // For now, let's assume refresh should reflect latest saved state
              // setCode(currentFileInfo.content || "");
              // setIsSaved(true);
              console.log("File content potentially differs after refresh, but keeping unsaved editor state.");
          }
       }


      setError(null);
    } catch (err) {
      console.error("Error refreshing data:", err);
      setError(err instanceof Error ? err.message : "Failed to load project data");
      setFiles([]); // Clear files on error
      setProjectData(null);
    } finally {
      setLoading(false); // Ensure loading is set to false
    }
  // --- Dependencies for refreshFilesAndProject ---
  // Include all state and props used inside this function
  // Be careful with 'code' and 'isSaved' to avoid excessive refreshes if not needed
  }, [projectId, userId, currentFileId, handleFileSelect]); // Adjusted dependencies



  // Handle file upload
  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsUploadModalOpen(false);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // For text files (like .tex, .bib, etc.), read content and store directly
        if (
          file.type === 'text/plain' ||
          file.name.endsWith('.tex') ||
          file.name.endsWith('.bib') ||
          file.name.endsWith('.cls')
        ) {
          const content = await readFileAsText(file);

          // Add file to Firestore
          await addDoc(collection(db, "projectFiles"), {
            _name_: file.name,
            name: file.name, // For consistency
            type: 'file',
            projectId: projectId,
            parentId: null,
            ownerId: userId,
            content: content,
            createdAt: serverTimestamp(),
            lastModified: serverTimestamp()
          });
        }
        // For binary files (images, etc.)
        else {
          // For images, store as data URL
          if (file.type.startsWith('image/')) {
            const dataUrl = await readFileAsDataURL(file);

            await addDoc(collection(db, "projectFiles"), {
              _name_: file.name,
              name: file.name, // For consistency
              type: 'file',
              fileType: 'image',
              projectId: projectId,
              parentId: null,
              ownerId: userId,
              content: dataUrl,
              createdAt: serverTimestamp(),
              lastModified: serverTimestamp()
            });
          } else {
            // For other files, try to store in Storage
            // Create a reference to Storage
            const storageRef = ref(storage, `projects/${projectId}/files/${file.name}`);

            // Upload the file
            await uploadBytes(storageRef, file);

            // Get the download URL
            const downloadURL = await getDownloadURL(storageRef);

            // Add file metadata to Firestore
            await addDoc(collection(db, "projectFiles"), {
              _name_: file.name,
              name: file.name, // For consistency
              type: 'file',
              fileType: 'binary',
              projectId: projectId,
              parentId: null,
              ownerId: userId,
              downloadURL: downloadURL,
              createdAt: serverTimestamp(),
              lastModified: serverTimestamp()
            });
          }
        }
      }

      showNotification(`${files.length} files uploaded successfully`);
      await refreshFiles();
    } catch (error) {
      console.error("Error uploading files:", error);
      showNotification("Failed to upload files", "error");
    }
  };

  // Handle file upload for chat
  const handleChatFileUpload = async (file: File): Promise<string> => {
    try {
      let fileUrl = '';
      const isImage = file.type.startsWith('image/');

      // Create a unique filename to avoid collisions
      const timestamp = Date.now();
      const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const uniqueFileName = `${timestamp}_${safeFileName}`;

      console.log(`Uploading file: ${uniqueFileName}`);

      // Reference to the file location in Firebase Storage
      const storageRef = ref(storage, `chats/${projectId}/${uniqueFileName}`);

      // For small images, consider direct Firestore upload instead of Storage
      if (isImage && file.size < 500000) { // Less than 500KB
        try {
          // Read image as data URL
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          // Create document in Firestore with the data URL
          const docRef = await addDoc(collection(db, "chatAttachments"), {
            projectId,
            fileName: file.name,
            contentType: file.type,
            size: file.size,
            dataUrl,
            createdAt: serverTimestamp(),
            userId
          });

          // Generate a URL that can be used to reference this attachment
          fileUrl = `chat-attachment:${docRef.id}`;
          console.log(`Uploaded small image directly to Firestore: ${fileUrl}`);

          return fileUrl;
        } catch (error) {
          console.error("Error uploading small image to Firestore:", error);
          // Fall back to regular storage upload
        }
      }

      // Upload to Firebase Storage with proper error handling
      try {
        // Upload the file to Firebase Storage
        const snapshot = await uploadBytes(storageRef, file);
        console.log(`Uploaded file to Firebase Storage: ${snapshot.ref.fullPath}`);

        // Get the download URL
        fileUrl = await getDownloadURL(snapshot.ref);
        console.log(`Generated download URL: ${fileUrl}`);

        return fileUrl;
      } catch (storageError) {
        console.error("Firebase Storage upload error:", storageError);

        // Provide better error reporting
        if (storageError.message && storageError.message.includes('CORS')) {
          throw new Error("CORS error: Firebase Storage is not configured to accept uploads from this origin. Please check your Firebase Storage CORS configuration.");
        }

        throw storageError;
      }
    } catch (error) {
      console.error("Error in file upload:", error);
      throw error;
    }
  };

  // --- ADD RENAMING HANDLERS ---

  const handleStartRename = useCallback((itemId: string, currentName: string) => {
    setContextMenu(null); // Close context menu first
    setRenamingItem({ id: itemId, name: currentName });
    // Focus will be handled by useEffect hook below
  }, []); // Add dependencies if needed, e.g. [setContextMenu, setRenamingItem]

  const handleRenameCancel = useCallback(() => {
    setRenamingItem({ id: null, name: "" }); // Reset state
  }, []); // Add dependencies if needed, e.g. [setRenamingItem]

  const handleRenameSubmit = useCallback(async () => {
    const { id: itemIdToRename, name: newName } = renamingItem;

    // Basic validation
    if (!itemIdToRename || !newName.trim()) {
      handleRenameCancel();
      return;
    }

    const finalName = newName.trim();

    // Find the original item *before* attempting the update
    const originalItemIndex = files.findIndex(f => f.id === itemIdToRename);
    if (originalItemIndex === -1) {
        console.error("Item to rename not found in local state:", itemIdToRename);
        handleRenameCancel();
        return; // Item not found locally
    }
    const originalItem = files[originalItemIndex];

    // Check if name actually changed
    if (finalName === originalItem.name) {
      handleRenameCancel(); // No change, just close the input
      return;
    }

    // TODO: Add check here if the new name already exists in the same parent directory
    const nameExists = files.some(f =>
        f.id !== itemIdToRename &&
        f.parentId === originalItem.parentId && // Check same parent
        f.name.toLowerCase() === finalName.toLowerCase()
    );
    if (nameExists) {
        showNotification(`An item named "${finalName}" already exists in this folder.`, "error");
        // Don't cancel editing, let the user fix the name
        // handleRenameCancel();
        return;
    }


    // --- Update Firestore ---
    try {
      const itemRef = doc(db, "projectFiles", itemIdToRename); // Adjust collection if needed
      await updateDoc(itemRef, {
        _name_: finalName,
        name: finalName,
        lastModified: serverTimestamp(),
        updatedAt: serverTimestamp() // Keep updatedAt for consistency
      });

      // --- Update Local State Directly ---
      setFiles(prevFiles => {
        const updatedFiles = [...prevFiles];
        const itemIndex = updatedFiles.findIndex(f => f.id === itemIdToRename);
        if (itemIndex !== -1) {
          updatedFiles[itemIndex] = { ...updatedFiles[itemIndex], name: finalName, _name_: finalName };
        }
        return updatedFiles;
      });

      // If the renamed item is the currently open file, update its name in the state
      if (currentFileId === itemIdToRename) {
        setCurrentFileName(finalName);
      }

      showNotification("Item renamed successfully");

    } catch (error) {
      console.error("Error renaming item in Firestore:", error);
      showNotification("Failed to rename item", "error");
      // Important: If Firestore fails, do NOT update local state,
      // keep the input open, or revert the input value.
      // For simplicity now, we just show error and close input.
    } finally {
      handleRenameCancel(); // Reset renaming UI state
    }
  // --- CHANGE: Updated Dependencies ---
  // Removed refreshFilesAndProject, added setFiles, setCurrentFileName, currentFileId
  }, [renamingItem, files, projectId, currentFileId, handleRenameCancel, setFiles, setCurrentFileName, showNotification]);

  // Effect to focus input when renaming starts
  useEffect(() => {
    if (renamingItem.id && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingItem.id]); // Run only when the renaming item ID changes

  // --- END RENAMING HANDLERS ---

  /**
 * A robust utility for safely applying editor changes with multiple strategies
 * This can handle various edit scenarios including insertions, deletions, and replacements
 */
  const safelyApplyEditorChanges = (
    editorRef: React.RefObject<any>,
    suggestion: string,
    range?: { start: number, end: number },
    changeContext?: {
      type: 'insert' | 'replace' | 'delete',
      targetDescription?: string,
      lineNumbers?: number[]
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

      console.log("Document size:", currentContent.length, "bytes");

      // If we already have a precise range, use it directly
      if (range && typeof range.start === 'number' && typeof range.end === 'number') {
        console.log(`Using provided range: ${range.start}-${range.end}`);
      }
      // Otherwise, try to determine where changes should be applied
      else {
        console.log("No exact range provided, determining insertion/modification point");

        // Strategy 1: Line number based positioning
        if (changeContext?.lineNumbers && changeContext.lineNumbers.length > 0) {
          const lines = currentContent.split('\n');
          const startLine = Math.max(0, Math.min(changeContext.lineNumbers[0] - 1, lines.length - 1));
          const endLine = changeContext.lineNumbers.length > 1
            ? Math.max(startLine, Math.min(changeContext.lineNumbers[1] - 1, lines.length - 1))
            : startLine;

          // Calculate character positions from line numbers
          let charPos = 0;
          let startPos = 0;
          let endPos = 0;

          for (let i = 0; i < lines.length; i++) {
            if (i === startLine) startPos = charPos;
            if (i === endLine) {
              endPos = charPos + lines[i].length;
              break;
            }
            charPos += lines[i].length + 1; // +1 for the newline character
          }

          range = { start: startPos, end: endPos };
          console.log(`Applied line number strategy: Lines ${startLine + 1}-${endLine + 1} => Positions ${startPos}-${endPos}`);
        }
        // Strategy 2: Pattern matching based on target description
        else if (changeContext?.targetDescription) {
          // Parse target description for patterns
          const patterns = extractPatternsFromDescription(changeContext.targetDescription);
          console.log("Extracted patterns:", patterns);

          if (patterns.length > 0) {
            // Find the best match in the document
            const match = findBestPatternMatch(currentContent, patterns);
            if (match) {
              if (changeContext.type === 'insert') {
                // For insertion, position at the match end
                range = { start: match.end, end: match.end };
                console.log(`Insert after match "${match.text}" at position ${match.end}`);
              } else {
                // For replace/delete, use the match range
                range = { start: match.start, end: match.end };
                console.log(`Replace/delete match "${match.text}" at positions ${match.start}-${match.end}`);
              }
            }
          }
        }

        // Strategy 3: Content analysis for LaTeX sectioning commands
        if (!range && changeContext?.targetDescription?.includes('section')) {
          range = findSectionPosition(currentContent, changeContext.targetDescription);
          if (range) {
            console.log(`Found section position based on description: ${range.start}-${range.end}`);
          }
        }

        // Fallback strategy: Try to determine from the suggestion itself
        if (!range) {
          range = inferPositionFromSuggestion(currentContent, suggestion);
          if (range) {
            console.log(`Inferred position from suggestion content: ${range.start}-${range.end}`);
          }
        }

        // Last resort fallback - append to document
        if (!range) {
          const insertPosition = currentContent.lastIndexOf('\\end{document}');
          if (insertPosition > 0) {
            range = {
              start: insertPosition,
              end: insertPosition
            };
            console.log(`Last resort: inserting before \\end{document} at position ${insertPosition}`);
          } else {
            range = {
              start: currentContent.length,
              end: currentContent.length
            };
            console.log(`Last resort: appending to document end at position ${currentContent.length}`);
          }
        }
      }

      // Now apply the change based on the determined range
      const docLength = currentContent.length;
      const from = Math.max(0, Math.min(range.start, docLength));
      const to = Math.max(from, Math.min(range.end, docLength));

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

  const handleApplySuggestion = (suggestionText: string) => {
    console.log("Suggestion text length:", suggestionText?.length || 0);

    // Check if the content is valid
    if (!suggestionText || suggestionText.trim() === '') {
      console.error("Empty suggestion content received");
      showNotification("Cannot apply empty suggestion", "error");
      return;
    }

    // Ensure content isn't truncated
    const currentLength = code.length;
    if (suggestionText.length < currentLength * 0.8 && currentLength > 1000) {
      console.error("Content appears truncated:",
        `Current: ${currentLength} chars, Suggestion: ${suggestionText.length} chars`);
      showNotification("Cannot apply possibly truncated content", "error");
      return;
    }

    // Apply the suggestion
    try {
      // Process escaped characters properly
      let processedText = suggestionText;
      if (suggestionText.includes('\\n')) {
        processedText = suggestionText.replace(/\\n/g, '\n');
      }

      setCode(processedText);
      setIsSaved(false);
      showNotification("Suggestion applied successfully");
    } catch (error) {
      console.error("Error applying suggestion:", error);
      showNotification("Failed to apply suggestion", "error");
    }
  };



  useEffect(() => {
    // If we have an active suggestion and the editor is available, apply it
    if (activeSuggestion?.text && editorRef.current) {
      const { text, range } = activeSuggestion;

      // Apply with a slight delay to ensure editor is fully initialized
      const timer = setTimeout(() => {
        const success = safelyApplyEditorChanges(editorRef, text, range);

        if (success) {
          setActiveSuggestion(null);
          setIsSaved(false);
          showNotification('Suggestion applied successfully');
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [editorRef.current, activeSuggestion]);




  // Helper function to read file as text
  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsText(file);
    });
  };

  // Helper function to read file as data URL
  const readFileAsDataURL = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  // Save current file
  const handleSave = async () => {
    if (!currentFileId) {
      showNotification("No file selected to save", "error");
      return false;
    }

    try {
      // First check if the document exists
      let fileRef;
      let documentExists = false;

      try {
        // Try projectFiles collection first
        fileRef = doc(db, "projectFiles", currentFileId);
        const docSnap = await getDoc(fileRef);

        if (docSnap.exists()) {
          documentExists = true;
        } else {
          // Try project_files collection as fallback
          fileRef = doc(db, "project_files", currentFileId);
          const altDocSnap = await getDoc(fileRef);

          if (altDocSnap.exists()) {
            documentExists = true;
          }
        }
      } catch (checkError) {
        console.error("Error checking document existence:", checkError);
      }

      if (!documentExists) {
        // If document doesn't exist, create it instead of updating
        console.log("Document doesn't exist, creating new document");

        const newFileData = {
          _name_: currentFileName,
          name: currentFileName, // For consistency
          type: 'file',
          projectId: projectId,
          parentId: null,
          ownerId: userId,
          content: code,
          createdAt: serverTimestamp(),
          lastModified: serverTimestamp()
        };

        // Try to create in projectFiles collection
        try {
          await addDoc(collection(db, "projectFiles"), newFileData);
          setIsSaved(true);
          showNotification("File created successfully");

          // Refresh files list to get the new file ID
          await refreshFiles();
          return true;
        } catch (createError) {
          console.error("Error creating document:", createError);
          throw new Error("Failed to create document");
        }
      } else {
        // Document exists, proceed with update
        try {
          // Update the document
          await updateDoc(fileRef, {
            content: code,
            lastModified: serverTimestamp()
          });

          // Update project's lastModified timestamp
          try {
            const projectRef = doc(db, "projects", projectId);
            await updateDoc(projectRef, {
              lastModified: serverTimestamp()
            });
          } catch (projectUpdateError) {
            console.warn("Could not update project timestamp:", projectUpdateError);
            // Continue even if this fails
          }

          setIsSaved(true);
          showNotification("File saved successfully");
          return true;
        } catch (updateError) {
          console.error("Error updating document:", updateError);
          throw new Error("Failed to update document");
        }
      }
    } catch (error) {
      console.error("Error saving document:", error);
      showNotification(`Failed to save document: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
      return false;
    }
  };

  // Compile LaTeX
  const handleCompile = async () => {
    if (isCompiling) return;

    // If no file is selected, can't compile
    if (!currentFileId) {
      showNotification("Please select a file to compile", "error");
      return;
    }

    // Check if the current file is a .tex file
    if (!currentFileName.toLowerCase().endsWith('.tex')) {
      showNotification("Only .tex files can be compiled", "error");
      return;
    }

    setIsCompiling(true);
    setCompilationError(null);
    setHtmlPreview(null);

    try {
      // Save current changes first
      if (!isSaved) {
        await handleSave();
      }

      // Compile the document - pass projectId for image handling
      const result = await compileLatex(code, projectId);

      if (result.success) {
        if (result.pdfData) {
          setPdfData(result.pdfData);
          setHtmlPreview(result.htmlPreview || null);
          setCompilationError(null);

          // Switch to PDF view if we're currently in code-only view
          if (viewMode === "code") {
            setViewMode("split");
          }

          showNotification("Compilation successful");
        } else if (result.htmlPreview) {
          setHtmlPreview(result.htmlPreview);
          setPdfData(null);
          setCompilationError(null);
          showNotification("Preview generated successfully");
        } else {
          setCompilationError("No content returned from compilation");
          showNotification("Compilation failed: No output generated", "error");
        }
      } else {
        console.error("Compilation failed:", result.error);
        setCompilationError(result.error || "Unknown compilation error");
        setPdfData(null);
        setHtmlPreview(null);
        showNotification("Compilation failed", "error");
      }
    } catch (error) {
      console.error("Error compiling LaTeX:", error);
      setCompilationError(
        error instanceof Error ? error.message : "Unknown compilation error"
      );
      setPdfData(null);
      setHtmlPreview(null);
      showNotification("Compilation failed", "error");
    } finally {
      setIsCompiling(false);
    }
  };

  // Download PDF
  const handleDownloadPdf = () => {
    if (!pdfData) {
      // If no compiled PDF, compile it first
      if (!isCompiling) {
        handleCompile().then(() => {
          if (pdfData) {
            triggerPdfDownload();
          }
        });
      }
      return;
    }

    triggerPdfDownload();
  };

  // Helper function to trigger the actual download
  const triggerPdfDownload = () => {
    if (typeof pdfData === 'string' && pdfData.startsWith('data:application/pdf')) {
      // Create temporary link
      const link = document.createElement('a');
      link.href = pdfData;
      link.download = `${currentFileName.replace('.tex', '') || "document"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showNotification(`PDF downloaded successfully`);
    } else if (pdfData instanceof ArrayBuffer) {
      // Handle ArrayBuffer data
      const blob = new Blob([pdfData], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `${currentFileName.replace('.tex', '') || "document"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the URL
      setTimeout(() => URL.revokeObjectURL(url), 100);

      showNotification(`PDF downloaded successfully`);
    } else {
      showNotification("Could not download PDF - try compiling first", "error");
    }
  };

  // Add this helper function to get original text
  const getOriginalText = (suggestion: { text: string; range?: { start: number, end: number }; fileId?: string }) => {
    if (!suggestion.range) return '';

    try {
      const docText = code;
      if (docText) {
        const lines = docText.split('\n');
        const { start, end } = suggestion.range;

        if (start === end) {
          return lines[start] || '';
        }

        return lines.slice(start, end + 1).join('\n');
      }
    } catch (error) {
      console.error("Error getting original text:", error);
    }

    return '';
  };

  // And this helper to get file name by ID
  const getFileNameById = (fileId?: string) => {
    if (!fileId) return '';

    const file = files.find(f => f.id === fileId);
    return file?._name_ || file?.name || '';
  };

  // Toggle sidebar visibility
  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  // File tree rendering function
  const renderFileTree = (parentId: string | null = null, depth = 0) => {
    // Get direct children of this parent
    const childItems = files.filter(file => file.parentId === parentId);
    // Sort folders first, then files, alphabetically
    const sortedItems = [...childItems].sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      // Fallback to name sorting if order is missing or equal
      if ((a.order || 0) === (b.order || 0)) {
         return a.name.localeCompare(b.name);
      }
      return (a.order || 0) - (b.order || 0); // Sort by order primarily
    });


    return sortedItems.map(item => {
      const isFolder = item.type === 'folder';
      const isExpanded = expandedFolders[item.id] || false;
      const isActive = currentFileId === item.id;
      const paddingLeft = depth * 12 + 8; // Indentation per level

      return (
        <div key={item.id}>
          {/* --- CORRECTED: Added DnD Handlers and drag-over class --- */}
          <div
             // Draggable Attributes
             draggable // Make the entire item draggable
             onDragStart={e => handleDragStart(e, item.id)}
             onDragEnd={handleDragEnd} // Cleanup styles on drag end

             // Drop Target Attributes (Applied to all items, logic inside handlers filters)
             onDragOver={e => handleDragOver(e, item.id, isFolder)}
             onDragEnter={e => handleDragEnter(e, item.id, isFolder)}
             onDragLeave={handleDragLeave}
             onDrop={e => handleDrop(e, item.id, isFolder)} // Drop on files or folders

             // Combine className logic including drag-over state
            className={`flex items-center py-1 pr-2 rounded group ${
                isActive && !renamingItem.id ? 'bg-blue-100 text-blue-700 font-medium' : ''
               } ${renamingItem.id !== item.id ? 'hover:bg-gray-100 text-gray-700 cursor-pointer' : 'bg-white'}
               ${isDragging === item.id ? 'opacity-40' : ''}
               ${dragOverTarget === item.id && (isFolder || parentId === null /* Allow drop on root file/folder position */) ? 'drag-over' : ''} `} // drag-over class added
            style={{ paddingLeft: `${paddingLeft}px` }}
            onClick={() =>
              renamingItem.id !== item.id &&
              (isFolder
                ? toggleFolder(item.id, null)
                : handleFileSelect(item.id, item.name, item.content))
            }
            onContextMenu={e =>
              renamingItem.id !== item.id && handleContextMenu(e, item.id)
            }
          >
            {/* Folder/File Icons */}
            {isFolder ? (
              isExpanded ? (
                <ChevronDown
                  className="h-3.5 w-3.5 text-gray-500 mr-1 flex-shrink-0"
                  onClick={e => !renamingItem.id && toggleFolder(item.id, e)}
                />
              ) : (
                <ChevronRight
                  className="h-3.5 w-3.5 text-gray-500 mr-1 flex-shrink-0"
                  onClick={e => !renamingItem.id && toggleFolder(item.id, e)}
                />
              )
            ) : (
              <span className="w-3.5 mr-1 flex-shrink-0" />
            )}
            {isFolder ? (
              <Folder className="h-4 w-4 text-sky-500 mr-1.5 flex-shrink-0" />
            ) : (
              getFileIcon(item.name)
            )}

            {/* Conditional Rendering for Rename Input */}
            {renamingItem.id === item.id ? (
              <input
                ref={renameInputRef}
                type="text"
                value={renamingItem.name}
                onChange={e =>
                  setRenamingItem({ ...renamingItem, name: e.target.value })
                }
                onBlur={handleRenameSubmit}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleRenameSubmit();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    handleRenameCancel();
                  }
                }}
                onClick={e => e.stopPropagation()}
                className="flex-grow bg-white text-gray-900 text-sm px-1 py-0 border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 mx-1"
              />
            ) : (
              <span
                className={`text-sm truncate flex-grow ${
                  isActive ? 'text-blue-700' : 'text-gray-800'
                }`}
              >
                {item.name}
              </span>
            )}
            {/* End Conditional Rendering */}

            {/* Actions on Hover (Hide if renaming) */}
            {renamingItem.id !== item.id && (
              <div className="ml-auto opacity-0 group-hover:opacity-100 flex items-center space-x-0.5 flex-shrink-0">
                {isFolder && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleCreateFile(item.id);
                    }}
                    className="p-1 hover:bg-gray-200 rounded"
                    title="Add File"
                  >
                    <Plus className="h-3 w-3 text-gray-500" />
                  </button>
                )}
                <button
                  onClick={e => {
                    e.stopPropagation();
                    handleStartRename(item.id, item.name);
                  }}
                  className="p-1 hover:bg-gray-200 rounded"
                  title="Rename"
                >
                  <Edit2 className="h-3 w-3 text-gray-500" />
                </button>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    handleContextMenu(e, item.id);
                  }}
                  className="p-1 hover:bg-gray-200 rounded"
                  title="More options"
                >
                  <MoreVertical className="h-3.5 w-3.5 text-gray-500" />
                </button>
              </div>
            )}
          </div>

          {/* Recursive call & Empty folder message */}
          {isFolder && isExpanded && renderFileTree(item.id, depth + 1)}
          {isFolder &&
            isExpanded &&
            !files.some(f => f.parentId === item.id) && ( // Ensure 'files' state includes folders for this check or adjust logic
              <div
                className="pl-4 text-xs text-gray-400 italic"
                style={{ paddingLeft: `${paddingLeft + 16}px` }}
              >
                Empty folder
              </div>
            )}
        </div>
      );
    });
  };



  // Helper to get the appropriate file icon
  const getFileIcon = (filename: string) => {
    if (!filename) return <File className="h-4 w-4 mr-1.5 text-gray-400 flex-shrink-0" />; // Use File icon

    const extension = filename.split('.').pop()?.toLowerCase();

    // --- CHANGE: Light theme icon colors ---
    if (extension === 'tex' || extension === 'latex')
      return <File className="h-4 w-4 mr-1.5 text-blue-500 flex-shrink-0" />; // Blue for TeX
    if (isImageFile(filename))
      return <File className="h-4 w-4 mr-1.5 text-purple-500 flex-shrink-0" />; // Purple for images
    if (extension === 'pdf')
      return <File className="h-4 w-4 mr-1.5 text-red-500 flex-shrink-0" />; // Red for PDF
    if (['bib'].includes(extension || ''))
      return <File className="h-4 w-4 mr-1.5 text-green-500 flex-shrink-0" />; // Green for BibTeX
    if (['cls', 'sty'].includes(extension || ''))
      return <File className="h-4 w-4 mr-1.5 text-teal-500 flex-shrink-0" />; // Teal for styles/classes

    return <File className="h-4 w-4 mr-1.5 text-gray-400 flex-shrink-0" />; // Default gray
  };


  // Render loading state
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center">
          <Loader className="h-10 w-10 text-blue-500 animate-spin" />
          <p className="mt-4 text-gray-400">Loading editor...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="max-w-md p-6 bg-gray-800 rounded-lg shadow-lg text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-200 mb-2">Error Loading Project</h2>
          <p className="text-gray-400 mb-4">{error}</p>
          <div className="flex flex-col space-y-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50 text-gray-900" ref={containerRef}>
      {/* Header - fixed height */}
      {/* --- CHANGE: Light Theme Header --- */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between flex-shrink-0 z-10 shadow-sm">
        {/* Left Side: Toggle, Back, Project Name */}
        <div className="flex items-center space-x-3">
          {/* Toggle Button */}
          <button
            onClick={toggleSidebar} // Use existing function
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md cursor-pointer" // Light theme button
            title="Toggle Sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          {/* Dashboard Button */}
          <button
            onClick={() => router.push("/dashboard")}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md cursor-pointer" // Added cursor-pointer
            title="Back to Dashboard"
          >

            <Home className="h-5 w-5" /> {/* Use Home icon */}
          </button>
          <div className="h-5 border-l border-gray-300"></div> {/* Lighter separator */}
          {/* Project Name */}
           <EditableProjectName
             projectId={projectId}
             initialTitle={projectData?.title || "Untitled Project"}
             className="font-medium text-gray-800 text-base"
             // --- CHANGE: Pass the update handler ---
             onTitleChange={handleProjectTitleChange}
           />
          {/* File Name Indicator */}
          {currentFileName && (
            <div className="flex items-center text-sm text-gray-500 ml-2">
              <span className="mx-1">/</span>
              <span className="text-gray-700 font-medium">{currentFileName}</span>
              {/* --- CHANGE: Unsaved indicator for non-image files --- */}
              {!isSaved && !isImageFile(currentFileName) && <span className="ml-1 text-blue-500 text-lg">•</span>}
            </div>
          )}
        </div>
        {/* Right Side: Actions, Chat Toggle, View Modes */}
        <div className="flex items-center space-x-2">
          {/* --- CHANGE: Refined View Mode Toggles --- */}
          <div className="hidden md:flex items-center border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            <button
              onClick={() => setViewMode('code')}
              className={`cursor-pointer p-2 transition-colors duration-150 ${viewMode === 'code'
                  ? 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-600 border-r border-gray-200'
                  : 'text-gray-500 hover:bg-gray-50'
                }`}
              title="Editor Only"
            >
              <Edit className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`cursor-pointer p-2 transition-colors duration-150 ${viewMode === 'split'
                  ? 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-600 border-r border-gray-200'
                  : 'text-gray-500 hover:bg-gray-50'
                }`}
              title="Split View"
            >
              <Layout className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('pdf')}
              className={`cursor-pointer p-2 transition-colors duration-150 ${viewMode === 'pdf'
                  ? 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-600'
                  : 'text-gray-500 hover:bg-gray-50'
                }`}
              title="Preview Only"
            >
              <Eye className="h-4 w-4" />
            </button>
          </div>

          {/* --- CHANGE: Refined Action Buttons --- */}
          {/* Save Button */}
          <button
            ref={saveButtonRef}
            onClick={handleSave}
            disabled={isSaved || !currentFileId || isImageFile(currentFileName)}
            className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 ${isSaved || !currentFileId || isImageFile(currentFileName)
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                : 'cursor-pointer bg-blue-600 text-white hover:bg-blue-700 border border-blue-600 focus:ring-blue-500'
              }`}
            title="Save (Ctrl+S)"
          >
            <Save className="h-4 w-4 mr-1.5" /> Save
          </button>

          {/* --- CHANGE: Refined Compile Button Style --- */}
          <button
            ref={compileButtonRef}
            onClick={handleCompile}
            disabled={isCompiling || !currentFileId || !currentFileName?.toLowerCase().endsWith('.tex')}
            className={`cursor-pointer flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 ${isCompiling || !currentFileId || !currentFileName?.toLowerCase().endsWith('.tex')
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200' // Disabled state
                // Updated Enabled State: Use a gray shade
                : 'bg-gray-600 text-white hover:bg-gray-700 border border-gray-600 focus:ring-gray-500'
              }`}
            title="Compile (Ctrl+Enter)"
          >
            {isCompiling ? <Loader className="h-4 w-4 mr-1.5 animate-spin" /> : <Play className="h-4 w-4 mr-1.5" />} Compile
          </button>
          {/* Download Button (PDF) */}
          <button
            onClick={handleDownloadPdf}
            disabled={!pdfData}
            className={`cursor-pointer p-1.5 rounded-lg text-sm font-medium transition-all duration-150 shadow-sm border focus:outline-none focus:ring-2 focus:ring-offset-1 ${!pdfData
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200'
                : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-300 hover:border-gray-400 focus:ring-indigo-500'
              }`}
            title="Download PDF"
          >
            <Download className="h-5 w-5" />
          </button>

          {/* Chat Toggle Button */}
          <HeaderChatButton /> {/* Use the existing component */}
        </div>

      </header>
      <div className="flex-1 flex overflow-hidden scrollbar-thin scrollbar-thumb-gray-300 hover:scrollbar-thumb-gray-400 scrollbar-track-gray-100">
        {/* Sidebar with Light Theme */}
        {!isSidebarCollapsed && (
          <ResizablePanel
            direction="horizontal"
            initialSize={sidebarWidth}
            minSize={200}
            maxSize={500}
            onChange={setSidebarWidth}
            className="h-full flex-shrink-0 bg-white border-r border-gray-200 shadow-sm flex flex-col"
            resizeFrom="end"
          >
            {/* Light Theme Sidebar Header */}
            <div className="p-2 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
              <h3 className="font-medium text-sm text-gray-700 pl-1">PROJECT FILES</h3>
              <div className="flex space-x-1">
                <button
                  onClick={() => handleCreateFile(null)}
                  className="p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  title="New File"
                >
                  <FilePlus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleCreateFolder(null)}
                  className="p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  title="New Folder"
                >
                  <FolderPlus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  title="Upload Files"
                >
                  <Upload className="h-4 w-4" />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  multiple
                />
              </div>
            </div>
            {/* File Tree Container with Light Scrollbars */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300 hover:scrollbar-thumb-gray-400 scrollbar-track-gray-100">
              {renderFileTree()}
            </div>
          </ResizablePanel>
        )}

        {/* Main editor area - Ensure left border is 0 width */}
        <div className="flex-1 overflow-hidden h-full relative" ref={contentRef}>

          {viewMode === "code" && !isImageView && (
            <div className="w-full h-full bg-white overflow-hidden">
              <CodeMirror
                ref={editorRef}
                value={code}
                height="100%"
                extensions={editorExtensions}
                onChange={handleCodeChange}
                onCreateEditor={handleEditorCreate}
                theme="light"
                className="h-full"
              />
            </div>
          )}

          {/* Split view (code + preview) */}
          {/* Split view (code + preview) */}
          {viewMode === "split" && !isImageView && (
            <div className="flex w-full h-full">
              {/* Editor */}
              <div
                className="h-full relative panel-transition"
                style={{ width: `${editorRatio * 100}%` }}
              >
                <div className="absolute inset-0 overflow-hidden bg-white">
                  <CodeMirror
                    ref={editorRef}
                    value={code}
                    height="100%"
                    extensions={editorExtensions}
                    onChange={handleCodeChange}
                    onCreateEditor={handleEditorCreate}
                    theme="light"
                    className="h-full"
                  />
                </div>
              </div>

              {/* Resize Handle */}
              <div
                className="w-1.5 h-full cursor-col-resize flex items-center justify-center bg-gray-200 hover:bg-blue-200 active:bg-blue-300 z-10 resize-handle"
                onMouseDown={startEditorResize}
              >
                <div className="w-px h-8 bg-gray-400"></div>
              </div>

              {/* Preview */}
              <div
                className="h-full overflow-hidden panel-transition"
                style={{ width: `calc(${(1 - editorRatio) * 100}% - 8px)` }}
              >
                {isCompiling ? (
                  // Compiling Loader
                  <div className="h-full flex items-center justify-center bg-gray-100">
                    <div className="flex flex-col items-center">
                      <Loader className="h-8 w-8 text-blue-500 animate-spin" />
                      <p className="mt-3 text-gray-600">Compiling LaTeX...</p>
                    </div>
                  </div>
                ) : compilationError ? (
                  // Compilation Error
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-red-50 border border-red-200">
                    <X className="h-10 w-10 text-red-400 mb-3" />
                    <h3 className="font-semibold text-red-700 mb-2">Compilation Error</h3>
                    <pre className="text-xs text-left text-red-600 bg-white p-3 rounded border border-red-100 max-h-60 overflow-auto w-full max-w-md font-mono">
                      {compilationError}
                    </pre>
                  </div>
                ) : !pdfData ? (
                  // No PDF Preview
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-gray-100">
                    <FileText className="h-12 w-12 text-gray-300 mb-4" />
                    <p className="text-gray-600 font-medium mb-2">No PDF Preview</p>
                    <p className="text-gray-500 text-sm mb-4">
                      Compile your document to see the preview.
                    </p>
                    <button
                      onClick={handleCompile}
                      className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    >
                      Compile Now
                    </button>
                  </div>
                ) : (
                  // PDF Viewer (Container Styling)
                  <div className="h-full bg-gray-100">
                    <PdfViewer
                      pdfData={pdfData}
                      isLoading={isCompiling}
                      error={compilationError}
                      htmlPreview={htmlPreview || undefined}
                      documentTitle={currentFileName || projectData?.title || "document"}
                      onRecompileRequest={handleCompile}
                    />
                  </div>
                )}
              </div>
            </div>
          )}


          {/* PDF-only view (unchanged) */}
          {viewMode === "pdf" && !isImageView && (
            <div className="w-full h-full">
              {isCompiling ? (
                <div className="h-full flex items-center justify-center bg-gray-900">
                  <div className="flex flex-col items-center">
                    <Loader className="h-10 w-10 text-blue-500 animate-spin" />
                    <p className="mt-4 text-gray-400">Compiling LaTeX...</p>
                  </div>
                </div>
              ) : compilationError ? (
                <div className="h-full flex items-center justify-center p-4 bg-gray-900">
                  <div className="max-w-lg p-6 bg-gray-800 border border-red-800 rounded-lg">
                    <h3 className="text-lg font-medium text-red-400 mb-2">Compilation Error</h3>
                    <pre className="text-sm text-red-300 whitespace-pre-wrap font-mono bg-gray-900 p-4 rounded border border-red-900 max-h-80 overflow-auto">
                      {compilationError}
                    </pre>
                  </div>
                </div>
              ) : !pdfData ? (
                <div className="h-full flex items-center justify-center bg-gray-900">
                  <div className="text-center max-w-md p-6">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-gray-400 text-lg font-medium mb-2">No PDF Preview</p>
                    <p className="text-gray-500 mb-4">Click "Compile" to generate a PDF preview of your LaTeX document.</p>
                    <button
                      onClick={handleCompile}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Compile Now
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-full">
                  <PdfViewer
                    pdfData={pdfData}
                    isLoading={isCompiling}
                    error={compilationError}
                    htmlPreview={htmlPreview || undefined}
                    documentTitle={currentFileName || projectData?.title || "document"}
                    onRecompileRequest={handleCompile}
                    hideToolbar={false}
                  />
                </div>
              )}
            </div>
          )}


          {/* Image view */}
          {isImageView && (
            <div className="w-full h-full bg-gray-900">
              <ImagePreview
                filename={currentFileName}
                fileId={currentFileId || ""}
                projectId={projectId}
              />
            </div>
          )}
        </div>

        {/* Chat Panel - integrated with smooth resizing */}
        {isChatOpen && (
          <ChatPanel
            isOpen={isChatOpen}
            onClose={closeChat}
            projectId={projectId}
            userId={userId}
            activeSession={activeSession}
            editorView={isEditorReady && editorRef.current ? editorRef.current.view : null}
            currentFileName={currentFileName}
            currentFileId={currentFileId}
            activeSessionId={activeSessionId}
            currentFileContent={code} // Pass the current code state
            projectFiles={chatFileList}
            onShowSuggestion={handleShowSuggestion}
            onSuggestionReject={() => console.log("[LatexEditor] Suggestion rejected.")}
            onFileSelect={handleFileSelect} // Keep if ChatWindow needs it
            onFileUpload={handleChatFileUpload} // Keep if ChatWindow needs it
            initialWidth={350}
            minWidth={280}
            maxWidth={600}
            className="z-10"
          />

        )}
      </div>

      {/* Status bar - fixed height */}
      {/* Status Bar */}
      {/* --- CHANGE: Light Theme Status Bar --- */}
      <div className="h-6 bg-white border-t border-gray-200 flex items-center justify-between px-4 text-xs text-gray-500 flex-shrink-0">
        <div className="flex items-center space-x-3">
          {/* TODO: Get cursor position from CodeMirror */}
          <span>Ln ?, Col ?</span>
          <span>{code.split('\n').length} Lines</span>
          <span>UTF-8</span>
        </div>
        <div className="flex items-center space-x-3">
          {/* Saved status */}
          {!isSaved && !isImageFile(currentFileName) ? (
            <span className="text-blue-600 font-medium">Unsaved Changes</span>
          ) : (
            <span className="text-green-600">Saved</span>
          )}
          {/* Auto-compile toggle */}
          <label className="flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoCompile}
              onChange={(e) => setAutoCompile(e.target.checked)}
              className="mr-1.5 h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 focus:ring-1"
            />
            Auto-compile
          </label>
          <span className="text-gray-400">Kepler Editor</span> {/* App Name */}
        </div>
      </div>


{/* Context Menu */}
{contextMenu && (
  <div
    ref={contextMenuRef}
    style={{
      position: 'fixed',
      left: `${contextMenu.x}px`,
      top: `${contextMenu.y}px`,
      zIndex: 50
    }}
    className="bg-white rounded-md shadow-lg border border-gray-200 py-1 min-w-[160px]"
  >
    {/* File Actions */}
    {files.find(f => f.id === contextMenu.itemId)?.type === 'file' && (
      <>
        <button
          onClick={() => {
            const item = files.find(f => f.id === contextMenu.itemId);
            if (item) handleFileSelect(item.id, item.name, item.content);
            setContextMenu(null);
          }}
          className="w-full text-left px-3 py-1.5 text-sm flex items-center hover:bg-gray-100 text-gray-700"
        >
          <FileText className="h-4 w-4 mr-2 text-gray-500" />
          Open File
        </button>

        {/* Rename Action for File */}
        <button
          onClick={() => {
            handleStartRename(
              contextMenu.itemId,
              files.find(f => f.id === contextMenu.itemId)?.name || ''
            );
            setContextMenu(null);
          }}
          className="w-full text-left px-3 py-1.5 text-sm flex items-center hover:bg-gray-100 text-gray-700"
        >
          <Edit2 className="h-4 w-4 mr-2 text-gray-500" />
          Rename
        </button>
      </>
    )}

    {/* Folder Actions */}
    {files.find(f => f.id === contextMenu.itemId)?.type === 'folder' && (
      <>
        <button
          onClick={() => {
            handleCreateFile(contextMenu.itemId);
            setContextMenu(null);
          }}
          className="w-full text-left px-3 py-1.5 text-sm flex items-center hover:bg-gray-100 text-gray-700"
        >
          <FilePlus className="h-4 w-4 mr-2 text-gray-500" />
          New File Here
        </button>
        <button
          onClick={() => {
            handleCreateFolder(contextMenu.itemId);
            setContextMenu(null);
          }}
          className="w-full text-left px-3 py-1.5 text-sm flex items-center hover:bg-gray-100 text-gray-700"
        >
          <FolderPlus className="h-4 w-4 mr-2 text-gray-500" />
          New Folder Here
        </button>

        {/* Rename Action for Folder */}
        <button
          onClick={() => {
            handleStartRename(
              contextMenu.itemId,
              files.find(f => f.id === contextMenu.itemId)?.name || ''
            );
            setContextMenu(null);
          }}
          className="w-full text-left px-3 py-1.5 text-sm flex items-center hover:bg-gray-100 text-gray-700"
        >
          <Edit2 className="h-4 w-4 mr-2 text-gray-500" />
          Rename
        </button>
      </>
    )}

    {/* Separator */}
    <div className="border-t border-gray-200 my-1 mx-2"></div>

    {/* Delete Action */}
    <button
      onClick={() => {
        handleDeleteItem(contextMenu.itemId);
        setContextMenu(null);
      }}
      className="w-full text-left px-3 py-1.5 text-sm flex items-center text-red-600 hover:bg-red-50"
    >
      <Trash2 className="h-4 w-4 mr-2" />
      Delete
    </button>
  </div>
)}

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 max-w-xl w-full m-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-100">Upload Files</h2>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-200 rounded-full"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-gray-300 text-sm mb-4">
                Upload files to your LaTeX project. You can upload .tex files, images, and other resources.
              </p>

              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />

              <div
                className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-gray-700/50"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-300">
                  Drag files here or click to browse
                </p>
                <p className="text-gray-500 text-sm mt-2">
                  Support for .tex, .bib, images, and more
                </p>
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Suggestion Overlay Modal */}
      {modalSuggestion && isEditorReady && editorViewRef.current && typeof document !== 'undefined' && (
        ReactDOM.createPortal(
          <SuggestionOverlay
            key={modalSuggestion.mode + (modalSuggestion.diffHunks?.[0] || modalSuggestion.searchReplaceBlocks?.[0]?.search || 'modal')}
            mode={modalSuggestion.mode}
            diffHunks={modalSuggestion.diffHunks}
            searchReplaceBlocks={modalSuggestion.searchReplaceBlocks}
            explanation={modalSuggestion.explanation}
            originalContent={originalContentForOverlayDiff}
            isLoadingFallback={isLoadingFallback}
            onApplyDiff={handleApplyDiffSuggestion}
            onApplySearchReplace={handleApplySearchReplace}
            onReject={handleRejectAndClose}
            editorView={editorViewRef.current}
            fileName={currentFileName || 'current file'}
            // --- CHANGE: Apply light theme styles ---
            className="suggestion-overlay-light"
          />,
          document.body
        )
      )}
      {/* --- CHANGE: Add CSS for the light theme overlay --- */}
      <style jsx global>{`
  .suggestion-overlay-light {
    /* Light backdrop */
    background-color: rgba(249, 250, 251, 0.7); /* bg-gray-50 with opacity */
    backdrop-filter: blur(4px);
  }
  .suggestion-overlay-light .overlay-content {
    /* Light content box */
    background-color: white;
    border: 1px solid #e5e7eb; /* border-gray-200 */
    color: #111827; /* text-gray-900 */
    border-radius: 0.5rem; /* rounded-lg */
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1),
                0 4px 6px -2px rgba(0, 0, 0, 0.05); /* shadow-lg */
  }
  .suggestion-overlay-light .diff-viewer {
    /* Light diff viewer border */
    border: 1px solid #e5e7eb; /* border-gray-200 */
    border-radius: 0.375rem; /* rounded-md */
  }
  /* Example button styling - match dashboard */
  .suggestion-overlay-light .apply-button {
    background-color: #2563eb; /* bg-blue-600 */
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem; /* rounded-md */
    font-size: 0.875rem; /* text-sm */
    font-weight: 500; /* font-medium */
    transition: background-color 0.15s ease;
  }
  .suggestion-overlay-light .apply-button:hover {
    background-color: #1d4ed8; /* bg-blue-700 */
  }
  .suggestion-overlay-light .reject-button {
    background-color: white;
    color: #374151; /* text-gray-700 */
    border: 1px solid #d1d5db; /* border-gray-300 */
    padding: 0.5rem 1rem;
    border-radius: 0.375rem; /* rounded-md */
    font-size: 0.875rem; /* text-sm */
    transition: background-color 0.15s ease;
  }
  .suggestion-overlay-light .reject-button:hover {
    background-color: #f9fafb; /* bg-gray-50 */
  }
  .suggestion-overlay-light h3 {
    /* Style heading */
    color: #1f2937; /* text-gray-800 */
    font-weight: 600; /* font-semibold */
  }
  .suggestion-overlay-light p {
    /* Style explanation text */
    color: #4b5563; /* text-gray-600 */
  }
  .suggestion-overlay-light code {
    /* Style inline code if any */
    background-color: #f3f4f6; /* bg-gray-100 */
    color: #1f2937; /* text-gray-800 */
    padding: 0.1rem 0.3rem;
    border-radius: 0.25rem;
    font-size: 0.8em;
  }
`}</style>




    </div>
  );
};

export default EnhancedLatexEditorWrapper;