import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Set up body parsers (limit to 10mb for base64 audio payloads)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Initialize Google Gen AI
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("Warning: GEMINI_API_KEY environment variable is not set.");
}

const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

const handleApiError = (error: any, res: any, context: string) => {
  console.error(`${context} error:`, error);
  let errMsg = "";
  if (error && typeof error === "object") {
    errMsg = error.message || (error.error && error.error.message) || String(error);
  } else {
    errMsg = String(error);
  }
  
  let isQuota = false;
  try {
    const errorString = (errMsg + " " + JSON.stringify(error)).toLowerCase();
    isQuota = errorString.includes("429") || 
              errorString.includes("quota") || 
              errorString.includes("resource_exhausted") || 
              errorString.includes("limit exceeded") ||
              error.status === "RESOURCE_EXHAUSTED" || 
              error.code === 429;
  } catch (e) {
    const errorString = errMsg.toLowerCase();
    isQuota = errorString.includes("429") || 
              errorString.includes("quota") || 
              errorString.includes("resource_exhausted") ||
              errorString.includes("limit exceeded") ||
              error.status === "RESOURCE_EXHAUSTED" || 
              error.code === 429;
  }
                  
  if (isQuota) {
    return res.status(429).json({
      error: "You have exceeded your Gemini API Free Tier daily limits in this shared session. To continue translating unlimited paragraphs, documents, images or speech on FanteLink, please configure your own GEMINI_API_KEY in the Google AI Studio Settings menu or retry in a few hours."
    });
  }
  
  res.status(500).json({ error: errMsg || `An error occurred during ${context.toLowerCase()}.` });
};

// Prompt describing Mfantse translation requirements
const SYSTEM_INSTRUCTION = `
You are FanteLink, an expert linguist, cultural historian, and translator specializing in the Mfantse (Fante) dialect of the Akan language group in Ghana.
Your objective is to translate English text into high-quality, authentic, and culturally resonant Fante.

CRITICAL RULES FOR MFANTSE TRANSLATION:
1. Do not perform robotic word-for-word translations. Capture the true meaning, idiom, and cadence of natural Fante speech.
2. Apply accurate Fante orthography, explicitly utilizing the distinct palatalized "ts" where phonetically appropriate instead of general Akan/Twi "t" (e.g., use "Tsetsefo" for ancestors, "Kyerɛwfo" instead of Twi equivalents, "tsen" for straight/live, "tsia" for short, "Mmabɔ hu" for do not fear, "nyansa" for wisdom, "abrabɔ" for life).
3. Ensure proper Fante negative imperative formations (e.g., prefixing "mma-" or "mme-" for prohibitions, like "Mmabɔ hu" instead of "Mmasuro" or general Twi "Mma bɔ hu").
4. Opt for elegant, traditional, and literary phrasing over flat modern substitutes when dealing with metaphors or emotional dialogue (e.g., translating a metaphorical dark night or period of struggle into deep literary vocabulary like "Nnafeembira" or deep cultural idioms).

You must ALWAYS return your evaluation in a JSON structure containing:
1. fanteTranslation: The high-quality translation string.
2. literalTranslation: Phrase-by-phrase or word-for-word meaning in English.
3. keyVocabulary: An array of up to 4 key vocabulary items from the translation, each containing:
   - word: The Fante word
   - phonetic: Approximated pronunciation guide (e.g. "tseh-tseh-foh")
   - meaning: English meaning
4. culturalNote: An elegant, short paragraph detailing dialect nuances, orthography rules applied, or historical context.
5. rawMarkdown: The EXACT Markdown structure formatted EXACTLY as follows:
* Fante Translation
[Insert the natural Fante translation here]
• Pronunciation & Breakdown
• Literal Translation: [Insert Literal Translation here]
• Key Vocabulary: [Insert key vocabulary words and meanings]
Cultural/Linguistic Note
[Insert Cultural/Linguistic Note here]

Make sure of perfect JSON format. Do not add any markdown block wrapper like \`\`\`json in the value fields of your JSON response itself, parse clean string.
`.trim();

// API endpoint for Text Translation
app.post("/api/translate", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'text' in request body." });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Translate this English text into Fante (Mfantse) according to your linguistic guidelines:\n\n"${text}"`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["fanteTranslation", "literalTranslation", "keyVocabulary", "culturalNote", "rawMarkdown"],
          properties: {
            fanteTranslation: {
              type: Type.STRING,
              description: "The refined Fante translation utilizing authentic palatalized 'ts' and proper negative imperatives."
            },
            literalTranslation: {
              type: Type.STRING,
              description: "Literal English definition phrase-by-phrase."
            },
            keyVocabulary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["word", "phonetic", "meaning"],
                properties: {
                  word: { type: Type.STRING },
                  phonetic: { type: Type.STRING },
                  meaning: { type: Type.STRING }
                }
              }
            },
            culturalNote: {
              type: Type.STRING,
              description: "Elegant summary of dialect rules, harmony, and traditional context."
            },
            rawMarkdown: {
              type: Type.STRING,
              description: "The evaluation rendered in the exact requested Markdown structure with asterisks and bullets."
            }
          }
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Empty response from Gemini model.");
    }

    const parsed = JSON.parse(resultText);
    res.json(parsed);

  } catch (error: any) {
    handleApiError(error, res, "Translation");
  }
});

// API endpoint for Deep Cultural & Grammatical Context (Amandze)
app.post("/api/deep-context", async (req, res) => {
  try {
    const { english, fante } = req.body;
    if (!english || !fante) {
      return res.status(400).json({ error: "Missing 'english' or 'fante' in request body." });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Perform a deep linguistic, grammatical, and cultural analysis of how this English sentence was translated into the Fante dialect (Mfantse).
      
      English sentence: "${english}"
      Fante translation: "${fante}"`,
      config: {
        systemInstruction: `You are FanteLink's expert cultural elder and senior linguist. Your role is to formulate deep grammatical explanations, explain linguistic metaphors, vowel mutations, and the "Amandze" (cultural propriety) of standard and literary Mfantse translations.
        
        CRITICAL MFANTSE BREAKDOWN RULES:
        1. Explain the etymology/word choice: why these specific Fante words are selected over general Akan/Twi formats.
        2. Detail Grammatical Rules & Vowel Harmony: state any deliberate vowel mutations (such as harmony, palatalization like "ts" instead of Twi "t", or nasalization).
        3. Highlight Cultural Metaphors & Idioms: break down emotional depth, references to "Tsetsefo" (Ancestors), wisdom, or social norms.
        4. Explain negative imperatives (if applicable, such as prefixing "mma-" or "mme-").
        
        You must return your analysis in a structured JSON form with the following fields:
        1. etymology: Explanation of word choice and phrasing suitability.
        2. vowelMutations: Details on vowel harmony, palatalization of "ts", or spelling rules applied.
        3. culturalMetaphors: Rich breakdown of ancestral connotations, idioms, or societal metaphors.
        4. grammaticalBreakdown: Specific grammatical constructs, tenses, verb prefixes or negative imperatives.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["etymology", "vowelMutations", "culturalMetaphors", "grammaticalBreakdown"],
          properties: {
            etymology: { type: Type.STRING },
            vowelMutations: { type: Type.STRING },
            culturalMetaphors: { type: Type.STRING },
            grammaticalBreakdown: { type: Type.STRING }
          }
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No response from deep analysis model.");
    }

    const parsed = JSON.parse(resultText);
    res.json(parsed);

  } catch (error: any) {
    handleApiError(error, res, "Deep-Context Analysis");
  }
});

// API endpoint for Audio Translation (Microphone Capture)
app.post("/api/translate-audio", async (req, res) => {
  try {
    const { base64Audio, mimeType } = req.body;
    if (!base64Audio) {
      return res.status(400).json({ error: "Missing 'base64Audio' in request body." });
    }

    const audioMimeType = mimeType || "audio/webm";

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: audioMimeType,
            data: base64Audio,
          },
        },
        {
          text: `You have been provided with an audio file of a user speaking English. 
          Please transcribe this English audio accurately, and then translate the transcribed English text into beautiful, authentic Fante (Mfantse) following your linguistic instructions.
          Make sure to explicitly include 'transcribedText' containing the English text that was transcribed from the audio in the JSON output, along with fanteTranslation, literalTranslation, keyVocabulary, culturalNote, and rawMarkdown.`
        }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["transcribedText", "fanteTranslation", "literalTranslation", "keyVocabulary", "culturalNote", "rawMarkdown"],
          properties: {
            transcribedText: {
              type: Type.STRING,
              description: "The English transcription of the provided audio file."
            },
            fanteTranslation: {
              type: Type.STRING,
              description: "The refined Fante translation utilizing authentic palatalized 'ts' and proper negative imperatives."
            },
            literalTranslation: {
              type: Type.STRING,
              description: "Literal English definition phrase-by-phrase."
            },
            keyVocabulary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["word", "phonetic", "meaning"],
                properties: {
                  word: { type: Type.STRING },
                  phonetic: { type: Type.STRING },
                  meaning: { type: Type.STRING }
                }
              }
            },
            culturalNote: {
              type: Type.STRING,
              description: "Elegant summary of dialect rules, harmony, and traditional context."
            },
            rawMarkdown: {
              type: Type.STRING,
              description: "The evaluation rendered in the exact requested Markdown structure with asterisks and bullets."
            }
          }
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Empty response from Gemini model.");
    }

    const parsed = JSON.parse(resultText);
    res.json(parsed);

  } catch (error: any) {
    handleApiError(error, res, "Audio Translation");
  }
});

// API endpoint for Image Translation (Camera Snap / File Upload Multimodal OCR & Translation)
app.post("/api/translate-image", async (req, res) => {
  try {
    const { base64Image, mimeType } = req.body;
    if (!base64Image) {
      return res.status(400).json({ error: "Missing 'base64Image' in request body." });
    }

    const imageMimeType = mimeType || "image/jpeg";

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: imageMimeType,
            data: base64Image,
          },
        },
        {
          text: `You have been provided with an image containing English text, a banner, or a paragraph. 
          First, identify and accurately transcribe the English text and paragraphs written in the image.
          Then, translate that transcribed English text into high-quality, authentic Fante (Mfantse) following your linguistic guidelines.
          Make sure to explicitly include 'transcribedText' containing the English text that was transcribed from the image in the JSON output, along with fanteTranslation, literalTranslation, keyVocabulary, culturalNote, and rawMarkdown.`
        }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["transcribedText", "fanteTranslation", "literalTranslation", "keyVocabulary", "culturalNote", "rawMarkdown"],
          properties: {
            transcribedText: {
              type: Type.STRING,
              description: "The English transcription of the text identified in the image."
            },
            fanteTranslation: {
              type: Type.STRING,
              description: "The refined Fante translation utilizing authentic palatalized 'ts' and proper negative imperatives."
            },
            literalTranslation: {
              type: Type.STRING,
              description: "Literal English definition phrase-by-phrase."
            },
            keyVocabulary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["word", "phonetic", "meaning"],
                properties: {
                  word: { type: Type.STRING },
                  phonetic: { type: Type.STRING },
                  meaning: { type: Type.STRING }
                }
              }
            },
            culturalNote: {
              type: Type.STRING,
              description: "Elegant summary of dialect rules, harmony, and traditional context."
            },
            rawMarkdown: {
              type: Type.STRING,
              description: "The evaluation rendered in the exact requested Markdown structure with asterisks and bullets."
            }
          }
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Empty response from Gemini vision model.");
    }

    const parsed = JSON.parse(resultText);
    res.json(parsed);

  } catch (error: any) {
    handleApiError(error, res, "Image Translation");
  }
});

// API endpoint for Document File & PDF Translation
app.post("/api/translate-file", async (req, res) => {
  try {
    const { base64File, mimeType } = req.body;
    if (!base64File) {
      return res.status(400).json({ error: "Missing 'base64File' in request body." });
    }

    const fileMimeType = mimeType || "application/pdf";

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: fileMimeType,
            data: base64File,
          },
        },
        {
          text: `You have been provided with a document (PDF, Text file, or Document format). 
          First, identify, extract and accurately transcribe the key English text and paragraph sections of this document.
          Then, translate that compiled English text into high-quality, authentic Fante (Mfantse) following your linguistic guidelines.
          Make sure to explicitly include 'transcribedText' containing the English text that was extracted from the document in your JSON output, along with fanteTranslation, literalTranslation, keyVocabulary, culturalNote, and rawMarkdown.`
        }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["transcribedText", "fanteTranslation", "literalTranslation", "keyVocabulary", "culturalNote", "rawMarkdown"],
          properties: {
            transcribedText: {
              type: Type.STRING,
              description: "The English transcription of the key contents/paragraphs extracted from the document."
            },
            fanteTranslation: {
              type: Type.STRING,
              description: "The refined Fante translation utilizing authentic palatalized 'ts' and proper negative imperatives."
            },
            literalTranslation: {
              type: Type.STRING,
              description: "Literal English definition phrase-by-phrase."
            },
            keyVocabulary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["word", "phonetic", "meaning"],
                properties: {
                  word: { type: Type.STRING },
                  phonetic: { type: Type.STRING },
                  meaning: { type: Type.STRING }
                }
              }
            },
            culturalNote: {
              type: Type.STRING,
              description: "Elegant summary of dialect rules, harmony, and traditional context."
            },
            rawMarkdown: {
              type: Type.STRING,
              description: "The evaluation rendered in the exact requested Markdown structure with asterisks and bullets."
            }
          }
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Empty response from Gemini document model.");
    }

    const parsed = JSON.parse(resultText);
    res.json(parsed);

  } catch (error: any) {
    handleApiError(error, res, "Document Translation");
  }
});

// API endpoint for Text-to-Speech Generation using Gemini Voice Synthesis
app.post("/api/tts", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing 'text' in request body." });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{
        parts: [{
          text: `Pronounce the following West African Fante (Mfantse) phrase clearly, naturally, and with traditional melodic phrasing: "${text}"`
        }]
      }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" }, // Best warm storytelling voice qualities
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No synthesized audio returned from Gemini Speech API.");
    }

    res.json({ base64Audio });

  } catch (error: any) {
    handleApiError(error, res, "Voice Synthesis");
  }
});

// API for sample expressions to make onboarding fluid
app.get("/api/samples", (req, res) => {
  res.json([
    {
      english: "Welcome, friends! Our ancestors are proud of your wisdom and beautiful lifestyle.",
      category: "Culture & Greeting"
    },
    {
      english: "Do not fear the deep darkness because dawn is coming soon.",
      category: "Encouragement"
    },
    {
      english: "The true measure of a man's life is how much wisdom he leaves behind.",
      category: "Wisdom & Proverb"
    },
    {
      english: "I am writing a story about the historical struggle and recovery of our people.",
      category: "Literary"
    }
  ]);
});

// Configure Vite middleware or static server
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FanteLink Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
