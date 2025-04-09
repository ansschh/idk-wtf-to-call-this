// File: app/api/openai-vision/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import os from 'os';

const Logger = console;
const MAX_RETRIES = 2;

// Initialize the OpenAI client using your environment variable
let openai: OpenAI;
try {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 3,
    timeout: 60000
  });
} catch (error) {
  Logger.error('[openai-vision] Error initializing OpenAI client:', error);
}

// This route is dedicated for image-based requests.
export async function POST(request: NextRequest) {
  try {
    // Parse and validate the request body.
    const body = await request.json();
    if (!body || !body.messages) {
      return NextResponse.json(
        { error: "Request body must include a 'messages' field." },
        { status: 400 }
      );
    }
    const { model, messages, temperature = 0.5, max_tokens = 1500 } = body;

    // Verify that at least one of the messages includes image data.
    let imageFound = false;
    for (const msg of messages) {
      // If the message content is an array, check for any image parts.
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'image_url' && part.image_url?.url) {
            if (
              part.image_url.url.startsWith('data:image') ||
              part.image_url.url.startsWith('https')
            ) {
              imageFound = true;
              break;
            }
          }
        }
      } else if (
        typeof msg.content === 'string' &&
        msg.content.toLowerCase().includes('data:image')
      ) {
        imageFound = true;
      }
      if (imageFound) break;
    }
    if (!imageFound) {
      return NextResponse.json(
        { error: "No valid image data found in the request." },
        { status: 400 }
      );
    }

    // Use a vision-capable model. If no model is provided, default to "gpt-4o".
    const chosenModel = model && model.trim().length > 0 ? model : "gpt-4o";
    Logger.log(`[openai-vision] Using model: ${chosenModel}`);

    // Prepare the API call with retry logic.
    let attempt = 0;
    let responseContent = "";
    while (attempt < MAX_RETRIES) {
      attempt++;
      try {
        Logger.log(`[openai-vision] Attempt ${attempt}: Calling OpenAI API with ${messages.length} messages.`);
        const response = await openai.chat.completions.create({
          model: chosenModel,
          messages,
          temperature,
          max_tokens
        });
        responseContent = response.choices?.[0]?.message?.content || "";
        if (responseContent.trim().length === 0) {
          Logger.warn("[openai-vision] Received empty response; retrying...");
          continue;
        }
        break; // Successful response.
      } catch (err: any) {
        Logger.error(`[openai-vision] Attempt ${attempt} error: ${err.message}`);
        if (attempt >= MAX_RETRIES) {
          return NextResponse.json(
            { error: err.message || "Unknown error from vision API" },
            { status: 500 }
          );
        }
        // Optionally wait before retrying.
        await new Promise(res => setTimeout(res, 1000 * attempt));
      }
    }

    if (!responseContent.trim()) {
      return NextResponse.json(
        { error: "Received an empty response from the vision model." },
        { status: 500 }
      );
    }

    Logger.log(`[openai-vision] Returning explanation from model.`);
    return NextResponse.json({
      explanation: responseContent,
      model: chosenModel
    });

  } catch (error: any) {
    Logger.error("[openai-vision] Error processing request:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}
