// File: src/app/api/latex-content/route.ts
import { NextResponse } from 'next/server';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function POST(request: Request) {
    try {
      const { prompt } = await request.json();
      console.log("Received prompt length:", prompt.length);
      
      // Use your custom prompt to generate LaTeX directly
      const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: `You are a LaTeX assistant. The user will provide a LaTeX document and request 
              to add something to it. Output ONLY valid LaTeX code, with no explanation, no markdown formatting, 
              and no code blocks. Just the complete document with the requested changes.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.2,
          max_tokens: 4000,
        }),
      });
  
      if (!openAiResponse.ok) {
        const errorText = await openAiResponse.text();
        console.error("OpenAI API error:", errorText);
        return NextResponse.json({ error: errorText }, { status: openAiResponse.status });
      }
  
      const data = await openAiResponse.json();
      const content = data.choices?.[0]?.message?.content || "";
      
      // Clean up the content - remove any code block markers
      const cleanedContent = content
        .replace(/```latex\s*/g, '')
        .replace(/```\s*/g, '');
      
      console.log("Generated content length:", cleanedContent.length);
      
      // Validate the content before returning
      if (cleanedContent.length < 100 || !cleanedContent.includes('\\documentclass')) {
        console.error("Generated invalid LaTeX content");
        return NextResponse.json({ 
          error: "Generated content does not appear to be valid LaTeX",
          partialContent: cleanedContent.substring(0, 100)
        }, { status: 400 });
      }
      
      return NextResponse.json({ content: cleanedContent });
    } catch (error) {
      console.error('Error:', error);
      return NextResponse.json({ 
        error: 'Internal Server Error',
        details: error instanceof Error ? error.message : String(error)
      }, { status: 500 });
    }
  }
  