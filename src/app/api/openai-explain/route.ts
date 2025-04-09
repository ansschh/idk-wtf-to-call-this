// File: src/app/api/openai-explain/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import {
  ChatCompletionMessageParam,
  ChatCompletionContentPart,
} from 'openai/resources/chat/completions';

const Logger = console;
const MAX_RETRIES = 2;

// Initialize OpenAI client
let openai: OpenAI;
try {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 3,
    timeout: 60000,
  });
} catch (error) {
  Logger.error('[API Explain] Error initializing OpenAI client:', error);
}

type InputContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: string } };

// For convenience, define a type for project files
interface ProjectFile {
  id: string;
  name: string;
  type: 'file' | 'folder';
  url?: string;      // For images, must be a data: or https:
  content?: string;  // For text files
}

export async function POST(request: Request) {
  // Validate OpenAI
  if (!openai || !process.env.OPENAI_API_KEY) {
    Logger.error('[API Explain] Missing or invalid API key.');
    return NextResponse.json({ error: 'OpenAI key missing' }, { status: 500 });
  }

  // Parse request
  let body: any;
  try {
    body = await request.json();
  } catch (parseError) {
    Logger.error('[API Explain] Could not parse JSON:', parseError);
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    model: requestedModel,
    messages: incomingMessages,
    generateTitle = false,
    projectFiles = [],      // Array of ProjectFile
    currentFileContent = '' // Extra context for the currently open file
  } = body || {};

  if (!incomingMessages || !Array.isArray(incomingMessages) || incomingMessages.length === 0) {
    Logger.error("[API Explain] 'messages' is missing or empty.");
    return NextResponse.json({ error: 'Missing messages array' }, { status: 400 });
  }

  // 1. Build system prompt
  let systemPrompt = `You are a helpful LaTeX assistant integrated into an editor environment.
You have the entire project context. Analyze the user's request and any images.
Provide concise explanations, generate LaTeX code, or describe images as needed.
Format any LaTeX code with \`\`\`latex ...\`\`\`. Focus on directly addressing the user's request.\n`;

  // 2. Add excerpt from current file if provided
  if (currentFileContent.trim().length > 0) {
    const excerpt = currentFileContent.substring(0, 300);
    systemPrompt += `\n[Current File Excerpt]\n${excerpt}${currentFileContent.length > 300 ? '...' : ''}\n`;
  }

  // 3. Build an array of content parts for all project files
  const fileContextParts: ChatCompletionContentPart[] = [];
  let hasImageInProject = false;

  for (const f of projectFiles) {
    // If it's a file
    if (f.type === 'file') {
      // Basic check if this is an image by extension or by presence of .url
      const isImage = f.url && (
        f.url.startsWith('data:image') ||
        /\.(png|jpe?g|gif|svg|bmp|webp)$/i.test(f.name)
      );

      if (isImage) {
        hasImageInProject = true;
        // Add an 'image_url' part so the model sees the image
        fileContextParts.push({
          type: 'image_url',
          image_url: {
            url: f.url as string,
            detail: 'auto'
          }
        });
        // Also add a text note describing the file name
        fileContextParts.push({
          type: 'text',
          text: `[Image File: ${f.name}]`
        });
      } else if (f.content && typeof f.content === 'string' && f.content.trim().length > 0) {
        // This is presumably a text file
        const textExcerpt = f.content.substring(0, 300);
        fileContextParts.push({
          type: 'text',
          text: `[Text File: ${f.name}]\n${textExcerpt}${f.content.length > 300 ? '...' : ''}`
        });
      } else {
        // A file with no content or unknown type
        fileContextParts.push({
          type: 'text',
          text: `[File: ${f.name}] (no content provided)`
        });
      }
    } else {
      // It's a folder or something else
      fileContextParts.push({
        type: 'text',
        text: `[Folder: ${f.name}]`
      });
    }
  }

  // We'll combine these fileContextParts into one "system" message so the model sees them all
  // or we can add them as a separate message
  const systemContextMessage = {
    role: 'system',
    content: fileContextParts
  };

  // 4. Prepare final messages for the OpenAI call
  const requestMessages = [
    { role: 'system', content: systemPrompt },
    systemContextMessage,
    ...incomingMessages.map((msg: any) => {
      const validRole = ['user','assistant','system'].includes(msg.role) ? msg.role : 'user';
      // If content is an array, we pass it as is. Otherwise, it's a string
      if (Array.isArray(msg.content)) {
        return {
          role: validRole,
          content: msg.content.map((part: InputContentPart) => {
            if (part.type === 'text') {
              return { type: 'text', text: part.text };
            } else if (part.type === 'image_url') {
              if (!part.image_url.url.startsWith('data:image') && !part.image_url.url.startsWith('http')) {
                return null; // Skip invalid
              }
              return {
                type: 'image_url',
                image_url: {
                  url: part.image_url.url,
                  detail: part.image_url.detail || 'auto'
                }
              };
            }
            return null;
          }).filter(Boolean)
        };
      } else {
        // String content
        return {
          role: validRole,
          content: msg.content
        };
      }
    })
  ];

  // 5. Decide on the model
  // If there's an image in the project or an image in the final user message, override to a vision model
  let hasImageInUserMessage = false;
  const lastMsg = incomingMessages[incomingMessages.length - 1];
  if (lastMsg && Array.isArray(lastMsg.content)) {
    hasImageInUserMessage = lastMsg.content.some((p: any) => p.type === 'image_url');
  }

  let finalModel = requestedModel || 'gpt-4o';
  const visionModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-vision-preview','gpt-4-turbo'];

  if (hasImageInProject || hasImageInUserMessage) {
    if (!visionModels.includes(finalModel)) {
      Logger.warn(`[API Explain] Overriding model to 'gpt-4o-mini' because image(s) exist.`);
      finalModel = 'gpt-4o-mini';
    }
  }

  // 6. Retry logic with up to MAX_RETRIES
  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    attempt++;
    Logger.log(`[API Explain Attempt ${attempt}] Using model: ${finalModel} with ${requestMessages.length} messages.`);

    try {
      const response = await openai.chat.completions.create({
        model: finalModel,
        messages: requestMessages,
        temperature: 0.5,
        max_tokens: 1500
      });
      const explanation = response.choices?.[0]?.message?.content || '';

      if (!explanation.trim()) {
        Logger.error(`[API Explain Attempt ${attempt}] Empty response from the model.`);
        if (attempt < MAX_RETRIES) {
          await new Promise(res => setTimeout(res, 1000 * attempt));
          continue;
        } else {
          return NextResponse.json({ error: 'No response from model.' }, { status: 500 });
        }
      }

      // If user asked for a title
      let chatTitle = null;
      if (generateTitle) {
        chatTitle = await generateConversationTitle(incomingMessages, openai);
      }

      return NextResponse.json({
        explanation,
        title: chatTitle,
        model: finalModel
      });

    } catch (err: any) {
      Logger.error(`[API Explain Attempt ${attempt}] Error:`, err);
      if (attempt < MAX_RETRIES) {
        Logger.warn(`[API Explain] Retrying after error: ${err.message}`);
        await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt - 1)));
        continue;
      }
      let status = 500;
      if (err.status) status = err.status;
      return NextResponse.json({
        error: err.message || 'Unknown error',
        details: err.stack || 'No stack trace'
      }, { status });
    }
  }

  Logger.error('[API Explain] Exited retry loop unexpectedly.');
  return NextResponse.json({ error: 'Max retries exceeded.' }, { status: 500 });
}


// Optional helper if generateTitle = true
async function generateConversationTitle(
  messages: any[],
  openaiClient: OpenAI
): Promise<string | null> {
  try {
    const userMessage = messages.find(m => m.role === 'user');
    if (!userMessage) return null;

    let userText = '';
    if (typeof userMessage.content === 'string') {
      userText = userMessage.content;
    } else if (Array.isArray(userMessage.content)) {
      userText = userMessage.content
        .filter(p => p.type === 'text')
        .map(p => (p as any).text)
        .join(' ');
    }

    if (!userText.trim()) return null;

    const titleRes = await openaiClient.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'Generate a concise 4-5 word title for this LaTeX conversation. No prefix—just the title.' },
        { role: 'user', content: userText.substring(0, 500) }
      ],
      temperature: 0.3,
      max_tokens: 25
    });
    let title = titleRes.choices?.[0]?.message?.content?.trim() || null;
    if (title) {
      title = title.replace(/^(title:|latex title:|")/i, '').replace(/"$/, '').trim();
    }
    return title;
  } catch (error) {
    Logger.error('[generateConversationTitle] Error:', error);
    return null;
  }
}
