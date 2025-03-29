// File: services/chatService.ts
import OpenAIService, { OpenAIRequestParams, OpenAIResponse } from './openai';
import {
  collection, addDoc, serverTimestamp, doc, updateDoc, query,
  orderBy, getDocs, runTransaction, Timestamp, limit // Ensure Timestamp and limit are imported
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DocumentContextManager } from '../utils/DocumentContextManager';
// Removed Logger import

// Interfaces (assuming SendMessageParams, MessageResponse are defined above)
type MessageContent = string | any;

interface SendMessageParams {
  content: MessageContent;
  projectId: string;
  sessionId: string;
  userId: string;
  userName: string;
  model: string;
  currentFile?: { id: string; name: string; content: string };
  mentionedFiles?: Array<{ id: string; name: string; content: string }>;
  // attachments?: any[]; // Add if sending attachment info to LLM
}

interface MessageResponse {
  userMessageId: string;
  assistantMessageId?: string;
  assistantContent?: string; // The explanation part
  error?: string;
}


class ChatService {
  private documentContextManager: DocumentContextManager | null = null;
  private openaiService: OpenAIService;

  constructor() {
    this.openaiService = OpenAIService.getInstance();
  }

  public async sendMessage(params: SendMessageParams): Promise<MessageResponse> {
    const startTime = Date.now();
    console.log(`[ChatService] Sending message for session ${params.sessionId}`); // Replaced Logger
    let userMessageId = ''; // Initialize

    try {
      // 1) Store user message FIRST
      const userMsgResult = await this.storeUserMessage(params);
      userMessageId = userMsgResult.userMessageId; // Assign the stored ID
      console.log(`[ChatService] User message stored (ID: ${userMessageId})`); // Replaced Logger

      // 2) Get chat history
      const history = await this.getSessionMessages(params.sessionId);
      console.log(`[ChatService] Fetched ${history.length} history messages.`); // Replaced Logger

      // 3) Prepare messages for LLM (Add context here)
      const llmMessages = this.prepareMessagesForLLM(history, params);

      // 4) Prepare OpenAI request parameters
      const openaiParams: OpenAIRequestParams = {
        model: params.model || 'gpt-4o',
        messages: llmMessages,
        temperature: 0.3,
        max_tokens: 3500,
      };

      // 5) Call the OpenAI service (via our backend)
      console.log('[ChatService] Calling OpenAI service via backend /api/openai...'); // Replaced Logger
      // --- The error happens inside this call ---
      const response = await this.openaiService.sendMessage(openaiParams);
      // --- Execution continues here ONLY if the backend call was successful ---
      console.log('[ChatService] Received successful response from backend.'); // Replaced Logger

      // 6) Extract data from the successful backend response
      const explanation = response.content;
      const fullLatexSuggestion = response.suggestions?.[0]?.text;

      if (!explanation || !fullLatexSuggestion) {
         console.error('[ChatService] Backend response missing explanation or fullLatex suggestion.', response); // Replaced Logger
         throw new Error("Received incomplete suggestion data from the backend.");
      }
      console.log(`[ChatService] Explanation length: ${explanation.length}, Suggestion length: ${fullLatexSuggestion.length}`); // Replaced Logger

      // 7) Store assistant message
      const assistantMessageId = await this.storeAssistantMessage(
        params.sessionId,
        explanation,
        fullLatexSuggestion,
        params.currentFile?.id
      );
      console.log(`[ChatService] Assistant message stored (ID: ${assistantMessageId})`); // Replaced Logger

      // 8) Update session timestamp
      await updateDoc(doc(db, 'chatSessions', params.sessionId), {
        lastUpdated: serverTimestamp()
      });

      const duration = Date.now() - startTime;
      console.log(`[ChatService] Message processed successfully in ${duration}ms.`); // Replaced Logger

      return {
        userMessageId,
        assistantMessageId,
        assistantContent: explanation,
      };
    } catch (error) {
      // This catch block handles errors thrown by openaiService.sendMessage or other steps
      const duration = Date.now() - startTime;
      // *** Log the *full* error object here for details ***
      console.error(`[ChatService] Error after ${duration}ms in sendMessage:`, error); // Replaced Logger

      // Attempt to store an error message in the chat for user visibility
      try {
        // *** FIX: Use params.sessionId here ***
        if (params.sessionId && userMessageId) { // Check params.sessionId and if user message was stored
          await addDoc(collection(db, 'chatSessions', params.sessionId, 'messages'), { // <-- Use params.sessionId
              sender: 'System',
              content: `Error generating response: ${error instanceof Error ? error.message : 'Unknown error'}`,
              timestamp: serverTimestamp(),
              userId: 'system',
              isError: true,
          });
           console.log(`[ChatService] Stored error message in session ${params.sessionId}`); // Replaced Logger
        } else {
           console.warn("[ChatService] Cannot store error message. Missing sessionId or userMessageId in catch block.", { sessionId: params.sessionId, userMessageId }); // Replaced Logger
        }

      } catch (storeError) {
         console.error('[ChatService] Failed to store error message in chat:', storeError); // Replaced Logger
      }

      return {
        userMessageId: userMessageId, // Return the ID even if subsequent steps failed
        error: error instanceof Error ? error.message : 'Unknown error processing message'
      };
    }
  }

  // Helper to store user message
  private async storeUserMessage(params: SendMessageParams): Promise<{ userMessageId: string }> {
      const storedContent = typeof params.content === 'string' ? params.content : JSON.stringify(params.content);
       if (!params.sessionId) throw new Error("Session ID is required to store user message.");

      const userMessageRef = await addDoc(
        collection(db, 'chatSessions', params.sessionId, 'messages'),
        {
          sender: 'You',
          content: storedContent,
          timestamp: serverTimestamp(),
          userId: params.userId,
          userName: params.userName,
        }
      );
      return { userMessageId: userMessageRef.id };
  }

  // Helper to store assistant message
  private async storeAssistantMessage(
      sessionId: string,
      explanation: string,
      fullLatexSuggestion: string,
      fileId?: string
  ): Promise<string> {

     const suggestionData = {
       text: fullLatexSuggestion,
       fileId: fileId || null,
     };
      if (!sessionId) throw new Error("Session ID is required to store assistant message.");

     const assistantMessageRef = await addDoc(
       collection(db, 'chatSessions', sessionId, 'messages'),
       {
         sender: 'LaTeX Assistant',
         content: explanation,
         suggestions: [suggestionData],
         timestamp: serverTimestamp(),
         userId: 'assistant',
         userName: 'LaTeX Assistant',
       }
     );
     return assistantMessageRef.id;
  }


  // Helper to get chat history (Corrected version)
  private async getSessionMessages(sessionId: string): Promise<Array<{ role: string; content: string }>> {
    try {
       if (!sessionId) {
           console.warn("[ChatService] getSessionMessages called without sessionId."); // Replaced Logger
           return [];
       }
      const messagesRef = collection(db, 'chatSessions', sessionId, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(10));
      const querySnapshot = await getDocs(q);

      const messages: Array<{ role: string; content: string }> = [];
      querySnapshot.docs.reverse().forEach((docSnap) => {
        const data = docSnap.data();
        if (!data) {
             console.warn(`[ChatService] Message document ${docSnap.id} has no data.`); // Replaced Logger
             return;
        }
        if (!data.isError) {
             const messageContent = typeof data.content === 'string' ? data.content : '';
             const role = data.sender === 'You' ? 'user' : 'assistant';
             if (messageContent.trim()) {
                 messages.push({ role, content: messageContent });
             }
        }
      });
      return messages;
    } catch (error) {
      console.error(`[ChatService] Error fetching messages for session ${sessionId}:`, error); // Replaced Logger
      return [];
    }
  }

  // Helper to prepare messages for LLM (including system prompt and context)
  private prepareMessagesForLLM(
      history: Array<{ role: string; content: string }>,
      params: SendMessageParams
  ): Array<{ role: string; content: string }> {

      const systemPrompt =
           "You are a LaTeX assistant. You are provided with context including the entire project file tree and the full content of the current LaTeX file, as well as user instructions for modifications. " +
            "Your task is to output your answer strictly in JSON format with exactly two keys: " +
            "`explanation` (string) and `fullLatex` (string). " +
            "`explanation` should be a concise summary of the changes made, suitable for display in a chat window. " +
            "In your explanation, ALWAYS be specific about where your changes should be applied (e.g., 'after line 15', 'in the introduction section'). " +
            "`fullLatex` MUST contain the COMPLETE, VALID, UPDATED LaTeX document code (including the preamble and document environment) with all modifications applied, ready to be inserted directly into the editor. " +
            "Ensure the `fullLatex` string is properly escaped for JSON (e.g., newlines as '\\n', quotes as '\\\"'). " +
            "Output ONLY the JSON structure, with no surrounding text, comments, or markdown formatting like ```json.";

      let contextString = "\n\n## CONTEXT ##\n";
       if (params.currentFile) {
           contextString += `\n### Current File: ${params.currentFile.name} (ID: ${params.currentFile.id}) ###\n`;
           const maxContentLength = 8000;
           const contentToSend = (params.currentFile.content || '').length > maxContentLength
               ? (params.currentFile.content || '').substring(0, maxContentLength) + "\n... (content truncated)"
               : (params.currentFile.content || '');
           contextString += `\`\`\`latex\n${contentToSend}\n\`\`\`\n`;
       } else {
           contextString += "\nNo specific file is currently open.\n";
       }
       if (params.mentionedFiles && params.mentionedFiles.length > 0) {
           contextString += "\n### Mentioned Files ###\n";
           params.mentionedFiles.forEach(file => {
               contextString += `\n#### File: ${file.name} (ID: ${file.id}) ####\n`;
               const maxMentionedLength = 4000;
               const contentToSend = (file.content || '').length > maxMentionedLength
                   ? (file.content || '').substring(0, maxMentionedLength) + "\n... (content truncated)"
                   : (file.content || '');
               contextString += `\`\`\`latex\n${contentToSend}\n\`\`\`\n`;
           });
       }
       const userActualMessage = typeof params.content === 'string' ? params.content : JSON.stringify(params.content);
       const userPromptWithContext = `${userActualMessage}\n${contextString}`;

       const messagesForLlm = [
           { role: 'system', content: systemPrompt },
           ...history,
           { role: 'user', content: userPromptWithContext }
       ];

       return messagesForLlm;
  }

  // Optional: Helper to ensure context manager is initialized (if used)
  private async ensureContextManager(projectId: string, userId: string, currentFileId?: string) {
    if (!this.documentContextManager || (currentFileId && this.documentContextManager.getDocumentContent() === '')) {
        console.log("[ChatService] Initializing DocumentContextManager..."); // Replaced Logger
        this.documentContextManager = new DocumentContextManager(projectId, userId);
        await this.documentContextManager.initializeContext(currentFileId || null);
        console.log("[ChatService] DocumentContextManager initialized."); // Replaced Logger
    }
  }
}

// Define limit helper or remove its usage if not needed
// const limit = (count: number) => ({ _limit: count, _limitType: 'limit' });

export default new ChatService();