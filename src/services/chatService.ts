// File: services/chatService.ts
import OpenAIService, { OpenAIRequestParams, BackendApiResponse } from './openai';
import {
  collection, addDoc, serverTimestamp, doc, updateDoc, query,
  orderBy, getDocs, Timestamp, limit // Ensured Timestamp and limit are imported
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

const Logger = console;

// Interfaces
// Allows string or the array format for OpenAI vision
type MessageContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

interface SendMessageParams {
  content: string; // User's raw text input
  projectId: string;
  sessionId: string;
  userId: string;
  userName: string;
  model: string; // The *selected* model
  currentFile?: { id: string; name: string; content: string };
  mentionedFiles?: Array<{ id: string; name: string; content: string }>;
  attachments?: Array<{ // Pass full attachment info
      id: string;
      name: string;
      type: string;
      url: string; // data: URL or public URL (ensure ChatWindow sends correct one)
      content?: string; // Optional text content
  }>;
}

interface MessageResponse {
  userMessageId: string;
  assistantMessageId?: string;
  assistantContent?: string; // Explanation / Generated content
  assistantEdits?: string[]; // Diffs (optional)
  error?: string;
}

class ChatService {
  private openaiService: OpenAIService;

  constructor() {
    this.openaiService = OpenAIService.getInstance();
  }

  public async sendMessage(params: SendMessageParams): Promise<MessageResponse> {
    const startTime = Date.now();
    Logger.log(`[ChatService] sendMessage received sessionId: ${params.sessionId}`);
    let userMessageId = '';

    try {
      // 1) Validate Session ID
      if (!params.sessionId) throw new Error("Session ID is required.");

      // 2) Store User Message (includes attachment metadata)
      const userMsgResult = await this.storeUserMessage(params);
      userMessageId = userMsgResult.userMessageId;
      Logger.log(`[ChatService] User message stored (ID: ${userMessageId})`);

      // 3) Get Chat History
      const history = await this.getSessionMessages(params.sessionId);
      Logger.log(`[ChatService] Fetched ${history.length} history messages.`);

      // 4) Prepare messages for LLM (handles potential image formatting)
      const llmMessages = this.prepareMessagesForLLM(history, params);

      // --- 5) DECISION POINT: Check for Image Attachments ---
      const hasImageAttachment = params.attachments?.some(att => att.type.startsWith('image/')) ?? false;
      Logger.log(`[ChatService] Has Image Attachment: ${hasImageAttachment}`);

      let explanation = '';
      let diffHunks: string[] = [];
      let assistantMessageId = '';

      // --- 6) Conditional API Calls ---
      if (hasImageAttachment) {
        // --- IMAGE SCENARIO: Call only Explain/Vision API ---
        Logger.log('[ChatService] Image detected. Calling only EXPLAIN/VISION API (/api/openai-explain)...');

        // Ensure a vision-capable model is used (e.g., gpt-4o)
        // The frontend should ideally select this, or backend validates/defaults
        const visionModel = params.model.includes('vision') || params.model.includes('4o') || params.model.includes('opus') || params.model.includes('sonnet') || params.model.includes('haiku') || params.model.includes('gemini') ? params.model : 'gpt-4o'; // Fallback to gpt-4o
        Logger.log(`[ChatService] Using vision model: ${visionModel}`);

        const visionParams: OpenAIRequestParams = {
          model: visionModel,
          messages: llmMessages, // Should contain the multimodal content array
          temperature: 0.5,
          max_tokens: 1500,
        };

        const explainResponse = await this.openaiService.callBackendApi('/api/openai-explain', visionParams);
        Logger.log('[ChatService] Received response from backend (explain/vision).');

        if (explainResponse.error) {
          const errorMsg = `LLM processing failed (vision): ${explainResponse.error}`;
          await this.storeAssistantMessageWithError(params.sessionId, "Failed to analyze image.", errorMsg);
          throw new Error(errorMsg);
        }
        explanation = explainResponse.explanation || explainResponse.content || "(No response content received)";
        diffHunks = []; // Explicitly no diffs for image scenario

        assistantMessageId = await this.storeAssistantMessageWithDiffs(params.sessionId, explanation, diffHunks);

      } else {
        // --- TEXT-ONLY SCENARIO: Call both Edit and Explain APIs ---
        Logger.log('[ChatService] No image detected. Calling EDIT and EXPLAIN APIs in parallel...');

        // Use the model selected by the user (might not be vision capable)
        const baseTextParams: OpenAIRequestParams = {
          model: params.model || 'gpt-4o', // Default if somehow not set
          messages: llmMessages, // Contains only text
        };

        // Prepare parallel calls
        const editParams = { ...baseTextParams, temperature: 0.1, max_tokens: 3000 };
        const editResponsePromise = this.openaiService.callBackendApi('/api/openai-edit', editParams);

        const explainParams = { ...baseTextParams, temperature: 0.5, max_tokens: 500 };
        const explainResponsePromise = this.openaiService.callBackendApi('/api/openai-explain', explainParams);

        // Await both responses
        const [editResponse, explainResponse] = await Promise.all([editResponsePromise, explainResponsePromise]);
        Logger.log('[ChatService] Received responses from both backend APIs (edit/explain).');

        // Process Edit Response (get diffs)
        // IMPORTANT: Check the exact structure your backend returns
        if (editResponse.error || !Array.isArray(editResponse.edits)) {
          const errorMsg = `Edit generation failed: ${editResponse.error || 'Invalid edits format or missing edits array'}`;
          Logger.error(`[ChatService] ${errorMsg}`, editResponse);
          explanation = explainResponse.explanation || explainResponse.content || "Edit generation failed; explanation might be incomplete.";
          diffHunks = []; // No valid diffs
          // Store error message BUT include any explanation received
          assistantMessageId = await this.storeAssistantMessageWithError(params.sessionId, explanation, errorMsg);
          throw new Error(errorMsg); // Propagate error
        } else {
             diffHunks = editResponse.edits; // Store the valid diffs
        }

        // Process Explain Response
        if (explainResponse.error) {
          Logger.warn(`[ChatService] Explanation generation failed: ${explainResponse.error}.`);
          explanation = `(Error generating explanation: ${explainResponse.error}). Changes generated.`;
        } else {
           explanation = explainResponse.explanation || explainResponse.content || "(No explanation provided)";
        }

        Logger.log(`[ChatService] Text-Only - Explanation length: ${explanation.length}, Edits count: ${diffHunks.length}`);

        // Store combined result (explanation + diffs)
        assistantMessageId = await this.storeAssistantMessageWithDiffs(params.sessionId, explanation, diffHunks);
      }

      // --- 7) Final Steps ---
      Logger.log(`[ChatService] Assistant message stored (ID: ${assistantMessageId})`);
      await updateDoc(doc(db, 'chatSessions', params.sessionId), { lastUpdated: serverTimestamp() });
      const duration = Date.now() - startTime;
      Logger.log(`[ChatService] Message processed successfully in ${duration}ms.`);

      return { userMessageId, assistantMessageId, assistantContent: explanation, assistantEdits: diffHunks };

    } catch (error) {
       // --- Error Handling ---
       const duration = Date.now() - startTime;
       Logger.error(`[ChatService] Error caught in sendMessage after ${duration}ms:`, error);
       try {
         const isSessionIdError = error instanceof Error && error.message === "Session ID is required.";
         // Store error message if we have a session ID and it wasn't the specific session ID error
         if (params.sessionId && !isSessionIdError) {
           await this.storeAssistantMessageWithError(
             params.sessionId,
             `System Error: Failed processing request.`,
             error instanceof Error ? error.message : 'Unknown processing error'
           );
         }
       } catch (storeError) { Logger.error('[ChatService] Failed to store final error message:', storeError); }
       return { userMessageId: userMessageId, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // --- Helper Functions ---

  // Stores user message with attachments metadata
  private async storeUserMessage(params: SendMessageParams): Promise<{ userMessageId: string }> {
      if (!params.sessionId) throw new Error("Session ID required for storeUserMessage.");
      const userMessageRef = await addDoc(
        collection(db, 'chatSessions', params.sessionId, 'messages'),
        {
          sender: 'You',
          content: params.content,
          timestamp: serverTimestamp(),
          userId: params.userId,
          userName: params.userName || 'User',
          mentions: params.mentionedFiles?.map(f => ({ id: f.id, name: f.name })) || [],
          attachments: params.attachments?.map(a => ({ name: a.name, type: a.type, url: a.url })) || [],
          isError: false,
        }
      );
      return { userMessageId: userMessageRef.id };
  }

  // Stores assistant message (handles potentially empty diffs)
  private async storeAssistantMessageWithDiffs(
      sessionId: string, explanation: string, diffHunks: string[]
  ): Promise<string> {
     if (!sessionId) throw new Error("Session ID required.");
     const validHunks = Array.isArray(diffHunks) ? diffHunks.filter(h => typeof h === 'string') : [];
     const assistantMessageRef = await addDoc(
       collection(db, 'chatSessions', sessionId, 'messages'),
       { sender: 'LaTeX Assistant', content: explanation || "", diffHunks: validHunks, timestamp: serverTimestamp(), userId: 'assistant', userName: 'LaTeX Assistant', isError: false }
     );
     return assistantMessageRef.id;
  }

  // Stores error message
   private async storeAssistantMessageWithError(
       sessionId: string, explanation: string, errorMessage: string
   ): Promise<string> {
      if (!sessionId) { Logger.error("Cannot store error: Session ID missing."); return "error-no-session"; }
      try {
          const errorContent = `${explanation}\n\n**Error Details:** ${errorMessage}`;
          const ref = await addDoc( collection(db, 'chatSessions', sessionId, 'messages'),
            { sender: 'System', content: errorContent, diffHunks: [], timestamp: serverTimestamp(), userId: 'system-error', userName: 'System', isError: true }
          );
          return ref.id;
      } catch(error) { Logger.error(`Failed to store error message:`, error); return "error-storing-error"; }
   }

  // Gets chat history (formats for vision if needed)
  private async getSessionMessages(sessionId: string): Promise<Array<{ role: string; content: MessageContent }>> {
      try {
          if (!sessionId) return [];
          const messagesRef = collection(db, 'chatSessions', sessionId, 'messages');
          const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(12));
          const snapshot = await getDocs(q);
          const messages: Array<{ role: string; content: MessageContent }> = [];

          snapshot.docs.reverse().forEach((docSnap) => { // Process oldest first
              const data = docSnap.data();
              if (!data || data.isError || data.sender === 'System') return; // Skip errors/system

              const role = (data.sender === 'You' || data.userId !== 'assistant') ? 'user' : 'assistant';
              let messageContent: MessageContent = '';

              // Reconstruct user message content for vision if attachments exist
              if (role === 'user' && data.attachments && data.attachments.length > 0) {
                  const contentArray: any[] = [{ type: "text", text: data.content || "" }];
                  let imageAdded = false; // Flag to ensure only one image is added per message if needed, or handle multiple
                  data.attachments.forEach((att: any) => {
                      // Only process image attachments with valid URLs for vision history
                      if (att.type?.startsWith('image/') && att.url && (att.url.startsWith('data:image') || att.url.startsWith('https'))) {
                         contentArray.push({ type: "image_url", image_url: { url: att.url } });
                         imageAdded = true;
                      }
                  });
                  // Use the array structure only if an image was actually added
                  messageContent = imageAdded ? contentArray : (data.content || "");
              } else if (typeof data.content === 'string') {
                  messageContent = data.content; // Standard text
              }

              // Add if content is valid
              if ((typeof messageContent === 'string' && messageContent.trim()) || (Array.isArray(messageContent) && messageContent.length > 0)) {
                  messages.push({ role, content: messageContent });
              }
          });
          return messages;
      } catch (error) { Logger.error(`Error fetching messages for ${sessionId}:`, error); return []; }
  }

  // Prepares messages for LLM (handles context and vision format)
  private prepareMessagesForLLM(
      history: Array<{ role: string; content: MessageContent }>,
      params: SendMessageParams
  ): Array<{ role: string; content: MessageContent }> {
      // 1. Construct Context String (same as before)
      let contextString = "\n\n## CONTEXT ##\n";
      if (params.currentFile) { /* ... add current file ... */ }
      if (params.mentionedFiles) { /* ... add mentioned files ... */ }

      // 2. Construct Final User Message Content
      const userPromptTextPart = `${params.content}\n${contextString}`;
      let finalUserContent: MessageContent;

      // Check if there are valid image attachments to send
      const imageAttachments = params.attachments?.filter(att =>
          att.type.startsWith('image/') && att.url && (att.url.startsWith('data:image') || att.url.startsWith('https'))
      ) || [];

      if (imageAttachments.length > 0) {
          // Format for multimodal input
          finalUserContent = [{ type: "text", text: userPromptTextPart }];
          imageAttachments.forEach(att => {
              (finalUserContent as Array<any>).push({ type: "image_url", image_url: { url: att.url } });
              Logger.log(`[prepareMessages] Added image attachment ${att.name} for LLM.`);
          });
      } else {
          // Format for text-only input
          finalUserContent = userPromptTextPart;
      }

      // 3. Combine History and Final User Message
      const messagesForLlm = [...history, { role: 'user', content: finalUserContent }];
      return messagesForLlm;
  }
}

export default new ChatService();