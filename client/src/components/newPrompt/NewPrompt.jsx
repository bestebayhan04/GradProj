import './newPrompt.css'; 
import { useEffect, useRef, useState } from 'react';
import model from "../../lib/gemini";
import Markdown from "react-markdown";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import eventEmitter from '../../lib/eventEmitter'; // Import event emitter

const NewPrompt = ({ data }) => {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini");
  const [isThinking, setIsThinking] = useState(false);
  const [sources, setSources] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(""); // Store selected course

  const endRef = useRef(null);
  const formRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleCourseChange = (course) => {
      console.log("🟢 Received course change in NewPrompt:", course); // ✅ Debugging
      setSelectedCourse(course);
    };
  
    eventEmitter.subscribe("courseChanged", handleCourseChange);
  
    return () => {
      eventEmitter.unsubscribe("courseChanged", handleCourseChange);
    };
  }, []);
  

  useEffect(() => {
    endRef.current.scrollIntoView({ behavior: "smooth" });
  }, [data, question, answer]);

  const mutation = useMutation({
    mutationFn: async () => {
      return fetch(`${import.meta.env.VITE_API_URL}/api/chats/${data._id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-type": "application/json" },
        body: JSON.stringify({ 
          question: question.length ? question : undefined, 
          answer,
          course: selectedCourse // ✅ Send selected course
        }),
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

  // ✅ Modify handleRagQuery to include selectedCourse
  const handleRagQuery = async (text) => {
    try {
      console.log('Sending RAG query:', text);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/rag-query`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: text, course: selectedCourse }), // ✅ Send selected course
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Received RAG response:', data);

      if (!data.answer) {
        throw new Error('No answer received from RAG');
      }

      setAnswer(data.answer);
    } catch (error) {
      console.error('RAG query error:', error);
      setAnswer('Error processing your query: ' + error.message);
    }
  };

  const add = async (text, isInitial) => {
    if (!isInitial) setQuestion(text);
    
    setAnswer(""); 
    setIsThinking(true);

    try {
      if (selectedModel === "rag") {
        await handleRagQuery(text);
      } else {
        let accumulatedText = "";

        if (selectedModel === "gemini") {
          let chat = model.startChat({
            history: [
              { role: "user", parts: [{ text: text }] },
              { role: "model", parts: [{ text: "Processing..." }] },
            ],
          });

          const result = await chat.sendMessageStream(text);
          for await (const chunk of result.stream) {
            accumulatedText += chunk.text();
            setAnswer(accumulatedText);
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
  
    // 🚀 Instead of making an API request, just log the payload
    console.log("Testing JSON Payload:", JSON.stringify({
      query: text,
      course: selectedCourse, // Ensure course is included
    }, null, 2));
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

      {/* Show selected course */}
      {/*selectedCourse && <p className="selected-course">Current Course: {selectedCourse}</p> */}

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
