// File: services/chatService.ts

import OpenAIService, { OpenAIRequestParams, BackendApiResponse } from './openai';
import {
  collection, addDoc, serverTimestamp, doc, updateDoc, query,
  orderBy, getDocs, Timestamp, limit
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DocumentContextManager } from '../utils/DocumentContextManager';

const Logger = console;

//
// Types and Interfaces
//

type MessageContent =
  | string
  | Array<
      { type: "text"; text: string } |
      { type: "image_url"; image_url: { url: string } }
    >;

interface GenerateTitleParams {
  content: string;
  model: string;
}

interface SendMessageParams {
  content: string;
  projectId: string;
  sessionId: string;
  userId: string;
  userName: string;
  model: string;
  currentFile?: { id: string; name: string; content: string };
  mentionedFiles?: Array<{ id: string; name: string; content: string }>;
  attachments?: Array<{
    id: string;
    name: string;
    type: string;
    url: string;
    content?: string;
  }>;
  projectFiles?: Array<{
    id: string;
    name: string;
    type: string;
    parentId?: string | null;
  }>;
}

interface MessageResponse {
  userMessageId: string;
  assistantMessageId?: string;
  assistantContent?: string;
  assistantEdits?: string[];
  error?: string;
}

//
// ChatService Class
//

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
      if (!params.sessionId) throw new Error("Session ID is required.");

      // 1) Store the user's message in Firestore.
      const userMsgResult = await this.storeUserMessage(params);
      userMessageId = userMsgResult.userMessageId;
      Logger.log(`[ChatService] User message stored (ID: ${userMessageId})`);

      // 2) Retrieve chat history.
      const history = await this.getSessionMessages(params.sessionId);
      Logger.log(`[ChatService] Fetched ${history.length} history messages.`);

      // 3) Gather project context from DocumentContextManager.
      const contextManager = new DocumentContextManager(params.projectId, params.userId);
      contextManager.setProjectFiles(params.projectFiles || []);
      const fullProjectContext = await contextManager.gatherProjectContext();

      // Truncate project context if necessary.
      const MAX_CONTEXT_LENGTH = 24000; // e.g., 24,000 characters (~6,000 tokens)
      const truncatedContext = fullProjectContext.length > MAX_CONTEXT_LENGTH
        ? fullProjectContext.slice(0, MAX_CONTEXT_LENGTH) + "\n[...TRUNCATED PROJECT CONTEXT...]"
        : fullProjectContext;
      const projectContextMessage = {
        role: 'system',
        content: `Project Context:\n${truncatedContext}`
      };

      // Inject project context only if not already present.
      const hasProjectContext = history.some(m =>
        m.role === 'system' &&
        typeof m.content === 'string' &&
        m.content.startsWith('Project Context:')
      );
      const llmMessages = this.prepareMessagesForLLM(history, params);
      if (!hasProjectContext) {
        llmMessages.unshift(projectContextMessage);
      }
      Logger.log(`[ChatService] Prepared ${llmMessages.length} messages for LLM.`);

      // 4) Check for image attachments.
      const hasImageAttachment = params.attachments?.some(att => att.type.startsWith('image/')) ?? false;
      Logger.log(`[ChatService] Has image attachment: ${hasImageAttachment}`);

      // 5) Process mentioned files.
      let validMentionedFiles: Array<{ id: string; name: string; content: string }> = [];
      if (params.mentionedFiles && params.mentionedFiles.length > 0) {
        Logger.log('[ChatService] Fetching content for mentioned files...');
        const results = await Promise.all(
          params.mentionedFiles
            .filter(mention => mention.id !== params.currentFile?.id)
            .map(async (mention) => {
              let fileContent = mention.content ?? await this.getFileContent(mention.id);
              if (fileContent === null) {
                Logger.warn(`[ChatService] Content fetch failed for ${mention.name} (${mention.id})`);
                return null;
              }
              // For image files, convert to base64 if not already.
              if (this.isImageFile(mention.name) && !fileContent.startsWith('data:')) {
                fileContent = await this.convertUrlToBase64(fileContent);
              }
              return { id: mention.id, name: mention.name, content: fileContent };
            })
        );
        validMentionedFiles = results.filter(Boolean) as Array<{ id: string; name: string; content: string }>;
        Logger.log(`[ChatService] Fetched content for ${validMentionedFiles.length} mentioned files.`);
      }

      // 6) Determine model override based on mentioned file types.
      let hasTexMention = false;
      let hasImageMention = false;
      validMentionedFiles.forEach(m => {
        const lowerName = m.name.toLowerCase();
        if (lowerName.endsWith('.tex')) hasTexMention = true;
        else if (this.isImageFile(m.name)) hasImageMention = true;
      });

      let modelToUse = params.model; // Start with user-selected model.
      let explainResponse: BackendApiResponse;
      const explainParams: OpenAIRequestParams = {
        model: modelToUse,
        messages: llmMessages,
        temperature: 0.5,
        max_tokens: (hasImageMention || hasImageAttachment) ? 1500 : 3000
      };

      if (hasImageMention || hasImageAttachment) {
        Logger.log("[ChatService] Detected image in attachments/mentions; routing to /api/openai-vision.");
        explainResponse = await this.openaiService.callBackendApi('/api/openai-vision', explainParams);
      } else if (hasTexMention) {
        modelToUse = 'gpt-4-turbo';
        Logger.log("[ChatService] Detected .tex file mention; using text-focused model.");
        explainParams.model = modelToUse;
        explainResponse = await this.openaiService.callBackendApi('/api/openai-explain', explainParams);
      } else {
        explainResponse = await this.openaiService.callBackendApi('/api/openai-explain', explainParams);
      }
      Logger.log(`[ChatService] Called API with model ${modelToUse}.`);

      if (explainResponse.error) {
        const errorMsg = `LLM processing failed: ${explainResponse.error}`;
        await this.storeAssistantMessageWithError(params.sessionId, "Failed to process request.", errorMsg);
        throw new Error(errorMsg);
      }

      const explanation = explainResponse.explanation || explainResponse.content || "(No response received)";

      // 7) Store the assistant's message in Firestore.
      const diffHunks: string[] = [];
      const assistantMessageId = await this.storeAssistantMessageWithDiffs(params.sessionId, explanation, diffHunks);
      Logger.log(`[ChatService] Assistant message stored (ID: ${assistantMessageId}).`);

      // 8) For the very first message, generate a chat title.
      if (history.length === 0) {
        try {
          Logger.log('[ChatService] First message detected; generating chat title...');
          const title = await this.generateTitle({
            content: params.content,
            model: 'gpt-3.5-turbo'
          });
          if (title) {
            await updateDoc(doc(db, 'chatSessions', params.sessionId), {
              title,
              lastUpdated: serverTimestamp()
            });
            Logger.log(`[ChatService] Updated chat title to "${title}"`);
          }
        } catch (titleError) {
          Logger.error('[ChatService] Title generation error:', titleError);
        }
      }
      await updateDoc(doc(db, 'chatSessions', params.sessionId), { lastUpdated: serverTimestamp() });
      Logger.log(`[ChatService] Message processed successfully in ${Date.now() - startTime}ms.`);

      return {
        userMessageId,
        assistantMessageId,
        assistantContent: explanation,
        assistantEdits: diffHunks
      };

    } catch (error: any) {
      Logger.error(`[ChatService] Error in sendMessage:`, error);
      try {
        if (params.sessionId && error.message !== "Session ID is required.") {
          await this.storeAssistantMessageWithError(
            params.sessionId,
            "System Error: Failed processing request.",
            error.message || "Unknown error"
          );
        }
      } catch (storeError) {
        Logger.error('[ChatService] Error storing error message:', storeError);
      }
      return { userMessageId, error: error.message || "Unknown error" };
    }
  }

  // -------------- Helper Methods --------------

  private async generateTitle(params: GenerateTitleParams): Promise<string | null> {
    try {
      Logger.log('[ChatService] Generating chat title...');
      const titleMessages = [
        {
          role: 'system',
          content:
            'Generate a concise, descriptive title (4-5 words) for this LaTeX conversation. Do not include any prefixes; just provide the title.'
        },
        { role: 'user', content: params.content.substring(0, 500) }
      ];
      const titleParams: OpenAIRequestParams = {
        model: 'gpt-3.5-turbo',
        messages: titleMessages,
        temperature: 0.3,
        max_tokens: 25
      };
      const titleResponse = await this.openaiService.callBackendApi('/api/openai-explain', titleParams);
      if (titleResponse.error) {
        Logger.error(`[ChatService] Title generation failed: ${titleResponse.error}`);
        return null;
      }
      let title = titleResponse.explanation || titleResponse.content || null;
      if (title) {
        title = title.replace(/^(title:|latex title:|")/i, '').replace(/"$/, '').trim();
      }
      Logger.log(`[ChatService] Generated title: "${title}"`);
      return title;
    } catch (error) {
      Logger.error('[ChatService] Error generating title:', error);
      return null;
    }
  }

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
        attachments: params.attachments?.map(a => ({
          name: a.name,
          type: a.type,
          url: a.url
        })) || [],
        isError: false
      }
    );
    return { userMessageId: userMessageRef.id };
  }

  private async storeAssistantMessageWithDiffs(
    sessionId: string,
    explanation: string,
    diffHunks: string[]
  ): Promise<string> {
    if (!sessionId) throw new Error("Session ID required.");
    const validHunks = Array.isArray(diffHunks) ? diffHunks.filter(h => typeof h === 'string') : [];
    const assistantMessageRef = await addDoc(
      collection(db, 'chatSessions', sessionId, 'messages'),
      {
        sender: 'LaTeX Assistant',
        content: explanation || "",
        diffHunks: validHunks,
        timestamp: serverTimestamp(),
        userId: 'assistant',
        userName: 'LaTeX Assistant',
        isError: false
      }
    );
    return assistantMessageRef.id;
  }

  private async storeAssistantMessageWithError(
    sessionId: string,
    explanation: string,
    errorMessage: string
  ): Promise<string> {
    if (!sessionId) {
      Logger.error("Cannot store error: Session ID missing.");
      return "error-no-session";
    }
    try {
      const errorContent = `${explanation}\n\n**Error Details:** ${errorMessage}`;
      const ref = await addDoc(
        collection(db, 'chatSessions', sessionId, 'messages'),
        {
          sender: 'System',
          content: errorContent,
          diffHunks: [],
          timestamp: serverTimestamp(),
          userId: 'system-error',
          userName: 'System',
          isError: true
        }
      );
      return ref.id;
    } catch (error) {
      Logger.error('[ChatService] Failed to store error message:', error);
      return "error-storing-error";
    }
  }

  private async getSessionMessages(sessionId: string): Promise<Array<{ role: string; content: MessageContent }>> {
    try {
      if (!sessionId) return [];
      const messagesRef = collection(db, 'chatSessions', sessionId, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(12));
      const snapshot = await getDocs(q);
      const messages: Array<{ role: string; content: MessageContent }> = [];
      snapshot.docs.reverse().forEach(docSnap => {
        const data = docSnap.data();
        if (!data || data.isError || data.sender === 'System') return;
        const role = (data.sender === 'You' || data.userId !== 'assistant') ? 'user' : 'assistant';
        let messageContent: MessageContent = '';
        if (role === 'user' && data.attachments && data.attachments.length > 0) {
          const contentArray: any[] = [{ type: "text", text: data.content || "" }];
          let imageAdded = false;
          data.attachments.forEach((att: any) => {
            if (
              att.type?.startsWith('image/') &&
              att.url &&
              (att.url.startsWith('data:image') || att.url.startsWith('https'))
            ) {
              contentArray.push({ type: "image_url", image_url: { url: att.url } });
              imageAdded = true;
            }
          });
          messageContent = imageAdded ? contentArray : (data.content || "");
        } else if (typeof data.content === 'string') {
          messageContent = data.content;
        }
        if ((typeof messageContent === 'string' && messageContent.trim()) ||
            (Array.isArray(messageContent) && messageContent.length > 0)) {
          messages.push({ role, content: messageContent });
        }
      });
      return messages;
    } catch (error) {
      Logger.error(`[ChatService] Error fetching messages for ${sessionId}:`, error);
      return [];
    }
  }

  private prepareMessagesForLLM(
    history: Array<{ role: string; content: MessageContent }>,
    params: SendMessageParams
  ): Array<{ role: string; content: MessageContent }> {
    let contextString = "\n\n## CONTEXT ##\n";
    if (params.currentFile) {
      contextString += `Current File: ${params.currentFile.name}\n${params.currentFile.content}\n`;
    }
    if (params.mentionedFiles) {
      params.mentionedFiles.forEach(m => {
        contextString += `Mentioned File: ${m.name}\n${m.content}\n`;
      });
    }
    const finalPrompt = `${params.content}\n${contextString}`;
    const imageAttachments = (params.attachments || []).filter(
      att =>
        att.type?.startsWith('image/') &&
        att.url &&
        (att.url.startsWith('data:image') || att.url.startsWith('https'))
    );
  
    if (imageAttachments.length === 0) {
      return [...history, { role: 'user', content: finalPrompt }];
    }
  
    const userContentArray: Array<{ type: "text" | "image_url"; [key: string]: any }> = [
      { type: "text", text: finalPrompt }
    ];
  
    imageAttachments.forEach(att => {
      userContentArray.push({ type: "image_url", image_url: { url: att.url } });
    });
  
    return [...history, { role: 'user', content: userContentArray }];
  }

  private isImageFile(fileName: string): boolean {
    const lower = fileName.toLowerCase();
    return (
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.png') ||
      lower.endsWith('.gif') ||
      lower.endsWith('.bmp') ||
      lower.endsWith('.webp')
    );
  }

  private async getFileContent(fileId: string): Promise<string | null> {
    try {
      const response = await fetch(`/api/get-file-content?id=${fileId}`);
      if (response.ok) {
        const data = await response.json();
        return data.content as string;
      }
      return null;
    } catch (error) {
      Logger.error(`[ChatService] Exception fetching file content for ${fileId}:`, error);
      return null;
    }
  }

  private async convertUrlToBase64(url: string): Promise<string> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        Logger.warn(`[ChatService] Could not fetch image from URL: ${url}`);
        return url;
      }
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      // If the base64 string is excessively long, compress it.
      const MAX_BASE64_LENGTH = 500000; // Adjust threshold as needed.
      if (dataUrl.length > MAX_BASE64_LENGTH) {
        Logger.log(`[ChatService] Base64 length ${dataUrl.length} exceeds threshold; compressing image.`);
        return await this.compressBase64Image(dataUrl, 0.7, 800);
      }
      return dataUrl;
    } catch (error) {
      Logger.error(`[ChatService] Error converting URL to base64:`, error);
      return url;
    }
  }

  // Compress a base64 image using an offscreen canvas.
  private async compressBase64Image(dataUrl: string, quality: number = 0.7, maxWidth: number = 800): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((maxWidth / width) * height);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Unable to get canvas context."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(compressedDataUrl);
      };
      img.onerror = err => reject(err);
      img.src = dataUrl;
    });
  }
}

export default new ChatService();
