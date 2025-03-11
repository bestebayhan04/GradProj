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
        const uploadPath = path.join(__dirname, "uploads"); // ✅ Save temporarily in "uploads/"
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); // ✅ Preserve the original filename
    }
});

const upload = multer({ storage: storage });


// File Upload Endpoint
// File Upload Endpoint (Updated)
app.post("/api/upload/:course", upload.array("files"), async (req, res) => {
    const { course } = req.params;

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
    }

    try {
        const courseDir = path.join(__dirname, "../data", course);

        // ✅ Ensure the course folder exists before moving files
        if (!fs.existsSync(courseDir)) {
            fs.mkdirSync(courseDir, { recursive: true });
        }

        const newFiles = [];
        const alreadyExists = [];

        for (const file of req.files) {
            const tempFilePath = path.join(__dirname, "uploads", file.originalname);
            const finalFilePath = path.join(courseDir, file.originalname);

            if (fs.existsSync(finalFilePath)) {
                alreadyExists.push(file.originalname); // ✅ File already exists
            } else {
                fs.renameSync(tempFilePath, finalFilePath); // ✅ Move from uploads → course folder
                newFiles.push({
                    name: file.originalname,
                    path: `data/${course}/${file.originalname}`,
                    course: course
                });
            }
        }

        res.status(200).json({
            message: alreadyExists.length > 0 ? "Some files already exist" : "Files uploaded successfully",
            files: newFiles,
            duplicates: alreadyExists
        });

    } catch (error) {
        console.error("❌ Error saving files:", error);
        res.status(500).json({ message: "Error saving files", error });
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
app.delete("/api/files/:fileName", async (req, res) => {
    const { fileName } = req.params;

    try {
        const dataDir = path.join(__dirname, "../data");

        // ✅ First, remove from MongoDB (if exists)
        const file = await File.findOne({ name: fileName });

        if (file) {
            await File.deleteOne({ name: fileName });
        }

        // ✅ Search for the file inside all course folders
        let fileDeleted = false;
        const courses = fs.readdirSync(dataDir).filter(course =>
            fs.statSync(path.join(dataDir, course)).isDirectory()
        );

        for (const course of courses) {
            const filePath = path.join(dataDir, course, fileName);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`✅ File deleted from ${course}: ${filePath}`);
                fileDeleted = true;
            }
        }

        if (!fileDeleted) {
            console.warn(`⚠️ File not found: ${fileName}`);
        }

        res.status(200).json({ message: fileDeleted ? "File deleted successfully" : "File not found" });

    } catch (error) {
        console.error("❌ Error deleting file:", error);
        res.status(500).json({ message: "Error deleting file", error });
    }
});

// **🔹 Delete File API**
app.delete("/api/files/:course/:fileName", async (req, res) => {
    const { course, fileName } = req.params;

    try {
        const filePath = path.join(__dirname, "../data", course, fileName);

        // ✅ Check if the file exists in MongoDB
        const file = await File.findOne({ name: fileName, course });

        if (file) {
            // ✅ Remove from MongoDB
            await File.deleteOne({ name: fileName, course });
        }

        // ✅ Remove from the filesystem
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`✅ File deleted: ${filePath}`);
        } else {
            console.warn(`⚠️ File not found: ${filePath}`);
        }

        res.status(200).json({ message: "File deleted successfully" });

    } catch (error) {
        console.error("❌ Error deleting file:", error);
        res.status(500).json({ message: "Error deleting file", error });
    }
});

app.get("/api/courses/:course/files", async (req, res) => {
    const { course } = req.params;
    try {
        const coursePath = path.join(__dirname, "../data", course);
        if (!fs.existsSync(coursePath)) {
            return res.status(404).json({ message: "Course not found" });
        }

        // Read files inside the selected course directory
        const files = fs.readdirSync(coursePath)
            .filter(file => file.endsWith(".pdf") || file.endsWith(".docx") || file.endsWith(".pptx") || file.endsWith(".txt"))
            .map(file => ({
                name: file,
                path: `data/${course}/${file}`
            }));

        res.status(200).json(files);
    } catch (error) {
        console.error("Error fetching files:", error);
        res.status(500).json({ message: "Error fetching files", error });
    }
});


  app.get("/api/courses", async (req, res) => {
    try {
        const courseDir = path.join(__dirname, "../data");

        if (!fs.existsSync(courseDir)) {
            return res.status(404).json({ message: "Data directory not found" });
        }

        // Define unwanted folders/files
        const excludedItems = ["videos.links", "GradProject.code-workspace"];

        // Get all course folders except excluded ones
        const courses = fs.readdirSync(courseDir)
            .filter(course => {
                const isDir = fs.statSync(path.join(courseDir, course)).isDirectory();
                const isExcluded = excludedItems.includes(course);
                
                if (isExcluded) console.warn("Skipping unwanted course:", course);
                
                return isDir && !isExcluded; // ✅ Only include valid course folders
            });

        console.log("Filtered Courses:", courses); // Debugging log

        res.status(200).json(courses); // Ensure response is an array
    } catch (error) {
        console.error("Error fetching courses:", error);
        res.status(500).json({ message: "Error fetching courses", error });
    }
});


app.get("/api/filess", async (req, res) => {
    try {
        const dataDir = path.join(__dirname, "../data");

        if (!fs.existsSync(dataDir)) {
            return res.status(404).json({ message: "Data directory not found" });
        }
        // Define unwanted items
        const excludedItems = ["videos.links", "GradProject.code-workspace", ".DS_Store"];

        const courses = fs.readdirSync(dataDir)
            .filter(course => fs.statSync(path.join(dataDir, course)).isDirectory() && !excludedItems.includes(course));

        let allFiles = [];

        courses.forEach(course => {
            const coursePath = path.join(dataDir, course);
            const files = fs.readdirSync(coursePath)
                .filter(file =>
                    fs.statSync(path.join(coursePath, file)).isFile() && // ✅ Ensure it's a file
                    file.match(/\.(pdf|docx|doc|pptx|txt)$/i) && // ✅ Only valid file types
                    !excludedItems.includes(file) // ✅ Exclude unwanted entries
                )
                .map(file => ({
                    name: file,
                    path: `data/${course}/${file}`,
                    course: course
                }));

            allFiles = allFiles.concat(files);
        });

        console.log("✅ Fetched All Valid Files:", allFiles); // Debugging log
        res.status(200).json(allFiles);
    } catch (error) {
        
        console.error("❌ Error fetching files:", error);
        res.status(500).json({ message: "Error fetching files", error });
    }
});



// API Endpoint to Fetch Video Links
app.get("/api/video-links", async (req, res) => {
    try {
        const dataDir = path.join(__dirname, "../data");
        const courses = fs.readdirSync(dataDir).filter(course =>
            fs.statSync(path.join(dataDir, course)).isDirectory()
        );

        let videoMap = new Map(); // Store videos with a list of courses

        courses.forEach(course => {
            const videoFilePath = path.join(dataDir, course, "videos.links");

            if (fs.existsSync(videoFilePath)) {
                const links = fs.readFileSync(videoFilePath, "utf-8").split("\n").filter(link => link.trim() !== "");
                
                links.forEach(link => {
                    if (videoMap.has(link)) {
                        videoMap.get(link).push(course); // Add course to existing video
                    } else {
                        videoMap.set(link, [course]); // Create new video entry
                    }
                });
            }
        });

        // Convert map to array
        let allVideoLinks = Array.from(videoMap.entries()).map(([link, courses]) => ({
            link,
            courses: courses.join(", ") // Join courses for display
        }));

        res.status(200).json(allVideoLinks);
    } catch (error) {
        console.error("❌ Error fetching video links:", error);
        res.status(500).json({ message: "Error fetching video links", error });
    }
});





app.get("/api/courses/:course/video-links", (req, res) => {
    const { course } = req.params;
    const videoFilePath = path.join(__dirname, "../data", course, "videos.links");

    // Check if file exists
    if (!fs.existsSync(videoFilePath)) {
        return res.status(404).json({ message: "No video links found for this course" });
    }

    // Read and return video links as objects (consistent structure)
    fs.readFile(videoFilePath, "utf8", (err, data) => {
        if (err) {
            return res.status(500).json({ message: "Error reading video links", error: err });
        }

        const links = data
            .split("\n")
            .filter((link) => link.trim() !== "")
            .map((link) => ({ course, link })); // Return as objects with `course` field

        res.status(200).json(links);
    });
});



  // **🔹 Add a New Video Link**
  app.post("/api/courses/:course/video-links", (req, res) => {
    const { course } = req.params;
    const { link } = req.body;
    const videoFilePath = path.join(__dirname, "../data", course, "videos.links");

    if (!link) {
        return res.status(400).json({ message: "Video link is required" });
    }

    try {
        // Ensure the directory and file exist
        if (!fs.existsSync(path.dirname(videoFilePath))) {
            fs.mkdirSync(path.dirname(videoFilePath), { recursive: true });
        }
        if (!fs.existsSync(videoFilePath)) {
            fs.writeFileSync(videoFilePath, "");
        }

        // Read existing links
        let existingLinks = fs.readFileSync(videoFilePath, "utf-8").split("\n").map(l => l.trim());

        if (existingLinks.includes(link)) {
            return res.status(400).json({ message: "Video link already exists" });
        }

        // Append new link to the file
        existingLinks.push(link);
        fs.writeFileSync(videoFilePath, existingLinks.join("\n"));

        // ✅ Return updated video list
        res.status(201).json({ message: "Video link added successfully", links: existingLinks.map(l => ({ course, link: l })) });

    } catch (error) {
        console.error("❌ Error adding video link:", error);
        res.status(500).json({ message: "Error adding video link", error });
    }
});

// **🔹 Delete a Video Link**
app.delete("/api/courses/:course/video-links", (req, res) => {
    const { course } = req.params;
    const { link } = req.body;
    const videoFilePath = path.join(__dirname, "../data", course, "videos.links");

    try {
        if (!fs.existsSync(videoFilePath)) {
            return res.status(404).json({ message: "No video links found for this course" });
        }

        let links = fs.readFileSync(videoFilePath, "utf-8").split("\n").map(l => l.trim());
        links = links.filter(l => l !== link); // Remove the specified link

        fs.writeFileSync(videoFilePath, links.join("\n"));

        res.status(200).json({ message: "Video link deleted successfully" });
    } catch (error) {
        console.error("❌ Error deleting video link:", error);
        res.status(500).json({ message: "Error deleting video link", error });
    }
});
app.delete("/api/video-links/all", (req, res) => {
    const { link } = req.body;
    const dataDir = path.join(__dirname, "../data");

    try {
        const courses = fs.readdirSync(dataDir).filter(course =>
            fs.statSync(path.join(dataDir, course)).isDirectory()
        );

        let deletedFromCourses = [];

        courses.forEach(course => {
            const videoFilePath = path.join(dataDir, course, "videos.links");

            if (fs.existsSync(videoFilePath)) {
                let links = fs.readFileSync(videoFilePath, "utf-8").split("\n").map(l => l.trim());

                if (links.includes(link)) {
                    links = links.filter(l => l !== link); // Remove the link
                    fs.writeFileSync(videoFilePath, links.join("\n").trim()); // Trim extra new lines
                    deletedFromCourses.push(course);
                }
            }
        });

        if (deletedFromCourses.length === 0) {
            return res.status(404).json({ message: "Video link not found in any course" });
        }

        res.status(200).json({ 
            message: "Video link deleted successfully from all courses", 
            deletedFrom: deletedFromCourses 
        });

    } catch (error) {
        console.error("❌ Error deleting video link from all courses:", error);
        res.status(500).json({ message: "Error deleting video link", error });
    }
});


app.get("/api/video-links", async (req, res) => {
    try {
        const dataDir = path.join(__dirname, "../data");
        const courses = fs.readdirSync(dataDir).filter(course =>
            fs.statSync(path.join(dataDir, course)).isDirectory()
        );

        let videoLinksMap = new Map();

        courses.forEach(course => {
            const videoFilePath = path.join(dataDir, course, "videos.links");

            if (fs.existsSync(videoFilePath)) {
                const links = fs.readFileSync(videoFilePath, "utf-8").split("\n").map(l => l.trim());
                
                links.forEach(link => {
                    if (link) { // Avoid empty lines
                        if (!videoLinksMap.has(link)) {
                            videoLinksMap.set(link, []);
                        }
                        videoLinksMap.get(link).push(course);
                    }
                });
            }
        });

        // Convert Map to Array
        const allVideoLinks = Array.from(videoLinksMap.entries()).map(([link, courses]) => ({
            link,
            courses, // Always an array
        }));

        res.status(200).json(allVideoLinks);
    } catch (error) {
        console.error("❌ Error fetching video links:", error);
        res.status(500).json({ message: "Error fetching video links", error });
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
