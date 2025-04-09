// components/ChatWindow.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import chatService from '@/services/chatService';

import {
  X, Code, Send, Plus, Clock, ChevronDown, Paperclip, File, MessageSquare,
  Folder, Download, Check, Loader, Edit, Image as ImageIcon, Brain
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

// Helper: Determine if a file is an image based on its extension.
const isImageFile = (filename: string): boolean => {
  const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.bmp', '.webp'];
  return extensions.some(ext => filename.toLowerCase().endsWith(ext));
};

// At the top of ChatWindow.tsx, add this helper:
const compressDataUrl = (
  dataUrl: string,
  quality: number = 0.7,
  maxWidth: number = 800
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // create an offscreen canvas
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      // scale down if too wide
      if (width > maxWidth) {
        height = Math.round((maxWidth / width) * height);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Cannot get canvas context'));
      ctx.drawImage(img, 0, 0, width, height);
      // re-encode to JPEG (or PNG if you prefer) at given quality
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = err => reject(err);
    img.src = dataUrl;
  });
};


// Helper function to format time
const formatTime = (date: Date) => {
  if (!date) return 'Just now';

  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;

  if (diff < 604800) { // Less than a week
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
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

  const [sessionTitle, setSessionTitle] = useState<string>(activeSession?.title || '');
  const [editingTitle, setEditingTitle] = useState<boolean>(false);


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
  const [isThinking, setIsThinking] = useState(false);

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



// inside ChatWindow, alongside your other helpers:

async function autoGenerateTitle(sessionId: string, firstMessage: string) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a title generator. Create a very short (3–5 word) title summarizing this user message.' },
        { role: 'user', content: firstMessage }
      ],
      max_tokens: 8
    });
    const generated = completion.choices[0].message.content.trim();
    const title = generated || 'Untitled Chat';

    // update Firestore
    const sessionRef = doc(db, 'chatSessions', sessionId);
    await updateDoc(sessionRef, {
      title,
      lastUpdated: serverTimestamp()
    });

    // update local UI state
    setSessionTitle(title);
  } catch (err) {
    console.error('Failed to auto‑generate title:', err);
  }
}

  console.log('[ChatWindow Render] Editor Ref View available:', !!editorRef?.current?.view);

  const ThinkingIndicator = () => (
    <div className="flex flex-col items-start message-container">
      <div className="text-xs text-gray-400 mb-1 px-1">
        LaTeX Assistant
      </div>
      <div className="max-w-[85%] rounded-lg px-3 py-2 bg-gray-700/60 text-gray-200">
        <div className="flex items-center">
          <Brain className="h-5 w-5 mr-2 text-blue-400 animate-pulse" />
          <div className="flex items-center">
            <span className="text-sm">Thinking</span>
            <span className="flex ml-2">
              <span className="h-1.5 w-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
              <span className="h-1.5 w-1.5 bg-blue-400 rounded-full mx-1 animate-bounce [animation-delay:-0.15s]"></span>
              <span className="h-1.5 w-1.5 bg-blue-400 rounded-full animate-bounce"></span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );




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



  // Create a new chat session in Firestore
  const createNewChatInFirestore = useCallback(async () => {
    try {
      console.log('[createNewChat] Creating Firestore session...');
      const sessionRef = await addDoc(collection(db, "chatSessions"), {
        userId: userId,
        projectId: projectId,
        title: "New Chat", // Start with default title, will update later
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        modelId: 'gpt-4o'
      });
      const newSession: ChatSession = {
        id: sessionRef.id,
        title: "New Chat",
        timestamp: new Date(),
        messages: [],
        currentModel: AVAILABLE_MODELS[0]
      };
      console.log(`[createNewChat] Session created: ${sessionRef.id}. Updating context...`);
      chatContext.setActiveSessionId(newSession.id);
      return newSession;
    } catch (error) {
      console.error("[createNewChat] Error:", error);
      chatContext.setActiveSessionId(null);
      return null;
    }
  }, [userId, projectId, chatContext.setActiveSessionId]);

  // Add this to your session loading effect to properly set loading to false
  useEffect(() => {
    if (!projectId || !userId) {
      setLoading(false); // End loading if we don't have project/user ID
      return;
    }

    console.log('[ChatWindow] Setting up sessions listener for project:', projectId);

    // Set loading true initially
    setLoading(true);

    const chatSessionsRef = collection(db, "chatSessions");
    const q = query(
      chatSessionsRef,
      where("projectId", "==", projectId),
      where("userId", "==", userId),
      orderBy("lastUpdated", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const updatedSessions: ChatSession[] = [];

      snapshot.forEach(doc => {
        const data = doc.data();

        // Find the model or use default
        const modelId = data.modelId || 'gpt-4o';
        const model = AVAILABLE_MODELS.find(m => m.id === modelId) || AVAILABLE_MODELS[0];

        updatedSessions.push({
          id: doc.id,
          title: data.title || 'Untitled Chat',
          timestamp: data.lastUpdated instanceof Timestamp
            ? data.lastUpdated.toDate()
            : data.lastUpdated instanceof Date
              ? data.lastUpdated
              : new Date(),
          messages: [], // We'll load messages separately when needed
          currentModel: model
        });
      });

      console.log(`[ChatWindow] Session listener update: ${updatedSessions.length} sessions`);
      setChatSessions(updatedSessions);

      // CRITICAL: Set loading to false here
      setLoading(false);

      // If no active session and we have sessions, set the first one active
      if (!chatContext.activeSessionId && updatedSessions.length > 0) {
        chatContext.setActiveSessionId(updatedSessions[0].id);
      } else if (updatedSessions.length === 0) {
        // If no sessions at all, create a new one automatically
        console.log('[ChatWindow] No sessions found, creating new one...');
        createNewChatInFirestore().then(newSession => {
          if (newSession) {
            console.log(`[ChatWindow] New session created with ID: ${newSession.id}`);
          }
        });
      }
    }, (error) => {
      console.error('[ChatWindow] Error in sessions listener:', error);
      setLoading(false); // CRITICAL: Make sure to set loading to false on error
    });

    // Clean up listener on unmount
    return () => {
      console.log('[ChatWindow] Cleaning up sessions listener');
      unsubscribe();
    };
  }, [projectId, userId, chatContext.activeSessionId, chatContext.setActiveSessionId, createNewChatInFirestore]);

  // Subscribe to updates for the active session
  // Subscribe to updates for the active session
  // Inside the useEffect hook depending on [contextActiveSessionId]
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    const currentSessionId = contextActiveSessionId; // Capture context ID

    const subscribeToMessages = async () => {
      // Clear any previous subscription
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }

      // If no active session, clear messages and exit
      if (!currentSessionId) {
        Logger.log("[ChatWindow Listener] No active session ID, clearing messages.");
        setChatMessages([]);
        return;
      }

      try {
        // First, load the current messages to ensure we have the latest data
        Logger.log(`[ChatWindow Listener] Loading initial messages for session: ${currentSessionId}`);

        const messagesRef = collection(db, "chatSessions", currentSessionId, "messages");
        const messagesQuery = query(messagesRef, orderBy("timestamp", "asc"));

        // Load initial messages
        const initialSnapshot = await getDocs(messagesQuery);
        const initialMessages: ChatMessage[] = initialSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            sender: data.sender || 'Unknown',
            content: data.content || '',
            timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(),
            attachments: data.attachments || [],
            mentions: data.mentions || [],
            diffHunks: data.diffHunks || [],
            isError: data.isError || false,
          };
        });

        // Set initial messages
        setChatMessages(initialMessages);
        Logger.log(`[ChatWindow Listener] Loaded ${initialMessages.length} initial messages for session: ${currentSessionId}`);

        // Then subscribe to real-time updates
        Logger.log(`[ChatWindow Listener] Starting real-time subscription for session: ${currentSessionId}`);

        unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
          Logger.log(`[ChatWindow Listener] Firestore snapshot for ${currentSessionId}. Docs: ${snapshot.docs.length}, PendingWrites: ${snapshot.metadata.hasPendingWrites}`);

          const updatedMessages: ChatMessage[] = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              sender: data.sender || 'Unknown',
              content: data.content || '',
              timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(),
              attachments: data.attachments || [],
              mentions: data.mentions || [],
              diffHunks: data.diffHunks || [],
              isError: data.isError || false,
            };
          });

          // Only update if there's a difference to avoid unnecessary renders
          if (JSON.stringify(updatedMessages.map(m => m.id)) !== JSON.stringify(chatMessages.map(m => m.id)) ||
            updatedMessages.length !== chatMessages.length) {
            setChatMessages(updatedMessages);
            Logger.log(`[ChatWindow Listener] Updated chatMessages state with ${updatedMessages.length} messages.`);
          }
        }, (error) => {
          Logger.error(`[ChatWindow Listener] Error subscribing to session ${currentSessionId}:`, error);
          setChatMessages([]); // Clear messages on error
        });

      } catch (error) {
        Logger.error(`[ChatWindow Listener] Error setting up messages for session ${currentSessionId}:`, error);
        setChatMessages([]); // Clear messages on error
      }
    };

    // Start the subscription process
    subscribeToMessages();

    // Cleanup function
    return () => {
      if (unsubscribe) {
        Logger.log(`[ChatWindow Listener] Unsubscribing from session: ${currentSessionId}`);
        unsubscribe();
      }
    };
  }, [contextActiveSessionId, chatMessages.length]);

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

  useEffect(() => {
    if (activeSession) {
      setSessionTitle(activeSession.title);
    }
  }, [activeSession]);

  const saveSessionTitle = async () => {
    if (!chatContext.activeSessionId) return;
    try {
      const sessionRef = doc(db, 'chatSessions', chatContext.activeSessionId);
      await updateDoc(sessionRef, {
        title: sessionTitle || 'Untitled Chat',
        lastUpdated: serverTimestamp()
      });
      setEditingTitle(false);
    } catch (error) {
      console.error('Error updating session title:', error);
    }
  };



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

      // Add the formatted code block element with fixed copy button
      const language = lang || 'latex'; // Default language
      parts.push(
        <div key={`code-block-${offset}-${msg.id}`} className="my-2 relative text-left">
          {/* Outer container for the code block */}
          <div className="relative rounded-md overflow-hidden">
            {/* The syntax highlighter */}
            <SyntaxHighlighter
              language={language}
              style={vscDarkPlus}
              customStyle={{
                margin: 0,
                padding: '0.75rem',
                paddingRight: '2.5rem', // Extra padding on right for button
                borderRadius: '0.25rem',
                fontSize: '0.8rem',
                backgroundColor: '#161616',
              }}
              wrapLongLines={true}
              PreTag="div"
            >
              {code.trim()}
            </SyntaxHighlighter>

            {/* Absolutely positioned copy button with higher z-index */}
            <button
              onClick={() => copyToClipboard(code.trim())}
              className="absolute top-2 right-2 p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded shadow-sm z-10"
              title="Copy code"
              aria-label="Copy code to clipboard"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
      );

      lastIndex = offset + match.length;
      return ''; // Necessary for replace behavior
    });

    // Helper function to show copy feedback
    const copyToClipboard = (text: string) => {
      navigator.clipboard.writeText(text)
        .then(() => {
          // Show a success message (you could implement a toast notification here)
          console.log("Code copied to clipboard!");

          // Optional: You could add a visual feedback element here
          // For example, briefly show a "Copied!" message near the button
        })
        .catch(err => {
          console.error("Failed to copy code:", err);
        });
    };


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

  const createNewChat = async () => {
    try {
      // Clear any previous chat state first
      setNewMessage('');
      setAttachedFiles([]);
      setChatMessages([]);

      // Create a new chat session in Firestore
      const newSession = await createNewChatInFirestore();

      if (newSession) {
        // Set the new session as active
        chatContext.setActiveSessionId(newSession.id);

        // Close the history dropdown
        setShowChatHistory(false);

        // Focus the input field
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);

        Logger.log(`[ChatWindow] Created new chat with ID: ${newSession.id}`);
      } else {
        Logger.error("[ChatWindow] Failed to create new chat session");
      }
    } catch (error) {
      Logger.error("[ChatWindow] Error creating new chat:", error);
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
  // Replace your current sync effect with this improved version
  useEffect(() => {
    const contextSessionId = chatContext.activeSessionId;
    console.log(`[ChatWindow Sync Effect] Context ID: ${contextSessionId}, Cached Sessions: ${chatSessions.length}`);

    // If we have a session ID but no sessions yet (still loading), we'll wait
    if (contextSessionId && chatSessions.length === 0 && loading) {
      console.log('[ChatWindow Sync Effect] Sessions still loading, will sync later');
      return;
    }

    if (contextSessionId) {
      const sessionFromCache = chatSessions.find(s => s.id === contextSessionId);
      if (sessionFromCache) {
        console.log(`[ChatWindow Sync Effect] Found session in cache: ${sessionFromCache.title}`);
        setActiveSession(sessionFromCache);
      } else {
        console.warn(`[ChatWindow Sync Effect] Session ID ${contextSessionId} not found in cache.`);
        // If not in cache, but loading is done, create new or select first
        if (!loading && chatSessions.length > 0) {
          console.log('[ChatWindow Sync Effect] Setting first available session as active');
          chatContext.setActiveSessionId(chatSessions[0].id);
        }
      }
    } else {
      // No active session
      setActiveSession(null);

      // If no active session, loading is done, and we have sessions, set first one
      if (!loading && chatSessions.length > 0) {
        console.log('[ChatWindow Sync Effect] No active session, setting first available');
        chatContext.setActiveSessionId(chatSessions[0].id);
      }
    }
  }, [chatContext.activeSessionId, chatSessions, loading]);


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
    const afterMention = newMessage.substring(mentionStartPos + 1);

    // Replace the "@..." part with the selected mention
    const textWithoutMentionChar = afterMention.substring(afterMention.indexOf('@') + 1);
    const remainingText = textWithoutMentionChar.includes(' ')
      ? textWithoutMentionChar.substring(textWithoutMentionChar.indexOf(' '))
      : '';

    // Update the message with the mention syntax
    setNewMessage(`${beforeMention}@[${mention.name}](${mention.id})${remainingText}`);

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
    setIsThinking(true); // START THINKING INDICATOR
    console.log('[handleSendMessage] Input state cleared. Thinking indicator started.');

    const { mentions: parsedMentionsForOptimistic } = parseMentions(messageToSend); // Parse for optimistic display
    const tempUserMessage: ChatMessage = {
      id: `temp-${Date.now()}-${Math.random()}`, // Unique temp ID
      sender: 'You',
      content: messageToSend,
      timestamp: new Date(), // Client time
      attachments: filesToSend.map(f => ({
        id: f.id, name: f.name, type: f.type, url: f.url
      })),
      mentions: parsedMentionsForOptimistic,
      isError: false,
    };

    // Add user message to state immediately
    setChatMessages(prevMessages => [...prevMessages, tempUserMessage]);

    // Scroll to bottom to show the new message
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);

    console.log('[handleSendMessage] Optimistically added user message to UI.');
    // --- END OPTIMISTIC UI UPDATE ---

    try {
      console.log('[handleSendMessage] Preparing message data for service...');

      // 1. Parse Mentions (for service)
      const { text: cleanText, mentions } = parseMentions(messageToSend);
      console.log(`[handleSendMessage] Mentions parsed for service. Count: ${mentions.length}`);

      // 2. Prepare Attachment Data (Pass full info needed by service/LLM)
      const attachmentData = filesToSend.map(file => ({
        id: file.id,
        name: file.name,
        type: file.type,
        url: file.url, // Ensure this uses the URL from the attachedFiles state
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
                const fileContent = await getFileContent(mention.id); // Using the memoized helper
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
          // Continue without full context, or return if context is critical
        }
      }
      // threshold in bytes (here 500 KB)
      const MAX_IMAGE_BYTES = 500 * 1024;
      for (const file of validMentionedFiles) {
        if (/\.(jpe?g|png|gif|bmp|webp)$/i.test(file.name) && file.content.startsWith('data:image')) {
          let imageUrl = file.content;
          try {
            // estimate raw bytes of the base64 payload
            const base64 = imageUrl.split(',')[1] || '';
            const byteLength = Math.floor(base64.length * 3 / 4);
            if (byteLength > MAX_IMAGE_BYTES) {
              console.log(`[handleSendMessage] Compressing large image '${file.name}' (${Math.round(byteLength / 1024)} KB)`);
              // compressDataUrl defaults: quality 0.7, maxWidth 800
              imageUrl = await compressDataUrl(imageUrl);
              console.log(`[handleSendMessage] Compressed image '${file.name}', new size approx. ${Math.round((imageUrl.split(',')[1].length * 3 / 4) / 1024)} KB`);
            }
          } catch (err) {
            console.error(`[handleSendMessage] Image compression failed for ${file.name}:`, err);
            // fallback to original data URL
          }

          attachmentData.push({
            id: file.id,
            name: file.name,
            type: `image/${file.name.split('.').pop()}`,
            url: imageUrl
          });
          console.log(`[handleSendMessage] Added mentioned image '${file.name}' as attachment.`);
        }
      }


      // 5. Determine if any mentioned file is an image or a .tex file
      // Use validMentionedFiles to decide which model to use.
      let hasImageMention = false;
      let hasTexMention = false;
      validMentionedFiles.forEach(file => {
        const lowerName = file.name.toLowerCase();
        if (lowerName.endsWith('.tex')) {
          hasTexMention = true;
        } else if (lowerName.match(/\.(jpeg|jpg|png|gif|bmp|webp)$/)) {
          hasImageMention = true;
        }
      });

      // 6. Decide on the model override based on mentioned file types.
      // Start with the model from activeSession or default to 'gpt-4o'.
      let modelToUse = activeSession?.currentModel?.id || 'gpt-4o';
      if (hasImageMention) {
        modelToUse = 'gpt-4o'; // Vision-capable model.
        console.log(`[handleSendMessage] Overriding model to vision model due to image mention.`);
      } else if (hasTexMention) {
        modelToUse = 'gpt-4-turbo'; // Text-focused model using detailed .tex context.
        console.log(`[handleSendMessage] Overriding model to text model due to .tex file mention.`);
      }

      // --- Send to Service ---
      const serviceParams: any = {
        content: cleanText,
        projectId,
        sessionId: currentContextSessionId,
        userId,
        userName: 'You',
        model: modelToUse,
        currentFile: currentFileData,
        mentionedFiles: validMentionedFiles,
        attachments: attachmentData,
        projectFiles: projectFiles // Pass the complete project file tree
      };

      console.log('[handleSendMessage] Calling chatService.sendMessage with sessionId:', serviceParams.sessionId);

      const response = await chatService.sendMessage(serviceParams);
      console.log('[handleSendMessage] chatService response received:', response);
      setIsThinking(false); // STOP THINKING INDICATOR AFTER RESPONSE

      if ((sessionTitle === 'New Chat' || sessionTitle === 'Untitled Chat') && messageToSend) {
        try {
          const resp = await fetch('/api/generateTitle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: messageToSend })
          });
          const { title } = await resp.json();
          // write back to Firestore
          const sessionRef = doc(db, 'chatSessions', currentContextSessionId!);
          await updateDoc(sessionRef, { title, lastUpdated: serverTimestamp() });
          setSessionTitle(title);
        } catch (err) {
          console.error('Could not auto‑generate title:', err);
        }
      }

      if (!response.error) {
        // only run once, if this session is brand‑new
        if (sessionTitle === 'New Chat' || sessionTitle === 'Untitled Chat') {
          autoGenerateTitle(currentContextSessionId!, messageToSend);
        }
      }
      

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
      alert(`A critical error occurred while sending the message: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Remove the optimistic message on critical error
      setChatMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id));
      setIsThinking(false); // STOP THINKING INDICATOR ON ERROR
    } finally {
      console.log('[handleSendMessage] === Function End ===');
    }
  }, [
    // Dependencies
    newMessage,
    attachedFiles,
    chatContext.activeSessionId,
    projectId,
    userId,
    loading,
    currentFileId,
    currentFileName,
    currentFileContent,
    projectFiles,
    activeSession,
    setNewMessage,
    setAttachedFiles,
    parseMentions,
    getFileContent,
    setChatMessages,
    setIsThinking
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
    if (!loading && messagesEndRef.current) {
      // Use requestAnimationFrame for smoother scroll after render
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({
          behavior: chatMessages.length <= 1 ? "auto" : "smooth",
          block: "end"
        });
      });
    }
  }, [chatMessages, loading, isThinking]); // Depend on messages, loading, and thinking state

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
          <div className="flex items-center">
            {editingTitle ? (
              <input
                type="text"
                value={sessionTitle}
                onChange={e => setSessionTitle(e.target.value)}
                onBlur={saveSessionTitle}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveSessionTitle();
                  if (e.key === 'Escape') {
                    setSessionTitle(activeSession?.title || '');
                    setEditingTitle(false);
                  }
                }}
                autoFocus
                className="bg-transparent border-b border-blue-400 text-white px-2 py-1 text-sm focus:outline-none"
              />
            ) : (
              <h2
                className="text-white text-sm font-medium cursor-pointer px-2 py-1"
                onClick={() => setEditingTitle(true)}
                title="Click to rename chat"
              >
                {sessionTitle || 'Untitled Chat'}
              </h2>
            )}
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
                <div className="absolute right-0 top-full mt-1 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-lg z-20 w-72">
                  <div className="py-1.5 px-3 border-b border-gray-700/50 flex items-center justify-between">
                    <span className="text-xs text-gray-400 uppercase font-medium">Recent Chats</span>
                    <button
                      onClick={createNewChat}
                      className="text-blue-400 hover:text-blue-300 text-xs flex items-center"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      New Chat
                    </button>
                  </div>

                  <div className="max-h-80 overflow-y-auto py-1">
                    {chatSessions.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-gray-400 text-center">
                        No chat sessions yet. Start a new chat!
                      </div>
                    ) : (
                      chatSessions.map(session => (
                        <button
                          key={session.id}
                          onClick={() => selectChatSession(session.id)}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center ${chatContext.activeSessionId === session.id
                            ? 'bg-[#04395e] text-white'
                            : 'text-gray-300 hover:bg-[#2a2d2e]'
                            }`}
                        >
                          <MessageSquare className={`h-4 w-4 flex-shrink-0 mr-2 ${chatContext.activeSessionId === session.id ? 'text-white' : 'text-gray-500'
                            }`} />
                          <div className="flex-1 flex justify-between items-center min-w-0 space-x-2">
                            <span className="truncate font-medium">
                              {session.title && session.title !== "New Chat"
                                ? session.title
                                : "Untitled Chat"}
                            </span>
                            {session.timestamp && (
                              <span className={`text-xs whitespace-nowrap ${chatContext.activeSessionId === session.id ? 'text-blue-200' : 'text-gray-500'
                                }`}>
                                {formatTime(session.timestamp)}
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                    )}
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

            {/* Messages (when there are messages) */}
            {!loading && chatMessages.length > 0 && (
              // Make sure this container scrolls, not the whole chat window if possible
              <div className="flex-1 overflow-y-auto p-3 space-y-4 messages-container">
                {chatMessages.map((msg) => {
                  // Define variables for each message
                  const isAssistant = msg.sender !== 'You' && msg.sender !== 'System';
                  const hasDiffs = isAssistant && msg.diffHunks && msg.diffHunks.length > 0 && !msg.isError;

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
                      {hasDiffs && (
                        <div className="mt-1.5">
                          <button
                            onClick={() => {
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
                    </div> // End message container div
                  );
                })}
                {isThinking && <ThinkingIndicator />}
                <div ref={messagesEndRef} className="h-0" />
              </div> // End messages container div
            )}
            {/* Empty State (when no messages) */}
            {!loading && chatMessages.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
                <div className="mb-4 bg-gray-700 rounded-full p-4 opacity-60">
                  <div className="w-16 h-16 flex items-center justify-center">
                    <MessageSquare className="h-10 w-10 text-white opacity-70" />
                  </div>
                </div>
                <h2 className="text-2xl font-light text-gray-300 mb-2">LaTeX Assistant</h2>
                <p className="text-gray-400 text-sm max-w-xs mb-6">
                  Ask me anything about LaTeX. I can help format equations, create tables,
                  fix errors, and suggest improvements for your document.
                </p>

                <div className="bg-gray-800/40 rounded-lg p-5 max-w-xs w-full">
                  <h3 className="text-sm font-medium text-gray-300 mb-3">Example questions to ask:</h3>
                  <ul className="space-y-2 text-sm text-left text-gray-400">
                    <li className="cursor-pointer hover:text-blue-400 transition-colors"
                      onClick={() => setNewMessage("How do I create a matrix equation in LaTeX?")}>
                      • How do I create a matrix equation?
                    </li>
                    <li className="cursor-pointer hover:text-blue-400 transition-colors"
                      onClick={() => setNewMessage("What's the syntax for adding citations and references?")}>
                      • How do I add citations and references?
                    </li>
                    <li className="cursor-pointer hover:text-blue-400 transition-colors"
                      onClick={() => setNewMessage("Can you help me debug this error: Undefined control sequence")}>
                      • Help me debug a LaTeX error
                    </li>
                  </ul>
                </div>

                <div className="mt-8 flex flex-col space-y-3 text-sm w-full max-w-xs opacity-80">
                  <div className="flex items-center text-blue-400">
                    <span className="mr-2 font-mono">@</span>
                    <span>Type @ to reference project files</span>
                  </div>
                  <div className="flex items-center text-blue-400">
                    <Paperclip className="h-4 w-4 mr-2 opacity-70" />
                    <span>Attach images or files for help</span>
                  </div>
                </div>
              </div>
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