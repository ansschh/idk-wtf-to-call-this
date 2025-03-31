// components/ChatWindow.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import chatService from '@/services/chatService';
import {
  X, Code, Send, Plus, Clock, ChevronDown, Paperclip, File, MessageSquare,
  Folder,
  Download, Check, Loader, Edit, Image as ImageIcon // <--- ADD IT HERE
} from 'lucide-react';
import DiffViewer from './DiffViewer'; // Import the DiffViewer
import SuggestionOverlay from './SuggestionOverlay';
import ResizablePanel from './ResizablePanel';
import { DocumentContextManager } from '../utils/DocumentContextManager';
import { LaTeXTreeProcessor } from '../utils/LaTeXTreeProcessor';
import { applyMultipleUnifiedDiffPatches, applyFullContentChange } from '../utils/editorUtils';
import { ChatFileUtils } from '../utils/ChatFileUtils';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { useChat } from '../context/ChatContext';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import {
  collection,
  query,
  where,
  orderBy,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  onSnapshot,
  getDoc,
  Timestamp // <--- Added import for Timestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { EditorView } from '@codemirror/view';
import { Copy } from 'lucide-react';

const Logger = console;

interface ChatMessage {
  id: string;
  sender: string;
  content: string; // Explanation
  timestamp: Date;
  attachments?: any[];
  mentions?: any[];
  diffHunks?: string[]; // Store diffs here instead of suggestions
  isError?: boolean;
}




interface AttachedFile {
  id: string;
  name: string;
  type: string;
  url: string;
  size?: number;
  content?: string; // For text files
}

interface FileMention {
  id: string;
  name: string;
  type: 'file' | 'folder';
}

interface LLMModel {
  id: string;
  name: string;
  provider: string;
  providerName: string;
}

interface ChatSession {
  id: string;
  title: string;
  timestamp: Date;
  messages: ChatMessage[];
  currentModel: LLMModel;
}

interface ChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  userId: string;
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  editorView?: EditorView | null;
  className?: string;
  currentFileName?: string;
  currentFileId?: string;
  currentFileContent?: string;
  onShowSuggestion?: (
    diffHunks: string[], // Expect an array of diff strings
    explanation: string,
    originalContent: string // Still need original editor content for diff base in overlay
  ) => void;

  projectFiles?: { id: string, name: string, type: string }[];
  onSuggestionReject?: () => void;
  onFileSelect?: (fileId: string) => void;
  onFileUpload?: (file: File) => Promise<string>;

}


// Available LLM Models
const AVAILABLE_MODELS: LLMModel[] = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', providerName: 'OpenAI' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', providerName: 'OpenAI' },
  { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'anthropic', providerName: 'Anthropic' },
  { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'anthropic', providerName: 'Anthropic' },
  { id: 'gemini-pro', name: 'Gemini Pro', provider: 'google', providerName: 'Google' },
  { id: 'gemini-ultra', name: 'Gemini Ultra', provider: 'google', providerName: 'Google' }
];

// Type guard for file mentions - for use in rendering
const isFileMention = (item: any): item is FileMention => {
  return item &&
    typeof item === 'object' &&
    'id' in item &&
    'name' in item &&
    'type' in item;
};

// Adding performance styles for smooth resizing
const RESIZE_STYLES = `
  body.resizing * {
    pointer-events: none !important;
  }
  
  body.resizing .resize-handle {
    pointer-events: auto !important;
  }
  
  body.resizing .panel-transition {
    transition: none !important;
  }
  
  .resize-handle {
    touch-action: none;
    will-change: transform;
  }
  
  .panel-transition {
    transition: width 0.1s ease, height 0.1s ease;
  }
  
  .chat-window-container {
    transform: translateZ(0);
    backface-visibility: hidden;
    perspective: 1000px;
    contain: layout size style paint;
  }
  
  .message-container {
    contain: content;
    max-width: 100%;
  }

  .messages-container {
    scrollbar-width: thin;
    scrollbar-color: rgba(113, 128, 150, 0.4) rgba(26, 32, 44, 0.1);
    scroll-behavior: smooth;
    overflow-anchor: auto;
  }

  .messages-container::-webkit-scrollbar {
    width: 6px;
  }

  .messages-container::-webkit-scrollbar-track {
    background: rgba(26, 32, 44, 0.1);
    border-radius: 3px;
  }

  .messages-container::-webkit-scrollbar-thumb {
    background: rgba(113, 128, 150, 0.4);
    border-radius: 3px;
  }

  .messages-container::-webkit-scrollbar-thumb:hover {
    background: rgba(113, 128, 150, 0.6);
  }
`;



const ChatWindow: React.FC<ChatWindowProps> = ({
  isOpen,
  onClose,
  projectId,
  userId,
  initialWidth = 350,
  minWidth = 280,
  maxWidth = 600,
  className = '',
  currentFileName = '',
  currentFileId = '',
  currentFileContent = '',
  projectFiles = [],
  editorView,
  onShowSuggestion,
  onSuggestionReject,
  onFileSelect,
  onFileUpload
}) => {
  // State for chat sessions
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [loading, setLoading] = useState(true);

  // UI state
  const [newMessage, setNewMessage] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isAttaching, setIsAttaching] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState(false);
  const [width, setWidth] = useState(initialWidth);
  const { activeSessionId: contextActiveSessionId, setActiveSessionId } = useChat();

  // File mention state
  const [mentionSearch, setMentionSearch] = useState<string>('');
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionStartPos, setMentionStartPos] = useState<number>(-1);
  const [filteredMentions, setFilteredMentions] = useState<{ id: string, name: string, type: string }[]>([]);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const editorRef = useRef<{ view?: EditorView }>(null); // Assuming LatexEditor passes this down or you get it
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // Upload error state
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Added for resize performance
  const [isResizing, setIsResizing] = useState(false);

  const chatContext = useChat(); // Get the whole context object
  const rafRef = useRef<number | null>(null);
  const lastAppliedWidth = useRef(initialWidth);
  const MOVEMENT_THRESHOLD = 2; // Minimum movement in pixels to trigger resize

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const unsubscribeRef = useRef<() => void | null>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  console.log('[ChatWindow Render] Editor Ref View available:', !!editorRef?.current?.view);


  const parseMentions = useCallback((message: string): { text: string, mentions: FileMention[] } => {
    const mentions: FileMention[] = [];
    const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g; // Define regex locally or import

    let match;
    while ((match = MENTION_REGEX.exec(message)) !== null) {
      const name = match[1];
      const id = match[2];
      const fileInfo = projectFiles.find(f => f.id === id); // Use projectFiles prop
      const type = fileInfo?.type === 'folder' ? 'folder' : 'file';
      mentions.push({ id, name, type });
    }
    const cleanText = message.replace(MENTION_REGEX, '@$1');
    return { text: cleanText, mentions };
  }, [projectFiles]); // Depend on projectFiles prop

  // --- Mention Rendering Logic (Integrated) ---
  // Define this inside the ChatWindow component function scope
  const renderTextWithMentions = useCallback((
    text: string,
    mentions: FileMention[] = []
  ): React.ReactNode => {
    if (!mentions || mentions.length === 0) return text;

    const mentionMap = new Map<string, FileMention>();
    mentions.forEach(mention => mentionMap.set(mention.name, mention));
    const parts = text.split('@');

    if (parts.length === 1) return text;

    const elementsToRender: React.ReactNode[] = [parts[0]];
    parts.slice(1).forEach((part, index) => {
      const mentionName = mentions.find(m => part.startsWith(m.name))?.name;
      if (mentionName) {
        const mention = mentionMap.get(mentionName);
        const restOfText = part.substring(mentionName.length);
        elementsToRender.push(
          <React.Fragment key={`mention-${index}`}>
            <span
              className="inline-flex items-center bg-blue-600/30 px-1.5 rounded-md text-blue-300 cursor-pointer hover:bg-blue-600/40"
              onClick={() => mention && onFileSelect && onFileSelect(mention.id)} // Use onFileSelect prop
            >
              @{mentionName}
            </span>
            {restOfText}
          </React.Fragment>
        );
      } else {
        elementsToRender.push(<React.Fragment key={`text-${index}`}>@{part}</React.Fragment>);
      }
    });
    return <React.Fragment>{elementsToRender}</React.Fragment>;
  }, [onFileSelect]); // Depend on onFileSelect prop

  // --- Helper Function to get File Content ---
  const getFileContent = useCallback(async (fileId: string): Promise<string | null> => {
    Logger.log(`[getFileContent] Fetching content for fileId: ${fileId}`);
    try {
      const result = await ChatFileUtils.getFileContent(fileId);
      if (result.success && typeof result.content === 'string') {
        Logger.log(`[getFileContent] Success for ${fileId}`);
        return result.content;
      }
      Logger.warn(`[getFileContent] Failed for ${fileId}: ${result.error}`);
      return null;
    } catch (error) {
      Logger.error(`[getFileContent] Exception for ${fileId}:`, error);
      return null;
    }
  }, []); // ChatFileUtils is static, no dependencies needed



  useEffect(() => {
    const initializeChat = async () => {
      if (isOpen && projectId && userId) {
        try {
          // Initialize document context when chat is opened
          const contextManager = new DocumentContextManager(projectId, userId);
          if (currentFileId) {
            await contextManager.initializeContext(currentFileId);
          }

          // Context is now available to the chat service
          console.log("Chat document context initialized");
        } catch (error) {
          console.error("Error initializing chat document context:", error);
        }
      }
    };

    initializeChat();
  }, [isOpen, projectId, userId, currentFileId]);

  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = RESIZE_STYLES;
    document.head.appendChild(styleElement);

    return () => {
      if (document.head.contains(styleElement)) {
        document.head.removeChild(styleElement);
      }
    };
  }, []);

  // Load chat sessions from Firestore
  useEffect(() => {
    const loadChatSessions = async () => {
      if (!projectId || !userId) {
        console.warn('[ChatWindow Load] Missing projectId or userId');
        setLoading(false); // Stop loading if cannot proceed
        return;
      }
      try {

        console.log('[ChatWindow Load] Fetching sessions...');
        const chatSessionsRef = collection(db, "chatSessions");
        const q = query(chatSessionsRef, where("projectId", "==", projectId), where("userId", "==", userId), orderBy("lastUpdated", "desc"))

        const querySnapshot = await getDocs(q);
        const sessions: ChatSession[] = [];

        // Process each session
        for (const doc of querySnapshot.docs) {
          const data = doc.data();

          // Load messages for this session
          const messagesRef = collection(db, "chatSessions", doc.id, "messages");
          const messagesQuery = query(messagesRef, orderBy("timestamp", "asc"));
          const messagesSnapshot = await getDocs(messagesQuery);

          const messages: ChatMessage[] = messagesSnapshot.docs.map(msgDoc => {
            const msgData = msgDoc.data();

            return {
              id: msgDoc.id,
              sender: msgData.sender,
              content: msgData.content,
              // SAFER TIMESTAMP HANDLING:
              timestamp:
                msgData.timestamp instanceof Timestamp
                  ? msgData.timestamp.toDate()
                  : msgData.timestamp instanceof Date
                    ? msgData.timestamp
                    : new Date(),
              attachments: msgData.attachments || [],
              mentions: msgData.mentions || [],
              suggestions: msgData.suggestions || []
            };
          });

          // Find the model or use default
          const modelId = data.modelId || 'gpt-4o';
          const model = AVAILABLE_MODELS.find(m => m.id === modelId) || AVAILABLE_MODELS[0];

          sessions.push({
            id: doc.id,
            title: data.title || 'New Chat',
            // SAFER TIMESTAMP HANDLING:
            timestamp:
              data.timestamp instanceof Timestamp
                ? data.timestamp.toDate()
                : data.timestamp instanceof Date
                  ? data.timestamp
                  : new Date(),
            messages: messages,
            currentModel: model
          });
        }

        setChatSessions(sessions);
        console.log(`[ChatWindow Load] Found ${sessions.length} sessions.`);


        // Create a default session if none exist
        if (sessions.length === 0) {
          console.log('[ChatWindow Load] No sessions found, creating new one...');
          const newSession = await createNewChatInFirestore(); // Ensure this uses context setter
          if (newSession) {
            console.log(`[ChatWindow Load] New session created and set active: ${newSession.id}`);
          } else {
            console.error('[ChatWindow Load] Failed to create new session.');
            chatContext.setActiveSessionId(null); // Explicitly set null in context on failure
          }
        } else {
          console.log(`[ChatWindow Load] Setting active session from existing: ${sessions[0].id}`);
          chatContext.setActiveSessionId(sessions[0].id); // Set ID in context
          // setActiveSession(sessions[0]); // Let the sync effect handle setting local state
        }
      } catch (error) {
        console.error("[ChatWindow Load] Error loading/setting sessions:", error);
        chatContext.setActiveSessionId(null); // Set context ID to null on error
        setActiveSession(null); // Clear local state too
      } finally {
        setLoading(false);
        console.log('[ChatWindow Load] Loading finished.');
      }
    };

    if (isOpen) {
      loadChatSessions();
    }

    return () => {
      // Clean up any listeners when component unmounts
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [projectId, userId, isOpen, chatContext.setActiveSessionId]);

  // Subscribe to updates for the active session
  // Subscribe to updates for the active session
  // Inside the useEffect hook depending on [contextActiveSessionId]
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    const currentSessionId = contextActiveSessionId; // Capture context ID

    const subscribeToMessages = () => {
      if (unsubscribe) unsubscribe(); // Clean previous listener

      if (!currentSessionId) {
        Logger.log("[ChatWindow Listener] No active session ID, clearing messages.");
        setChatMessages([]); // Clear displayed messages
        return;
      }

      Logger.log(`[ChatWindow Listener] Subscribing to messages for session: ${currentSessionId}`);
      const messagesRef = collection(db, "chatSessions", currentSessionId, "messages");
      const messagesQuery = query(messagesRef, orderBy("timestamp", "asc"));

      unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
        // --- SIMPLIFIED LOGIC ---
        Logger.log(`[ChatWindow Listener] Firestore snapshot for ${currentSessionId}. Docs: ${snapshot.docs.length}, PendingWrites: ${snapshot.metadata.hasPendingWrites}`);

        const updatedMessages: ChatMessage[] = snapshot.docs.map(doc => {
          const data = doc.data();
          // Map Firestore data to ChatMessage interface
          return {
            id: doc.id, // Use the REAL Firestore ID
            sender: data.sender || 'Unknown',
            content: data.content || '',
            timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(),
            attachments: data.attachments || [],
            mentions: data.mentions || [],
            diffHunks: data.diffHunks || [],
            isError: data.isError || false,
          };
        });

        setChatMessages(updatedMessages); // <-- Directly update state with the full list

        Logger.log(`[ChatWindow Listener] Updated chatMessages state with ${updatedMessages.length} messages.`);
        // --- END SIMPLIFIED LOGIC ---

      }, (error) => {
        Logger.error(`[ChatWindow Listener] Error for session ${currentSessionId}:`, error);
        setChatMessages([]); // Clear messages on error
      });
    };

    subscribeToMessages();

    // Cleanup function
    return () => {
      if (unsubscribe) {
        Logger.log(`[ChatWindow Listener] Unsubscribing from session: ${currentSessionId}`);
        unsubscribe();
      }
    };
  }, [contextActiveSessionId]); // Re-run ONLY when the context activeSessionId changes

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && !loading) {
      inputRef.current?.focus();
    }
  }, [isOpen, loading]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (activeSession?.messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeSession?.messages]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowChatHistory(false);
      }
      if (mentionListRef.current && !mentionListRef.current.contains(e.target as Node)) {
        setShowMentionList(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle file mention search filtering
  useEffect(() => {
    if (mentionSearch) {
      const filtered = projectFiles.filter(file =>
        file.name.toLowerCase().includes(mentionSearch.toLowerCase())
      );
      setFilteredMentions(filtered);
      setSelectedMentionIndex(0);
    } else {
      setFilteredMentions(projectFiles);
    }
  }, [mentionSearch, projectFiles]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const renderMessageContent = (msg: ChatMessage): JSX.Element => {

    // Nested helper to process inline code segments
    // It needs the outer `renderTextWithMentions` which correctly handles mentions
    const processInlineCode = (
      text: string,
      regex: RegExp
    ): React.ReactNode[] => {
      const inlineParts: React.ReactNode[] = [];
      let lastInlineIndex = 0;

      text.replace(regex, (match, code, offset) => {
        // Render text before the inline code (passing through mention renderer)
        if (offset > lastInlineIndex) {
          inlineParts.push(renderTextWithMentions(text.substring(lastInlineIndex, offset), msg.mentions));
        }
        // Render the inline code itself
        inlineParts.push(
          <code key={`inline-code-${offset}-${msg.id}`} className="bg-gray-800/70 text-red-300/90 px-1 py-0.5 rounded text-[0.85em] font-mono mx-[1px]">
            {code}
          </code>
        );
        lastInlineIndex = offset + match.length;
        return ''; // Necessary for replace function
      });

      // Render any remaining text after the last inline code
      if (lastInlineIndex < text.length) {
        inlineParts.push(renderTextWithMentions(text.substring(lastInlineIndex), msg.mentions));
      }
      return inlineParts;
    };

    // --- Main Rendering Logic ---
    const contentToRender = msg.content || "";
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    const inlineCodeRegex = /`([^`]+?)`/g; // Non-greedy match for inline code
    const parts: React.ReactNode[] = []; // Array to hold JSX elements and strings
    let lastIndex = 0;

    // 1. Process Block Code
    contentToRender.replace(codeBlockRegex, (match, lang, code, offset) => {
      // Add the text segment *before* this code block (processing it for inline code/mentions)
      if (offset > lastIndex) {
        const textPart = contentToRender.substring(lastIndex, offset);
        parts.push(...processInlineCode(textPart, inlineCodeRegex)); // Use the helper
      }

      // Add the formatted code block element
      const language = lang || 'latex'; // Default language
      parts.push(
        <div key={`code-block-${offset}-${msg.id}`} className="my-2 relative group text-left"> {/* Ensure text-left */}
          <SyntaxHighlighter
            language={language}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              padding: '0.75em', // Reduced padding slightly
              borderRadius: '4px',
              fontSize: '0.8rem', // Consistent small font size
              backgroundColor: '#161616', // Darker bg for contrast
            }}
            wrapLongLines={true}
            PreTag="div" // Use div for better wrapping control
          >
            {code.trim()}
          </SyntaxHighlighter>
          <button
            onClick={() => copyToClipboard(code.trim())}
            className="absolute top-1 right-1 p-1 bg-gray-700/50 text-gray-400 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-600 hover:text-gray-200"
            title="Copy code"
          >
            <Copy className="h-3 w-3" /> {/* Smaller copy icon */}
          </button>
        </div>
      );

      lastIndex = offset + match.length;
      return ''; // Necessary for replace behavior
    });

    // 2. Process Remaining Text (after the last code block)
    if (lastIndex < contentToRender.length) {
      const textPart = contentToRender.substring(lastIndex);
      parts.push(...processInlineCode(textPart, inlineCodeRegex)); // Use the helper
    }

    // 3. Prepare Image Thumbnails (only for user messages with valid image attachments)
    const imageAttachments = msg.sender === 'You'
      ? msg.attachments?.filter(att => att.type?.startsWith('image/') && att.url) // Allow https too
      : [];

    const nonImageAttachments = msg.attachments?.filter(att => !att.type?.startsWith('image/')) || [];



    // 4. Combine all parts and image thumbnails
    return (
      <div className="text-sm whitespace-pre-wrap break-words">
        {/* Render the processed text and code blocks */}
        {parts}

        {/* Render Image Thumbnails Below Text if they exist */}
        {/* Render Image Thumbnails Below Text */}
        {imageAttachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {imageAttachments.map((att, idx) => (
              <img
                // --- FIX: Use robust key ---
                key={att.id || `img-att-${idx}-${msg.id}`}
                src={att.url} // Assumes URL is correct (data or https)
                alt={att.name || 'Attached image'}
                className="max-w-[60px] max-h-[60px] xs:max-w-[80px] xs:max-h-[80px] object-contain rounded border border-gray-500/50 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setImagePreviewUrl(att.url)}
                title={`Click to view: ${att.name}`}
              />
            ))}
          </div>
        )}
        {nonImageAttachments.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-gray-600/50 pt-1.5">
            {nonImageAttachments.map((file, idx) => ( // Use file and idx
              <div
                // --- VERIFY: Robust key is used ---
                key={file.id || `file-att-${idx}-${msg.id}`}
                className="bg-gray-800/50 rounded px-1.5 py-0.5 flex items-center text-xs"
              >
                {getFileIcon(file.type, file.name)}
                <span className="text-gray-300 truncate mr-2 flex-1" title={file.name}>{file.name}</span>
                {file.url && (
                  <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-auto text-xs flex-shrink-0">
                    View
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }; // End of renderMessageContent

  // --- Make sure copyToClipboard helper is also defined within ChatWindow or imported ---
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      Logger.log("Code copied!");
      // Optionally show a toast notification here
    }).catch(err => {
      Logger.error("Failed to copy code:", err);
    });
  };


  // Helper function to process inline code within a text segment
  const processInlineCode = (text: string, regex: RegExp): (string | JSX.Element)[] => {
    const inlineParts: (string | JSX.Element)[] = [];
    let lastInlineIndex = 0;
    text.replace(regex, (match, code, offset) => {
      // Add text before inline code
      if (offset > lastInlineIndex) {
        inlineParts.push(text.substring(lastInlineIndex, offset));
      }
      // Add inline code element
      inlineParts.push(
        <code key={`inline-code-${offset}`} className="bg-gray-800/80 text-red-300 px-1.5 py-0.5 rounded text-[0.85em] font-mono">
          {code}
        </code>
      );
      lastInlineIndex = offset + match.length;
      return '';
    });
    // Add remaining text after last inline code
    if (lastInlineIndex < text.length) {
      inlineParts.push(text.substring(lastInlineIndex));
    }
    return inlineParts;
  };

  const handleViewSuggestionClick = (msg: ChatMessage) => {
    // ... (get suggestionData)

    console.log("[View Suggestion Click] Editor View available:", !!editorView); // Check the prop

    // ... (check suggestionData and currentFileContent)

    // Check editorView prop directly
    if (!editorView) { // <--- Check the prop
      console.error("Editor view is not available!");
      alert("Cannot show suggestion: Editor is not ready.");
      return;
    }

    // ... (set activeSuggestion state)
  };


  const getLargeContent = async (contentRef: string): Promise<string | null> => {
    try {
      const contentDoc = await getDoc(doc(db, "largeContent", contentRef));
      if (contentDoc.exists()) {
        return contentDoc.data().content;
      }
      return null;
    } catch (error) {
      console.error("Error retrieving large content:", error);
      return null;
    }
  };



  const getSessionMessages = async (sessionId: string): Promise<Array<{
    sender: string;
    content: any;
    suggestions?: Array<{ text: string; range?: { start: number; end: number }; fileId?: string }>;
  }>> => {
    try {
      const messagesRef = collection(db, 'chatSessions', sessionId, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'asc'));
      const querySnapshot = await getDocs(q);

      const messages: Array<{
        sender: string;
        content: any;
        suggestions?: Array<{ text: string; range?: { start: number; end: number }; fileId?: string }>;
      }> = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();

        // Basic validation for data existence
        if (!data) {
          console.warn(`[ChatService] Message document ${docSnap.id} has no data.`);
          return; // Skip this message
        }

        // Directly use data.content, ensuring it's a string.
        // No JSON parsing needed here for LLM history.
        const messageContent = typeof data.content === 'string' ? data.content : '';

        // Determine role, default to 'assistant' if sender is unexpected
        const role = data.sender === 'You' ? 'user' : 'assistant';

        // Add to history if content is not empty
        if (messageContent.trim() !== '' || (data.attachments && data.attachments.length > 0)) { // Include messages with only attachments too if needed
          messages.push({
            role: role,
            content: messageContent // Use the string content directly
          });
        } else {
          console.warn(`[ChatService] Skipping empty message ${docSnap.id} for LLM history.`);
        }
      });

      return messages;
    } catch (error) {
      console.error('Error fetching chat history:', error);
      return [];
    }
  };



  // When processing AI responses, extract context information
  const extractChangeContext = (responseText: string) => {
    // Look for hints about where to apply changes
    const locationMatch = responseText.match(/(?:add|insert|place|put|modify)(?:[^.]*?)(?:at|after|before|in|to)([^.]*?)(?:\.|\n|$)/i);

    if (locationMatch && locationMatch[1]) {
      return locationMatch[1].trim();
    }

    return null;
  };

  // Add near the top of ChatWindow.tsx, after imports
  const sanitizeForFirestore = (data: any) => {
    // Create a new object to avoid mutating the original
    const sanitized: any = {};

    // Process each field in the data
    Object.entries(data).forEach(([key, value]) => {
      // If the value is undefined, set it to null (Firebase accepts null)
      if (value === undefined) {
        sanitized[key] = null;
      }
      // If it's an object (but not null), recursively sanitize it
      else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = sanitizeForFirestore(value);
      }
      // If it's an array, map through and sanitize each item
      else if (Array.isArray(value)) {
        sanitized[key] = value.map((item: any) =>
          typeof item === 'object' && item !== null ? sanitizeForFirestore(item) : item
        );
      }
      // Otherwise use the value as is
      else {
        sanitized[key] = value;
      }
    });

    return sanitized;
  };

  // Create a new chat session in Firestore
  const createNewChatInFirestore = useCallback(async () => {
    try {
      console.log('[createNewChat] Creating Firestore session...');
      const sessionRef = await addDoc(collection(db, "chatSessions"), {
        userId: userId, projectId: projectId, title: "New Chat",
        createdAt: serverTimestamp(), lastUpdated: serverTimestamp(), modelId: 'gpt-4o'
      });
      const newSession: ChatSession = {
        id: sessionRef.id, title: "New Chat", timestamp: new Date(), messages: [], currentModel: AVAILABLE_MODELS[0]
      };
      console.log(`[createNewChat] Session created: ${sessionRef.id}. Updating context...`);
      chatContext.setActiveSessionId(newSession.id); // Use context setter
      // setChatSessions(prev => [newSession, ...prev]); // Update cache if needed here or rely on listener
      // setActiveSession(newSession); // Let sync effect handle this
      return newSession;
    } catch (error) {
      console.error("[createNewChat] Error:", error);
      chatContext.setActiveSessionId(null); // Set context null on error
      return null;
    }
  }, [userId, projectId, chatContext.setActiveSessionId]); // Dependencies


  // Create a new chat and set it as active
  const createNewChat = async () => {
    try {
      await createNewChatInFirestore();
      setShowChatHistory(false);
    } catch (error) {
      console.error("Error creating new chat:", error);
    }
  };

  // Select a chat session
  const selectChatSession = useCallback(async (sessionId: string) => {
    console.log(`[selectChatSession] Selecting session: ${sessionId}`);
    if (!sessionId || sessionId === chatContext.activeSessionId) {
      console.log(`[selectChatSession] Already active or invalid ID.`);
      setShowChatHistory(false);
      return;
    }
    chatContext.setActiveSessionId(sessionId); // Set context ID FIRST
    setShowChatHistory(false);
    // Local state update (`setActiveSession`) is handled by the sync useEffect
  }, [chatContext.activeSessionId, chatContext.setActiveSessionId]); // Dependencies

  // --- Sync local activeSession with context ID ---
  useEffect(() => {
    const contextSessionId = chatContext.activeSessionId; // Read ID from context object
    console.log(`[ChatWindow Sync Effect] Context ID: ${contextSessionId}, Local Active Session ID: ${activeSession?.id}`);
    const sessionFromCache = chatSessions.find(s => s.id === contextSessionId);
    if (sessionFromCache) {
      if (activeSession?.id !== sessionFromCache.id) {
        setActiveSession(sessionFromCache);
        console.log(`[ChatWindow Sync Effect] Synced local activeSession state to context ID: ${contextSessionId}`);
      }
    } else if (contextSessionId && !loading) {
      if (activeSession !== null) setActiveSession(null);
      console.warn(`[ChatWindow Sync Effect] Context activeSessionId ${contextSessionId} not in cache.`);
    } else if (!contextSessionId) {
      if (activeSession !== null) setActiveSession(null);
      console.log(`[ChatWindow Sync Effect] Cleared local activeSession state as context ID is null.`);
    }
  }, [chatContext.activeSessionId, chatSessions, loading, activeSession]); // Use context object field


  // Read file as data URL
  const readAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          resolve(reader.result as string);
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  // Read file as text
  const readAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          resolve(reader.result as string);
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsText(file);
    });
  };

  // Handle inserting mentions into message text
  const insertMention = (mention: { id: string, name: string, type: string }) => {
    if (mentionStartPos < 0) return;

    const beforeMention = newMessage.substring(0, mentionStartPos);
    const afterMention = newMessage.substring(mentionStartPos);

    // Replace the "@..." part with the selected mention
    const textWithoutMentionChar = afterMention.substring(afterMention.indexOf('@') + 1);
    const remainingText = textWithoutMentionChar.includes(' ')
      ? textWithoutMentionChar.substring(textWithoutMentionChar.indexOf(' '))
      : '';

    // Update the message with the mention syntax
    setNewMessage(`${beforeMention}@[${mention.name}](${mention.id}) ${remainingText}`);

    // Hide the mention list
    setShowMentionList(false);
    setMentionSearch('');

    // Focus back on input
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 0);
  };

  // Render message with mentions highlighted
  const renderMessageWithMentions = (message: string, mentions: { id: string, name: string, type: string }[] = []) => {
    if (!mentions || mentions.length === 0) {
      return message;
    }

    // Create a map of mentions for quick lookup
    const mentionMap = new Map<string, { id: string, name: string, type: string }>();
    mentions.forEach(mention => {
      mentionMap.set(mention.name, mention);
    });

    // Split the message by @ symbol
    const parts = message.split('@');

    if (parts.length === 1) {
      return message; // No @ symbols
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
                  className="inline-flex items-center bg-blue-600/30 px-1.5 rounded-md text-blue-300 cursor-pointer hover:bg-blue-600/40"
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

  // Function to extract suggestions from chat messages
  const extractSuggestions = (content: string): Array<{
    text: string;
    range?: { start: number; end: number };
    fileId?: string;
  }> | null => {
    const suggestions: Array<{
      text: string;
      range?: { start: number; end: number };
      fileId?: string;
    }> = [];

    // Look for line-specific changes
    const lineChangeRegex = /(?:lines?|on line|at line) (\d+)(?:-(\d+))?.*?```(?:latex)?\n([\s\S]*?)\n```/gi;
    let match;
    while ((match = lineChangeRegex.exec(content)) !== null) {
      const startLine = parseInt(match[1]);
      const endLine = match[2] ? parseInt(match[2]) : startLine;
      const code = match[3];

      suggestions.push({
        text: code,
        range: {
          start: startLine - 1, // Convert to 0-indexed
          end: endLine
        }
      });
    }

    // Look for section-specific changes
    const sectionChangeRegex = /(?:in|after|before) (?:the|your) ([a-z]+) section.*?```(?:latex)?\n([\s\S]*?)\n```/gi;
    while ((match = sectionChangeRegex.exec(content)) !== null) {
      const sectionName = match[1];
      const code = match[2];

      suggestions.push({
        text: code,
        sectionHint: sectionName
      });
    }

    // Check for file-specific changes
    const fileChangeRegex = /(?:in|for|update) (?:the|file) ['"]?([^'"]+?)['"]?(?:file)?.*?```(?:latex)?\n([\s\S]*?)\n```/gi;
    while ((match = fileChangeRegex.exec(content)) !== null) {
      const fileName = match[1];
      const code = match[2];

      // Find the file ID by name
      const fileInfo = projectFiles.find(f => f.name === fileName);

      suggestions.push({
        text: code,
        fileId: fileInfo?.id
      });
    }

    // Add a more general regex for ANY code block - this ensures all code blocks are treated as suggestions
    // This is the key addition that will fix your issue
    const codeBlockRegex = /```(?:latex)?\n([\s\S]*?)\n```/g;

    // Reset lastIndex to start from beginning
    codeBlockRegex.lastIndex = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Check if this block was already captured by a more specific pattern above
      const codeText = match[1];
      if (!suggestions.some(s => s.text === codeText)) {
        suggestions.push({
          text: codeText
        });
      }
    }

    return suggestions.length > 0 ? suggestions : null;
  };


  // Send a message to the active chat session
  // In components/ChatWindow.tsx - Update handleSendMessage method
  // In components/ChatWindow.tsx - Update handleSendMessage method
  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[handleSendMessage] === Function Start ===');

    // --- Read the ID from context ---
    const currentContextSessionId = chatContext.activeSessionId; // Use context ID

    // --- Log Initial State ---
    console.log(`[handleSendMessage] Context Check - activeSessionId: ${currentContextSessionId}`);
    console.log(`[handleSendMessage] Prop Check - projectId: ${projectId}`);
    console.log(`[handleSendMessage] Prop Check - userId: ${userId}`);
    console.log(`[handleSendMessage] State Check - loading: ${loading}`);
    console.log(`[handleSendMessage] State Check - newMessage: "${newMessage}"`);
    console.log(`[handleSendMessage] State Check - attachedFiles: ${attachedFiles.length}`);

    // --- Consolidated Guard Clauses ---
    if (loading) {
      console.warn('[handleSendMessage] Aborting: Chat is still loading sessions.');
      alert("Chat is still loading, please wait.");
      return;
    }
    if (!currentContextSessionId) {
      console.error('[handleSendMessage] Aborting: CRITICAL - activeSessionId from context is null/undefined!');
      alert("Error: No active chat session. Please select or create a chat.");
      return;
    }
    if (!newMessage.trim() && attachedFiles.length === 0) {
      console.warn('[handleSendMessage] Aborting: No message content or attachments.');
      return; // Silently abort if nothing to send
    }
    if (!projectId || !userId) {
      console.error('[handleSendMessage] Aborting: CRITICAL - projectId or userId is missing!');
      alert("Error: Missing critical project/user information.");
      return;
    }
    // --- End Guard Clauses ---


    const messageToSend = newMessage;
    const filesToSend = [...attachedFiles]; // Capture state before clearing

    // --- Optimistic UI Update ---
    setNewMessage('');
    setAttachedFiles([]);
    console.log('[handleSendMessage] Input state cleared.');

    const { mentions: parsedMentionsForOptimistic } = parseMentions(messageToSend); // Parse for optimistic display
    const tempUserMessage: ChatMessage = {
      id: `temp-${Date.now()}-${Math.random()}`, // Unique temp ID
      sender: 'You',
      content: messageToSend,
      timestamp: new Date(), // Client time
      attachments: filesToSend.map(f => ({ // Basic info for display
        id: f.id, name: f.name, type: f.type, url: f.url
      })),
      mentions: parsedMentionsForOptimistic,
      isError: false,
    };
    setChatMessages(prevMessages => [...prevMessages, tempUserMessage]); // Add to UI state
    console.log('[handleSendMessage] Optimistically added user message to UI.');
    // --- END OPTIMISTIC UI UPDATE ---

    try {
      console.log('[handleSendMessage] Preparing message data for service...');

      // 1. Parse Mentions (for service)
      // We re-use the function, it's cheap
      const { text: cleanText, mentions } = parseMentions(messageToSend);
      console.log(`[handleSendMessage] Mentions parsed for service. Count: ${mentions.length}`);

      // 2. Prepare Attachment Data (Pass full info needed by service/LLM)
      const attachmentData = filesToSend.map(file => ({
        id: file.id,
        name: file.name,
        type: file.type,
        url: file.url, // <-- Make sure this uses the URL from the attachedFiles state
        size: file.size,
        // content: file.content // Only if needed by LLM explicitly
      }));

      console.log(`[handleSendMessage] Attachment data prepared for service. Count: ${attachmentData.length}`);

      // 3. Prepare Current File Data
      const currentFileData = currentFileId ? {
        id: currentFileId,
        name: currentFileName || 'Unnamed File',
        content: currentFileContent || '' // Ensure it's a string
      } : undefined;
      console.log(`[handleSendMessage] Current file context prepared: ${currentFileData ? currentFileData.name : 'None'}`);

      // 4. Fetch Mentioned Files Content
      let validMentionedFiles: Array<{ id: string; name: string; content: string }> = [];
      if (mentions.length > 0) {
        console.log('[handleSendMessage] Fetching mentioned file content...');
        try {
          const results = await Promise.all(
            mentions.filter(mention => mention.id !== currentFileId) // Avoid re-fetching current file
              .map(async (mention) => {
                const fileContent = await getFileContent(mention.id); // Use the memoized helper
                if (fileContent === null) {
                  console.warn(`[handleSendMessage] Content fetch failed for mentioned file: ${mention.name} (${mention.id})`);
                  return null;
                }
                return { id: mention.id, name: mention.name, content: fileContent };
              })
          );
          validMentionedFiles = results.filter(Boolean) as Array<{ id: string; name: string; content: string }>;
          console.log(`[handleSendMessage] Fetched content for ${validMentionedFiles.length} / ${mentions.length} mentioned files.`);
        } catch (fetchError) {
          console.error("[handleSendMessage] Error fetching mentioned file content:", fetchError);
          alert("Warning: Error fetching content for mentioned files. Sending message without full context.");
          // Continue without full context, or you could return here if context is critical
        }
      }

      // --- Send to Service ---
      const serviceParams: any = { // Use 'any' temporarily if SendMessageParams is strict
        content: cleanText, // The text part of the user message
        projectId,
        sessionId: currentContextSessionId, // Use the validated ID from context
        userId,
        userName: 'You',
        model: activeSession?.currentModel?.id || 'gpt-4o', // Use selected model or default
        currentFile: currentFileData,
        mentionedFiles: validMentionedFiles,
        attachments: attachmentData, // <-- *** ADDED THIS LINE *** Pass the prepared attachment data
      };
      console.log('[handleSendMessage] Calling chatService.sendMessage with sessionId:', serviceParams.sessionId);

      const response = await chatService.sendMessage(serviceParams);
      console.log('[handleSendMessage] chatService response received:', response);

      // --- Handle Service Response ---
      if (response.error) {
        console.error(`[handleSendMessage] Error received from chatService: ${response.error}`);
        alert(`Failed to process message: ${response.error}`);
        // Remove the optimistic message if the backend call failed
        setChatMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id));
      } else {
        console.log('[handleSendMessage] Message processing initiated successfully by service.');
        // The Firestore listener will handle adding the real user message and the assistant response.
      }

    } catch (error) {
      console.error("[handleSendMessage] CRITICAL UNEXPECTED ERROR:", error);
      alert(`An critical error occurred while sending the message: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Remove the optimistic message on critical error
      setChatMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id));
    } finally {
      console.log('[handleSendMessage] === Function End ===');
    }
  }, [
    // Dependencies
    newMessage,
    attachedFiles,
    contextActiveSessionId, // Use context value
    projectId,
    userId,
    loading, // Include loading state
    currentFileId,
    currentFileName,
    currentFileContent,
    projectFiles, // Needed for parsing mentions
    activeSession, // Needed for selected model ID
    setNewMessage,
    setAttachedFiles,
    parseMentions, // Local memoized function
    getFileContent, // Local memoized function
    setChatMessages // Needed for optimistic update and error rollback
  ]);


  // Optimized panel resize handler using requestAnimationFrame
  const handlePanelResize = useCallback((newSize: number) => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    // Use RAF for smooth updates
    rafRef.current = requestAnimationFrame(() => {
      // Check if the change exceeds the threshold to avoid micro jitters
      if (Math.abs(newSize - lastAppliedWidth.current) >= MOVEMENT_THRESHOLD) {
        lastAppliedWidth.current = newSize;
        setWidth(newSize);
      }
      rafRef.current = null;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // If mention list is open, navigate through it
    if (showMentionList) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex(prev =>
          prev < filteredMentions.length - 1 ? prev + 1 : prev
        );
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex(prev => prev > 0 ? prev - 1 : 0);
        return;
      }

      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredMentions.length > 0) {
          insertMention(filteredMentions[selectedMentionIndex]);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionList(false);
        return;
      }
    } else {
      // Normal message sending
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage(e);
      }
    }
  };

  // Update the model selection in Firestore
  const updateSelectedModel = async (model: LLMModel) => {
    if (!activeSessionId) return;

    try {
      const sessionRef = doc(db, "chatSessions", activeSessionId);

      await updateDoc(sessionRef, {
        modelId: model.id,
        lastUpdated: serverTimestamp()
      });

      // Update local state
      setActiveSession(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          currentModel: model
        };
      });

      setChatSessions(prev =>
        prev.map(session =>
          session.id === activeSessionId
            ? { ...session, currentModel: model }
            : session
        )
      );

      setShowModelDropdown(false);
    } catch (error) {
      console.error("Error updating model:", error);
    }
  };

  // Monitor input for @ mentions
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewMessage(value);

    // Get cursor position
    const cursorPos = e.target.selectionStart || 0;
    setMentionStartPos(cursorPos);

    // Check if we're typing a mention (after @ and not in the middle of another word)
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

    if (lastAtSymbol !== -1) {
      // Make sure @ isn't part of another word (has space or is at start)
      const charBeforeAt = lastAtSymbol > 0 ? textBeforeCursor[lastAtSymbol - 1] : ' ';

      if (charBeforeAt === ' ' || lastAtSymbol === 0) {
        // Extract search text after @
        const mentionText = textBeforeCursor.substring(lastAtSymbol + 1);

        // If we're in a valid mention context
        if (!mentionText.includes(' ')) {
          setMentionSearch(mentionText);
          setShowMentionList(true);
          return;
        }
      }
    }

    // If we reach here, we're not in a mention context
    setShowMentionList(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    await uploadFiles(Array.from(files));

    // Reset the input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    await uploadFiles(files);
  };

  const uploadFiles = async (files: File[]) => {
    setIsAttaching(true);
    setUploadError(null);
    const currentProgress = { ...uploadProgress }; // Copy current progress state

    const uploadPromises = files.map(async (file) => {
      const fileName = file.name;
      currentProgress[fileName] = 0; // Initialize progress for this file
      setUploadProgress(prev => ({ ...prev, [fileName]: 0 })); // Update UI immediately

      try {
        // Simulate initial delay/progress
        await new Promise(res => setTimeout(res, 50));
        currentProgress[fileName] = 10;
        setUploadProgress(prev => ({ ...prev, [fileName]: 10 }));

        // --- Call the updated ChatFileUtils method ---
        const result = await ChatFileUtils.uploadChatFile(file, projectId, userId);
        // -------------------------------------------

        // Simulate final processing delay/progress
        await new Promise(res => setTimeout(res, 100));
        currentProgress[fileName] = result.success ? 80 : -1; // Mark error or near complete
        setUploadProgress(prev => ({ ...prev, [fileName]: result.success ? 80 : -1 }));

        if (result.success && result.data) {
          currentProgress[fileName] = 100; // Final success state
          setUploadProgress(prev => ({ ...prev, [fileName]: 100 }));
          Logger.log(`[ChatWindow] Upload success for ${fileName}, URL: ${result.data.url ? result.data.url.substring(0, 50) + '...' : 'N/A'}, Content: ${result.data.content ? 'Yes' : 'No'}`);
          // Return the data structure expected by attachedFiles state
          return result.data as AttachedFile;
        } else {
          throw new Error(result.error || `Failed to upload ${fileName}`);
        }
      } catch (error) {
        Logger.error(`[ChatWindow] Error during upload for ${fileName}:`, error);
        currentProgress[fileName] = -1; // Mark error in progress state
        setUploadProgress(prev => ({ ...prev, [fileName]: -1 }));
        return null; // Indicate failure for this file
      }
    });

    // Wait for all uploads to attempt completion
    const results = await Promise.all(uploadPromises);
    const newAttachments = results.filter(Boolean) as AttachedFile[];

    // Add successfully uploaded files to state
    if (newAttachments.length > 0) {
      setAttachedFiles(prev => [...prev, ...newAttachments]);
    }

    // Clear progress UI after a delay, showing errors if any
    setTimeout(() => {
      // Re-read the final progress state before clearing
      const finalProgress = uploadProgress;
      const failedFiles = Object.entries(finalProgress)
        .filter(([_, progress]) => progress === -1)
        .map(([filename]) => filename);

      if (failedFiles.length > 0) {
        setUploadError(`Upload failed for: ${failedFiles.join(', ')}`);
      } else {
        setUploadError(null); // Clear previous errors if all succeeded this time
      }
      setUploadProgress({}); // Clear all progress indicators
      setIsAttaching(false);
    }, 2500); // Delay before clearing UI
  };


  const removeAttachment = (id: string) => {
    setAttachedFiles(prev => prev.filter(file => file.id !== id));
  };

  // --- FIX: SCROLLING EFFECT ---
  useEffect(() => {
    if (!loading && messagesEndRef.current) { // Check loading state too
      // Use requestAnimationFrame for potentially smoother scroll after render
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    }
  }, [chatMessages, loading]); // <-- DEPEND ON chatMessages and loading

  // Safe file icon getter
  const getFileIcon = (fileType: string) => {
    if (fileType === 'folder') {
      return <Folder className="h-4 w-4 mr-2 text-blue-400" />;
    } else {
      return <File className="h-4 w-4 mr-2 text-gray-400" />;
    }
  };

  if (!isOpen) return null;

  const messages = activeSession?.messages || [];

  return (
    <div className={`h-full flex-shrink-0 shadow-lg flex chat-window-container ${className} ${isResizing ? 'resizing' : ''}`}
      style={{ width: `${width}px` }}
    >
      <ResizablePanel
        direction="horizontal"
        initialSize={width}
        minSize={minWidth}
        maxSize={maxWidth}
        onChange={handlePanelResize}
        onResizeStart={() => setIsResizing(true)}
        onResizeEnd={() => setIsResizing(false)}
        className={`flex flex-col h-full w-full relative bg-[#1e1e1e] will-change-width ${isResizing ? 'resizing' : ''}`}
        resizeFrom="start"
      >
        {/* Header - CHAT title and Actions */}
        <div className="flex items-center justify-between border-b border-gray-800">
          {/* Chat title - just the CHAT heading */}
          <div className="flex text-xs text-white">
            <div className="px-4 py-1.5 uppercase border-b-2 border-white">
              CHAT
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center">
            <button
              className="p-1 text-gray-400 hover:text-gray-300"
              onClick={createNewChat}
              title="New chat"
            >
              <Plus className="h-5 w-5" />
            </button>

            {/* Chat History Button */}
            <div className="relative" ref={historyRef}>
              <button
                className="p-1 text-gray-400 hover:text-gray-300"
                onClick={() => setShowChatHistory(!showChatHistory)}
                title="Chat history"
              >
                <Clock className="h-5 w-5" />
              </button>

              {/* Chat History Dropdown */}
              {showChatHistory && (
                <div className="absolute right-0 top-full mt-1 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-lg z-20 w-64">
                  <div className="py-1 max-h-80 overflow-y-auto">
                    <div className="px-3 py-2 text-xs text-gray-400 uppercase">Recent chats</div>
                    {chatSessions.map(session => (
                      <button
                        key={session.id}
                        onClick={() => selectChatSession(session.id)}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center ${activeSessionId === session.id
                          ? 'bg-[#04395e] text-white'
                          : 'text-gray-300 hover:bg-[#2a2d2e]'
                          }`}
                      >
                        <span className="truncate">{session.title || 'New Chat'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex-1 flex items-center justify-center bg-[#1e1e1e]">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        )}

        {/* Chat Content Area with drop zone */}
        {!loading && (
          <div
            className="flex-1 relative flex flex-col h-0"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Drop indicator overlay */}
            {dragActive && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-900/20 z-10">
                <div className="bg-gray-800 rounded-lg p-4 shadow-lg">
                  <p className="text-center text-white">Drop file to attach to your message</p>
                </div>
              </div>
            )}

            {/* Empty State (when no messages) */}
            {messages.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
                <div className="mb-4 bg-gray-700 rounded-full p-4 opacity-60">
                  <div className="w-16 h-16 flex items-center justify-center">
                    <MessageSquare className="h-10 w-10 text-white opacity-70" />
                  </div>
                </div>
                <h2 className="text-2xl font-light text-gray-300 mb-2">LaTeX Assistant</h2>
                <p className="text-gray-400 text-sm max-w-xs">
                  Ask me anything about LaTeX. I can help format equations, create tables,
                  fix errors, and suggest improvements for your document.
                </p>

                <div className="mt-10 flex flex-col space-y-4 text-sm w-full max-w-xs opacity-80">
                  <div className="flex items-center text-blue-400">
                    <span className="mr-2 font-mono">@</span>
                    <span>Type @ to reference project files</span>
                  </div>
                  <div className="flex items-center text-blue-400">
                    <Paperclip className="h-4 w-4 mr-2 opacity-70" />
                    <span>Attach images or files for help</span>
                  </div>
                  <div className="flex items-center text-blue-400">
                    <span className="mr-2 font-mono">/</span>
                    <span>Type / to use commands</span>
                  </div>
                </div>
              </div>
            )}

            {/* Messages (when there are messages) */}
            {messages.length > 0 && (
              // Make sure this container scrolls, not the whole chat window if possible
              <div className="flex-1 overflow-y-auto p-3 space-y-4 messages-container">
                {chatMessages.map((msg) => {
                  // ***** FIX: DEFINE VARIABLES HERE for each message *****
                  const isAssistant = msg.sender !== 'You' && msg.sender !== 'System';
                  const hasDiffs = isAssistant && msg.diffHunks && msg.diffHunks.length > 0 && !msg.isError;
                  // ***** END FIX *****

                  return (
                    // Use msg.id for the key
                    <div key={msg.id} className={`flex flex-col ${msg.sender === 'You' ? 'items-end' : 'items-start'} message-container`}>
                      {/* Sender Badge */}
                      <div className="text-xs text-gray-400 mb-1 px-1">
                        {msg.sender === 'You' ? 'You' : msg.sender === 'System' ? 'System' : 'LaTeX Assistant'}
                      </div>

                      {/* Message Content Bubble */}
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 ${msg.sender === 'You' ? 'bg-blue-600/70 text-white' :
                          msg.isError ? 'bg-red-800/50 border border-red-700/60 text-red-300' :
                            'bg-gray-700/60 text-gray-200' // Consistent background for assistant/system non-errors
                          }`}
                      >
                        {/* Render main message content (explanation or user text) */}
                        {renderMessageContent(msg)}

                        {/* Attachments */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="mt-2 space-y-1 border-t border-gray-600/50 pt-1.5">
                            {msg.attachments.map(file => (
                              <div key={file.id} className="bg-gray-800/50 rounded px-1.5 py-0.5 flex items-center text-xs">
                                {getFileIcon(file.type, file.name)}
                                <span className="text-gray-300 truncate mr-2 flex-1" title={file.name}>{file.name}</span>
                                <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-auto">View</a>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Suggestion Button - Rendered below the message bubble */}
                      {/* Use the defined variables 'hasSuggestions' and 'suggestionData' */}
                      {hasDiffs && (
                        <div className="mt-1.5">
                          <button
                            onClick={() => { // Directly call onShowSuggestion here
                              console.log("[View Suggestion Click] Button clicked for message:", msg.id);
                              // Ensure original content is available
                              if (typeof currentFileContent !== 'string') {
                                console.error("Original content missing!");
                                alert("Cannot show suggestion: Original file content is missing.");
                                return;
                              }
                              // Call the callback passed from LatexEditor
                              if (onShowSuggestion && msg.diffHunks) {
                                onShowSuggestion(
                                  msg.diffHunks,        // Pass the array of diff strings
                                  msg.content,          // Pass the explanation
                                  currentFileContent    // Pass original editor content for overlay display base
                                );
                              } else {
                                console.error("onShowSuggestion callback or msg.diffHunks is missing!");

                              }
                            }}
                            className="bg-blue-600/80 text-white text-xs py-1 px-2 rounded hover:bg-blue-700 flex items-center shadow"
                            title="View AI Suggestion"
                          >
                            <Edit className="h-3 w-3 mr-1" /> View Suggestion
                          </button>
                        </div>
                      )}

                      {/* Timestamp */}
                      <div className="text-[10px] text-gray-500 mt-1 px-1">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>

                      {/* REMOVED the old conflicting Apply/Ignore buttons that called /api/latex-content */}

                    </div> // End message container div
                  );
                })}
                <div ref={messagesEndRef} className="h-0" /> {/* Scroll anchor */}
              </div> // End messages container div
            )}
          </div> // End Chat Content Area Div
        )}

        {/* Input Area */}
        {!loading && (
          <div className="p-4 mt-auto">
            {/* Current file badge */}
            {currentFileName && (
              <div className="flex mb-2">
                <div
                  className="inline-flex items-center bg-[#252526] text-gray-300 text-xs rounded px-2 py-1 cursor-pointer hover:bg-[#303031]"
                  onClick={() => onFileSelect && currentFileId && onFileSelect(currentFileId)}
                >
                  <File className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
                  <span className="mr-1">{currentFileName}</span>
                  <span className="text-gray-500">Current file</span>
                </div>
              </div>
            )}

            {/* Upload progress and errors */}
            {Object.keys(uploadProgress).length > 0 && (
              <div className="mb-2 bg-[#252526] rounded p-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Uploading files...</span>
                  <span>
                    {Object.values(uploadProgress).filter(p => p === 100).length} / {Object.keys(uploadProgress).length}
                  </span>
                </div>
                {Object.entries(uploadProgress).map(([fileName, progress]) => (
                  <div key={fileName} className="mb-1">
                    <div className="flex items-center text-xs mb-0.5">
                      <span className="truncate flex-1 text-gray-400">{fileName}</span>
                      <span className="text-gray-500 ml-2">
                        {progress < 0 ? 'Error' : progress === 100 ? 'Complete' : `${progress}%`}
                      </span>
                    </div>
                    <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${progress < 0 ? 'bg-red-500' :
                          progress === 100 ? 'bg-green-500' : 'bg-blue-500'
                          }`}
                        style={{ width: `${progress < 0 ? 100 : progress}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upload error message */}
            {uploadError && (
              <div className="mb-2 bg-red-900/20 border border-red-800/50 rounded px-3 py-2 text-xs text-red-400">
                {uploadError}
              </div>
            )}

            {/* Attachments preview */}
            {attachedFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachedFiles.map(file => (
                  <div key={file.id} className="bg-[#252526] rounded flex items-center pl-2 pr-1 py-1">
                    <File className="h-3 w-3 mr-1 text-blue-400" />
                    <span className="text-xs text-gray-300 mr-1 max-w-[150px] truncate">{file.name}</span>
                    <button
                      onClick={() => removeAttachment(file.id)}
                      className="text-gray-500 hover:text-gray-300"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input box */}
            <div className="bg-[#252526] rounded-md border border-[#3c3c3c] relative">
              <form onSubmit={handleSendMessage} className="flex flex-col">
                <input
                  ref={inputRef}
                  type="text"
                  value={newMessage}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about LaTeX... (Type @ to mention files)"
                  className="w-full bg-transparent text-gray-200 py-2 px-3 text-sm focus:outline-none"
                />

                {/* File mention dropdown */}
                {showMentionList && filteredMentions.length > 0 && (
                  <div
                    ref={mentionListRef}
                    className="absolute bottom-full left-0 mb-1 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-lg max-h-60 overflow-y-auto w-64 z-10"
                  >
                    <div className="py-1">
                      {filteredMentions.map((file, index) => (
                        <div
                          key={file.id}
                          onClick={() => insertMention(file)}
                          className={`px-3 py-2 text-sm flex items-center cursor-pointer ${index === selectedMentionIndex ? 'bg-[#04395e] text-white' : 'text-gray-300 hover:bg-[#2a2d2e]'}`}
                        >
                          {file.type === 'folder' ? (
                            <Folder className="h-4 w-4 mr-2 text-blue-400" />
                          ) : (
                            <File className="h-4 w-4 mr-2 text-gray-400" />
                          )}
                          <span className="truncate">{file.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Button bar - simplified with just paperclip */}
                <div className="flex justify-between items-center px-2 py-1.5 border-t border-[#3c3c3c]">
                  <div>
                    <button
                      type="button"
                      className="p-1 text-gray-500 hover:text-gray-300 rounded"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="h-4 w-4" />
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        className="hidden"
                        multiple
                      />
                    </button>
                  </div>

                  <div className="flex items-center">
                    {/* Model selection dropdown - improved design */}
                    <div className="relative" ref={dropdownRef}>
                      <button
                        type="button"
                        onClick={() => setShowModelDropdown(!showModelDropdown)}
                        className="mr-2 flex items-center text-xs bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 hover:bg-[#2d2d2d]"
                      >
                        <span>{activeSession?.currentModel.name || AVAILABLE_MODELS[0].name}</span>
                        <ChevronDown className="h-3 w-3 ml-1.5" />
                      </button>

                      {/* Improved Dropdown Menu */}
                      {showModelDropdown && (
                        <div className="absolute bottom-full right-0 mb-1 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-lg z-10 min-w-[180px]">
                          <div className="py-1">
                            {AVAILABLE_MODELS.map(model => (
                              <button
                                key={model.id}
                                type="button"
                                onClick={() => updateSelectedModel(model)}
                                className={`w-full text-left px-3 py-2 text-xs flex justify-between items-center ${(activeSession?.currentModel.id || AVAILABLE_MODELS[0].id) === model.id
                                  ? 'bg-[#04395e] text-white'
                                  : 'text-gray-300 hover:bg-[#2a2d2e]'
                                  }`}
                              >
                                <span>{model.name}</span>
                                <span className="text-xs text-gray-500">{model.providerName}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      // Use context activeSessionId for disabled check
                      disabled={(!newMessage.trim() && attachedFiles.length === 0) || !chatContext.activeSessionId}
                      className={`p-1 ${(!newMessage.trim() && attachedFiles.length === 0) || !chatContext.activeSessionId
                        ? 'text-gray-500 cursor-not-allowed'
                        : 'text-gray-300 hover:text-white'
                        }`}
                    >
                      <Send className="h-5 w-5" />
                    </button>
                    {/* ... */}
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </ResizablePanel>
    </div>
  );
};
export default ChatWindow;