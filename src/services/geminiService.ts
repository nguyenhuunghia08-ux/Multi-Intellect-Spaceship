import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getSmartHint(question: string, options: string[], grade: number) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a friendly and encouraging English teacher for a student in Grade ${grade}. 
      The student is stuck on this question: "${question}". 
      The options are: ${options.join(', ')}.
      
      Give a VERY SHORT, simple, and encouraging hint in Vietnamese to help them choose the right answer without just giving it away. 
      Keep the tone very playful and positive for a child.`,
    });
    
    return response.text || "Bé hãy cố gắng lên nhé! Thử đọc kỹ lại câu hỏi nè.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Bé hãy cố gắng lên nhé! Thử đọc kỹ lại câu hỏi nè.";
  }
}

export async function getEncouragement() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Say a very short, super encouraging and funny phrase in Vietnamese to a student who just finished their English exercise. Use emojis!",
    });
    return response.text || "Bé giỏi quá! Tiếp tục phát huy nhé! 🌟";
  } catch (error) {
    return "Bé giỏi quá! Tiếp tục phát huy nhé! 🌟";
  }
}
