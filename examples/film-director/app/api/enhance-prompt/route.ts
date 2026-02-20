import { NextRequest, NextResponse } from "next/server";
import { PROMPT_ENHANCEMENT_SYSTEM_PROMPT } from "@/lib/constants";

export async function POST(request: NextRequest) {
  try {
    const { prompt, previousPrompts } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    // Build the user message with context from previous prompts
    let userMessage = `Enhance this prompt: "${prompt}"`;
    
    if (previousPrompts && Array.isArray(previousPrompts) && previousPrompts.length > 0) {
      const contextList = previousPrompts
        .map((p: { frame: number; prompt: string }, i: number) => `Scene ${i + 1} (frame ${p.frame}): ${p.prompt}`)
        .join("\n");
      
      userMessage = `Previous scenes in the video:\n${contextList}\n\nNow enhance this new prompt for the next scene: "${prompt}"`;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: PROMPT_ENHANCEMENT_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("[enhance-prompt] OpenAI API error:", error);
      return NextResponse.json(
        { error: "Failed to enhance prompt" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const enhancedPrompt = data.choices?.[0]?.message?.content?.trim();

    if (!enhancedPrompt) {
      return NextResponse.json(
        { error: "No response from OpenAI" },
        { status: 500 }
      );
    }

    return NextResponse.json({ enhancedPrompt });
  } catch (error) {
    console.error("[enhance-prompt] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
