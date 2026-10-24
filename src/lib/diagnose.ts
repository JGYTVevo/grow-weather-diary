import { GoogleGenAI, Type } from "@google/genai";
import { createServerFn } from "@tanstack/react-start";

export interface PlantDiagnosisResult {
  plantIdentification: {
    commonName: string;
    confidence: string;
    stage: string;
  };
  healthAssessment: {
    healthScore: number;
    status: "Healthy" | "Minor Issues" | "Critical Alert";
    summary: string;
  };
  detectedIssues: {
    issue: string;
    severity: "Low" | "Medium" | "High";
    symptoms: string;
  }[];
  treatmentPlan: {
    step: string;
    action: string;
  }[];
  growBuddyTips: string[];
}

export const diagnosePlantPhoto = createServerFn({ method: "POST" })
  .validator(
    (input: { imageBase64: string; mimeType?: string; notes?: string; plantContext?: string }) =>
      input,
  )
  .handler(async ({ data }): Promise<PlantDiagnosisResult> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not configured on the server. Please check your environment variables.",
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    // Clean base64 string
    let pureBase64 = data.imageBase64;
    let mime = data.mimeType || "image/jpeg";
    if (pureBase64.includes("base64,")) {
      const parts = pureBase64.split("base64,");
      const match = parts[0]?.match(/data:([^;]+);/);
      if (match && match[1]) {
        mime = match[1];
      }
      pureBase64 = parts[1] || pureBase64;
    }

    const promptText = `
You are GrowBuddy AI, an expert horticulturist, botanist, and master plant diagnostic specialist.
Analyze this photo of a plant (which may be cannabis, garden vegetables, houseplants, etc.).
${data.plantContext ? `Known context about this plant: ${data.plantContext}` : ""}
${data.notes ? `Grower's notes/concerns: ${data.notes}` : ""}

Carefully examine:
1. Plant species/variety and lifecycle stage (e.g., Seedling, Early/Mid/Late Vegetative, Pre-flower, Early/Mid/Late Flowering, Ripening, Harvest ready).
2. Overall health and vitality rating (score from 0 to 100).
3. Any signs of nutrient deficiencies (Nitrogen, Phosphorus, Potassium, Calcium, Magnesium, Iron, Zinc, Boron, Sulfur), toxicity, light burn, wind burn, heat stress, cold stress, under/overwatering, or root rot.
4. Any evidence of pests or diseases (spider mites, thrips, aphids, fungus gnats, powdery mildew, botrytis/bud rot, septoria).
5. Actionable, step-by-step treatment plan with practical, immediate instructions (e.g. target runoff pH, EC/PPM, environmental adjustments, flushing, organic sprays, pruning).
6. Practical GrowBuddy pro-tips tailored to this specific plant condition and growth stage.

Be precise, encouraging, and actionable.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: mime,
                data: pureBase64,
              },
            },
            {
              text: promptText,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            plantIdentification: {
              type: Type.OBJECT,
              properties: {
                commonName: { type: Type.STRING },
                confidence: { type: Type.STRING },
                stage: { type: Type.STRING },
              },
              required: ["commonName", "confidence", "stage"],
            },
            healthAssessment: {
              type: Type.OBJECT,
              properties: {
                healthScore: { type: Type.INTEGER },
                status: {
                  type: Type.STRING,
                  enum: ["Healthy", "Minor Issues", "Critical Alert"],
                },
                summary: { type: Type.STRING },
              },
              required: ["healthScore", "status", "summary"],
            },
            detectedIssues: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  issue: { type: Type.STRING },
                  severity: {
                    type: Type.STRING,
                    enum: ["Low", "Medium", "High"],
                  },
                  symptoms: { type: Type.STRING },
                },
                required: ["issue", "severity", "symptoms"],
              },
            },
            treatmentPlan: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  step: { type: Type.STRING },
                  action: { type: Type.STRING },
                },
                required: ["step", "action"],
              },
            },
            growBuddyTips: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: [
            "plantIdentification",
            "healthAssessment",
            "detectedIssues",
            "treatmentPlan",
            "growBuddyTips",
          ],
        },
      },
    });

    if (!response.text) {
      throw new Error("No response received from AI model.");
    }

    try {
      const parsed = JSON.parse(response.text) as PlantDiagnosisResult;
      return parsed;
    } catch (parseError) {
      console.error("Failed to parse Gemini JSON output:", response.text, parseError);
      throw new Error("Could not parse plant diagnostic response.");
    }
  });
