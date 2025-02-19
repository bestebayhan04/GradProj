import dotenv from "dotenv";
import express from "express"
import mongoose from "mongoose";
import cors from "cors";
import Chat from "./models/chat.js";
import UserChats from "./models/userChats.js";
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node'
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const port = process.env.PORT || 5137;
const app = express();

// Add these lines to get the current directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(
    cors({
        origin: process.env.CLIENT_URL,
        credentials: true,
    })
);

app.use(express.json())
const connect = async ()=>{
    try {
        await mongoose.connect(process.env.MONGO)
        console.log("Connected to MongoDB")
    } catch (err) {
        console.log(err)
    }
}

//app.get("/api/test", ClerkExpressRequireAuth(), (req, res) => {
    //const userId= req.auth.userId;
   // console.log(userId)
   // res.send("Success");
  //});
  

app.post("/api/chats", ClerkExpressRequireAuth(),async (req, res) => {
    const userId = req.auth.userId;
    const { text } = req.body;

    try {
        // creating a new chat
        const newChat = new Chat({
            userId: userId,
            history: [{ role: "user", parts: [{ text }] }],
        });
        
        const savedChat = await newChat.save();
        //check if exist
        const userChats = await UserChats.find({ userId: userId });
        //if not create new one
        if(!userChats.length){
            const newUserChats = new UserChats({
                userId:userId,
                chats:[
                    {
                        _id:savedChat._id,
                        title: text.substring(0,40),
                    },
                ],
            });

            await newUserChats.save()
        }else{
            await UserChats.updateOne({userId:userId}, {
                $push:{
                    chats:{
                        _id:savedChat._id,
                        title: text.substring(0,40),
                    },
                },

            });

            res.status(201).send(newChat._id);
        }
    } catch (err) {
        console.log(err);
        res.status(500).send("Error creating chat!");
    }
});

app.get("/api/userchats", ClerkExpressRequireAuth(), async (req, res) => {
    const userId = req.auth.userId;
  
    try {
      const userChats = await UserChats.find({ userId });

      res.status(200).send(userChats[0].chats);
    } catch (err) {
      console.log(err);
      res.status(500).send("Error fetching userchats!");
    }
  });


  app.get("/api/chats/:id", ClerkExpressRequireAuth(), async (req, res) => {
    const userId = req.auth.userId;
  
    try {
      // Convert the string ID to a valid MongoDB ObjectId
      const chatId = new mongoose.Types.ObjectId(req.params.id);
  
      const chat = await Chat.findOne({ 
        _id: chatId, 
        userId: userId 
      });
  
      if (!chat) {
        return res.status(404).send("Chat not found");
      }
  
      res.status(200).send(chat);
    } catch (err) {
      console.log(err);
      
      // More specific error handling
      if (err instanceof mongoose.Error.CastError) {
        return res.status(400).send("Invalid chat ID");
      }
      
      res.status(500).send("Error fetching chat!");
    }
  });
  
app.put("/api/chats/:id", ClerkExpressRequireAuth(), async (req,res)=> {
    const userId = req.auth.userId;

    const { question, answer } = req.body;

    const newItems = [
        ...(question
        ? [{role: "user", parts: [{text:question}]}]
        : []),
        {role: "model", parts: [{text:answer}]},
    ];
    try {
        const updateChat = await Chat.updateOne({ _id: req.params.id, userId }, {
            $push:{
                history:{
                    $each: newItems,
                },
            },
        });
        res.status(200).send(updateChat);
    } catch (error) {
        console.log(err);
        res.status(500).send("Error adding conversation!");
    }
})

app.delete("/api/chats/:id", ClerkExpressRequireAuth(), async (req, res) => {
    const userId = req.auth.userId; // Ensure only the chat owner can delete it
    const chatId = req.params.id;

    try {
        // Delete the chat from the Chat collection
        const deletedChat = await Chat.findOneAndDelete({ _id: chatId, userId });

        if (!deletedChat) {
            return res.status(404).json({ message: "Chat not found or unauthorized" });
        }

        // Also remove the chat from UserChats collection
        await UserChats.updateOne(
            { userId: userId },
            { $pull: { chats: { _id: chatId } } }
        );

        res.status(200).json({ message: "Chat deleted successfully" });
    } catch (err) {
        console.error("Error deleting chat:", err);
        res.status(500).json({ message: "Error deleting chat" });
    }
});

  
app.use((err, req, res, next) => {
    console.error(err.stack)
    res.status(401).send('Unauthenticated!')
  })

app.post("/api/rag-query", ClerkExpressRequireAuth(), async (req, res) => {
    const { query } = req.body;
    console.log('Received RAG query:', query);

    try {
        const baseDir = path.resolve(__dirname, '..');
        const pythonPath = path.join(baseDir, 'new_one', 'bin', 'python');
        const queryDataPath = path.join(baseDir, 'query_data.py');
        const chromaPath = path.join(baseDir, 'chroma');

        console.log('Executing Python script:', pythonPath, queryDataPath);
        
        const pythonProcess = spawn(pythonPath, [queryDataPath, query], {
            env: { ...process.env, CHROMA_PATH: chromaPath },
            cwd: baseDir
        });
        let responseData = '';
        let errorData = '';

        pythonProcess.stdout.on('data', (data) => {
            console.log('Python stdout:', data.toString());
            responseData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error('Python stderr:', data.toString());
            errorData += data.toString();
        });

        pythonProcess.on('close', (code) => {
            console.log('Python process closed with code:', code);
            if (code !== 0) {
                console.error('Python process error:', errorData);
                return res.status(500).json({
                    error: 'Error processing RAG query',
                    details: errorData
                });
            }
            
            try {
                const responseMatch = responseData.match(/Response: ([\s\S]*?)\n Sources:/);
                const sourcesMatch = responseData.match(/Sources: \[(.*)\]/);

                // Replace single quotes with double quotes for JSON parsing
                const sourcesString = sourcesMatch ? `[${sourcesMatch[1]}]`.replace(/'/g, '"') : '[]';

                const response = {
                    answer: responseMatch ? responseMatch[1].trim() : responseData,
                    sources: JSON.parse(sourcesString)
                };
                
                console.log('Sending response:', response);
                res.json(response);
            } catch (error) {
                console.error('Error parsing Python response:', error);
                res.status(500).json({
                    error: 'Error parsing Python response',
                    details: error.message,
                    rawResponse: responseData
                });
            }
        });

        pythonProcess.on('error', (error) => {
            console.error('Failed to start Python process:', error);
            res.status(500).json({
                error: 'Failed to start Python process',
                details: error.message
            });
        });
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({
            error: 'Error processing RAG query',
            details: err.message
        });
    }
});

app.listen(port, () =>  {
    connect()
    console.log("Server running on 5173");
});
