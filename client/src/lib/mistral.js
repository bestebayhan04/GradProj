import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

const safetySettings = [
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
    },
];

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_MISTRAL_PUBLIC_KEY);
const model = genAI.getGenerativeModel({ 
    model: "mistral-large", 
    safetySettings,
});

export default model;
