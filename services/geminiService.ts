
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateTaskSuggestions = async (columnTitle: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Suggest 3 unique, realistic project tasks for a Kanban column named "${columnTitle}". Each task needs a title and a brief description.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Short title of the task" },
              description: { type: Type.STRING, description: "One sentence description" }
            },
            required: ["title", "description"]
          }
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini Suggestion Error:", error);
    return [];
  }
};

export const refineCardDescription = async (currentDescription: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Improve and professionalize this task description, making it actionable and clear: "${currentDescription}"`,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Refinement Error:", error);
    return currentDescription;
  }
};

export const summarizeBoard = async (boardData: any) => {
  try {
    const boardString = JSON.stringify(boardData);
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Act as a senior project manager. Analyze the status of this board: ${boardString}. Provide a clear executive summary (under 120 words) identifying progress, key wins, and potential bottlenecks.`,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Summary Error:", error);
    return "Could not generate summary at this time. Please check your network.";
  }
};
