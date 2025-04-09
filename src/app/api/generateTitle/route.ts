// src/app/api/generateTitle/route.ts

import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize with your **server** env var
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    if (!message) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a concise title generator. Create a 3–5 word title summarizing this user request.'
        },
        { role: 'user', content: message }
      ],
      max_tokens: 8
    });

    const title = completion.choices[0].message.content.trim() || 'Untitled Chat';
    return NextResponse.json({ title });

  } catch (err) {
    console.error('Title generation error:', err);
    return NextResponse.json({ error: 'Failed to generate title' }, { status: 500 });
  }
}
