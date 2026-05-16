import { GoogleGenAI } from "@google/genai";

let genAI: GoogleGenAI | null = null;

function getAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing. Please set it in the Secrets panel.");
    }
    genAI = new GoogleGenAI(apiKey);
  }
  return genAI;
}

export async function getSmartHint(question: string, options: string[], grade: number) {
  try {
    const ai = getAI();
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" }); // Use stable alias
    
    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `You are a friendly and encouraging English teacher for a student in Grade ${grade}. 
      The student is stuck on this question: "${question}". 
      The options are: ${options.join(', ')}.
      
      Give a VERY SHORT, simple, and encouraging hint in Vietnamese to help them choose the right answer without just giving it away. 
      Keep the tone very playful and positive for a child.` }] }],
    });
    
    return response.response.text() || "Bé hãy cố gắng lên nhé! Thử đọc kỹ lại câu hỏi nè.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Bé hãy cố gắng lên nhé! Thử đọc kỹ lại câu hỏi nè.";
  }
}

export async function getEncouragement() {
  try {
    const ai = getAI();
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: "Say a very short, super encouraging and funny phrase in Vietnamese to a student who just finished their English exercise. Use emojis!" }] }],
    });
    return response.response.text() || "Bé giỏi quá! Tiếp tục phát huy nhé! 🌟";
  } catch (error) {
    return "Bé giỏi quá! Tiếp tục phát huy nhé! 🌟";
  }
}
