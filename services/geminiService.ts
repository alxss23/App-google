
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Slide } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

export async function generatePresentationScript(topic: string): Promise<Slide[]> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: `Create a script for a short, educational video presentation about "${topic}". 
    The presentation should be engaging and easy to understand.
    Generate exactly 5 slides.
    For each slide, provide a "title", a concise "narration" (around 30-50 words), and an "imagePrompt" for an AI image generator that visually represents the slide's content.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          slides: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: "The title of the slide."
                },
                narration: {
                  type: Type.STRING,
                  description: "The narration script for this slide."
                },
                imagePrompt: {
                  type: Type.STRING,
                  description: "A descriptive prompt to generate an image for this slide."
                }
              },
              required: ["title", "narration", "imagePrompt"]
            }
          }
        },
        required: ["slides"]
      }
    }
  });

  const jsonResponse = JSON.parse(response.text);
  return jsonResponse.slides;
}

export async function generateImageForSlide(prompt: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: prompt }],
    },
    config: {
      responseModalities: [Modality.IMAGE],
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.[0];
  if (part?.inlineData) {
    return part.inlineData.data;
  }
  throw new Error("Image generation failed or returned no data.");
}

export async function generateNarrationAudio(script: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Read the following presentation script in a clear, pleasant, and engaging voice: ${script}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });
  
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error("Audio generation failed.");
  }
  return base64Audio;
}
