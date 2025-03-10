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
import multer from "multer";
import fs from "fs";


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

app.use('/data', express.static(path.join(__dirname, '../data')));

const connect = async ()=>{
    try {
        await mongoose.connect(process.env.MONGO)
        console.log("Connected to MongoDB")
    } catch (err) {
        console.log(err)
    }
}
// **🔹 Define File Schema and Model inside index.js**
const fileSchema = new mongoose.Schema({
    name: String,
    path: String,
    uploadedAt: { type: Date, default: Date.now },
  });
  
  const File = mongoose.model("File", fileSchema);
  

// Define the storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, "../data"); 
        fs.mkdirSync(uploadPath, { recursive: true }); // Ensure the folder exists
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); // Preserve original filename
    },
});

const upload = multer({ storage });

// File Upload Endpoint
// File Upload Endpoint (Updated)
app.post("/api/upload", upload.array("files"), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
    }

    try {
        // Fetch existing file names from the database
        const existingFiles = await File.find({}, "name");
        const existingFileNames = new Set(existingFiles.map(file => file.name));

        const newFiles = [];
        const alreadyExists = [];

        for (const file of req.files) {
            if (existingFileNames.has(file.originalname)) {
                alreadyExists.push(file.originalname); // Store duplicate file names
            } else {
                newFiles.push({
                    name: file.originalname,
                    path: `data/${file.originalname}`,
                });
            }
        }

        if (newFiles.length > 0) {
            await File.insertMany(newFiles); // Save only new files in MongoDB
        }

        res.status(200).json({
            message: alreadyExists.length > 0 ? "Some files already exist" : "Files uploaded successfully",
            files: newFiles,
            duplicates: alreadyExists,
        });
    } catch (error) {
        res.status(500).json({ message: "Error saving files", error });
    }
});





// **🔹 Fetch All Files from the Database**
app.get("/api/files", async (req, res) => {
    try {
        // Fetch files stored in MongoDB
        const dbFiles = await File.find({});

        // Fetch files from the data folder
        const dataFolderPath = path.join(__dirname, "../data");

        // Read files from the folder
        const folderFiles = fs.readdirSync(dataFolderPath).map((file) => ({
            name: file,
            path: `data/${file}`, // Adjust path if needed
        }));

        // Combine both lists, avoiding duplicates
        const combinedFiles = [...dbFiles, ...folderFiles.filter(file => !dbFiles.some(dbFile => dbFile.name === file.name))];

        res.status(200).json(combinedFiles);
    } catch (error) {
        res.status(500).json({ message: "Error fetching files", error });
    }
});



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

// **🔹 Delete File API**
app.delete("/api/files/:fileName", async (req, res) => {
    const { fileName } = req.params;

    try {
        // Check if file exists in the database
        const file = await File.findOne({ name: fileName });

        if (!file) {
            return res.status(404).json({ message: "File not found" });
        }

        // Remove the file from MongoDB
        await File.deleteOne({ name: fileName });

        // Remove the file from the data folder
        const filePath = path.join(__dirname, "../", file.path);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.status(200).json({ message: "File deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error deleting file", error });
    }
});

// API Endpoint to Fetch Video Links
app.get("/api/video-links", (req, res) => {
    const videoFilePath = path.join(__dirname, "../data/videos.links");
  
    // Check if file exists
    if (!fs.existsSync(videoFilePath)) {
      return res.status(404).json({ message: "No video links found" });
    }
  
    // Read and return video links
    fs.readFile(videoFilePath, "utf8", (err, data) => {
      if (err) {
        return res.status(500).json({ message: "Error reading video links", error: err });
      }
  
      const links = data.split("\n").filter((link) => link.trim() !== ""); // Remove empty lines
      res.status(200).json(links);
    });
  });

  // **🔹 Add a New Video Link**
app.post("/api/video-links", (req, res) => {
    const { link } = req.body;
    const videoLinksFilePath = path.join(__dirname, "../data/videos.links");


    if (!link) {
        return res.status(400).json({ message: "Video link is required" });
    }

    try {
        // Ensure the file exists before appending
        if (!fs.existsSync(videoLinksFilePath)) {
            fs.writeFileSync(videoLinksFilePath, "");
        }

        // Read existing links
        const existingLinks = fs.readFileSync(videoLinksFilePath, "utf-8").split("\n").map(l => l.trim());

        if (existingLinks.includes(link)) {
            return res.status(400).json({ message: "Video link already exists" });
        }

        // Append new link to the file
        fs.appendFileSync(videoLinksFilePath, link + "\n");
        
        res.status(201).json({ message: "Video link added successfully" });
    } catch (error) {
        console.error("Error adding video link:", error);
        res.status(500).json({ message: "Error adding video link", error });
    }
});

// **🔹 Delete a Video Link**
app.delete("/api/video-links", (req, res) => {
    const { link } = req.body;
    const videoLinksFilePath = path.join(__dirname, "../data/videos.links");


    try {
        if (!fs.existsSync(videoLinksFilePath)) {
            return res.status(404).json({ message: "No video links found" });
        }

        let links = fs.readFileSync(videoLinksFilePath, "utf-8").split("\n").map(l => l.trim());
        links = links.filter(l => l !== link); // Remove the specified link

        fs.writeFileSync(videoLinksFilePath, links.join("\n"));

        res.status(200).json({ message: "Video link deleted successfully" });
    } catch (error) {
        console.error("Error deleting video link:", error);
        res.status(500).json({ message: "Error deleting video link", error });
    }
});



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
