import './newPrompt.css'; 
import { useEffect, useRef, useState } from 'react';
import model from "../../lib/gemini";
import queryLlama from "../../lib/llama";
import queryMistral from "../../lib/mistral";
import Markdown from "react-markdown";
import { useMutation, useQueryClient } from '@tanstack/react-query';

const NewPrompt = ({ data }) => {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini");
  const [isThinking, setIsThinking] = useState(false);
  const [sources, setSources] = useState([]);

  let chat;
  if (selectedModel === "gemini") {
    chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: "Hello, I have 2 dogs in my house." }] },
        { role: "model", parts: [{ text: "Great to meet you. What would you like to know?" }] },
      ],
    });
  }

  const endRef = useRef(null);
  const formRef = useRef(null);

  useEffect(() => {
    endRef.current.scrollIntoView({ behavior: "smooth" });
  }, [data, question, answer]);

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      return fetch(`${import.meta.env.VITE_API_URL}/api/chats/${data._id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-type": "application/json" },
        body: JSON.stringify({ question: question.length ? question : undefined, answer }),
      }).then(res => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', data._id] }).then(() => {
        formRef.current.reset();
        setQuestion("");
        setAnswer("");
      });
    },
    onError: (err) => console.log(err),
  });

  // ✅ Fixed handleRagQuery to dynamically update answer
  const handleRagQuery = async (text) => {
    try {
      console.log('Sending RAG query:', text);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/rag-query`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: text }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Received RAG response:', data);
      
      if (!data.answer) {
        throw new Error('No answer received from RAG');
      }

      setAnswer(data.answer);  // ✅ Only setting the answer
      console.log('Updated state for RAG:', data.answer);  // ✅ Only logging the answer

    } catch (error) {
      console.error('RAG query error:', error);
      setAnswer('Error processing your query: ' + error.message);
    }
};


  // ✅ Restored old streaming behavior in add()
  const add = async (text, isInitial) => {
    if (!isInitial) setQuestion(text);
    console.log(`Selected Model: ${selectedModel}`);
    
    setAnswer(""); 
    setIsThinking(true);

    try {
      if (selectedModel === "rag") {
        await handleRagQuery(text);
      } else {
        console.log(`Sending request to ${selectedModel} with text: "${text}"`);

        let accumulatedText = "";

        switch (selectedModel) {
         
          case "llama":
            accumulatedText = await queryLlama(text);
            break;
          case "mistral":
            accumulatedText = await queryMistral(text);
            break;
          default:
            if (!chat) throw new Error("Gemini chat model is not initialized properly.");
            const result = await chat.sendMessageStream(text);
            for await (const chunk of result.stream) {
              accumulatedText += chunk.text();
              setAnswer(accumulatedText); // ✅ Dynamically update answer like old code
            }
        }

        setAnswer(accumulatedText);
      }
    } catch (error) {
      console.error(`Error while querying ${selectedModel}:`, error);
      setAnswer('❌ Error processing your request. Please check the console for details.');
    } finally {
      setIsThinking(false);
      setTimeout(() => mutation.mutate(), 500);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = e.target.text.value;
    if (!text) return;
    add(text, false);
  };

  const hasRun = useRef(false);
  useEffect(() => {
    if (!hasRun.current) {
      if (data?.history?.length === 1) {
        add(data.history[0].parts[0].text, true);
      }
    }
    hasRun.current = true;
  }, []);

  return (
    <>
      <div className="endChat" ref={endRef}></div>

      <div className="newForm-container">
        <form className="newForm" onSubmit={handleSubmit} ref={formRef}>
          {/* Model Selector Dropdown (Now includes RAG) */}
          <select className="model-selector" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
            <option value="gemini">Gemini</option>
            <option value="llama">LLaMA</option>
            <option value="mistral">Mistral</option>
            <option value="rag">RAG Model</option>
          </select>

          <label htmlFor="file">
            <img src="/attachment.png" alt="" />
          </label>
          <input id="file" type="file" multiple={false} hidden />
          <input type="text" name="text" placeholder="Ask anything..." />
          <button>
            <img src="/arrow.png" alt="" />
          </button>
        </form>
      </div>

      {question && (
        <div className="message user">
          <Markdown>{question}</Markdown>
        </div>
      )}

      {isThinking && (
        <div className="message">
          <Markdown>🤔 Thinking...</Markdown>
        </div>
      )}

      {answer && !isThinking && (
        <div className="message">
          <Markdown>{answer}</Markdown>
        </div>
      )}
    </>
  );
};

export default NewPrompt;
