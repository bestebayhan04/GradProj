import { useState, useEffect } from "react";
import "./adminPage.css";

const AdminPage = () => {
  const [activeTab, setActiveTab] = useState("docs");
  const [documents, setDocuments] = useState([]);
  const [videoLinks, setVideoLinks] = useState([]);
  const [newLink, setNewLink] = useState("");
  const [duplicateFiles, setDuplicateFiles] = useState([]); // Store duplicate files

  // Fetch all documents from the database when component mounts
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const response = await fetch("http://localhost:5137/api/files");
        if (response.ok) {
          const result = await response.json();
          // Filter only supported file formats
          const filteredFiles = result.filter((file) => {
          return (
            file.name.endsWith(".docx") ||
            file.name.endsWith(".pdf") ||
            file.name.endsWith(".pptx") ||
            file.name.endsWith(".txt")
          );
        });
          setDocuments(filteredFiles); // Store all files from database
        } else {
          console.error("Failed to fetch files");
        }
      } catch (error) {
        console.error("Error fetching files:", error);
      }
    };

    fetchDocuments();

    const fetchVideoLinks = async () => {
      try {
        const response = await fetch("http://localhost:5137/api/video-links");
        if (response.ok) {
          const result = await response.json();
          setVideoLinks(result); // Store video links from the backend
        } else {
          console.error("Failed to fetch video links");
        }
      } catch (error) {
        console.error("Error fetching video links:", error);
      }
    };
  
    fetchVideoLinks();
  }, []);

  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (files.length > 0) {
      setDuplicateFiles([]); // Reset previous warnings

      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }

      try {
        const response = await fetch("http://localhost:5137/api/upload", {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          const result = await response.json();

          // Store uploaded files along with existing ones
          const uploadedFiles = result.files.map((file) => ({
            name: file.name,
            path: file.path,
          }));

          setDocuments((prevDocs) => [...prevDocs, ...uploadedFiles]); // Update UI correctly

          if (result.duplicates.length > 0) {
            setDuplicateFiles(result.duplicates); // Show duplicate files in UI
          }

          console.log("File is uploaded:", result.files);
        } else {
          console.error("File upload failed");
        }
      } catch (error) {
        console.error("Error uploading files:", error);
      }
    }
  };

  // **🔹 Handle File Removal**
  const handleRemoveFile = async (fileName) => {
    try {
        const response = await fetch(`http://localhost:5137/api/files/${fileName}`, {
            method: "DELETE",
        });

        if (response.ok) {
            // ✅ Remove file from state after successful deletion
            setDocuments((prevDocs) => prevDocs.filter((file) => file.name !== fileName));
            console.log(`File ${fileName} deleted successfully`);
        } else {
            console.error("Failed to delete file");
        }
    } catch (error) {
        console.error("Error deleting file:", error);
    }
};


  const handleAddVideoLink = () => {
    if (newLink) {
      setVideoLinks([...videoLinks, newLink]);
      setNewLink("");
    }
  };

  return (
    <div className="adminPage">
      {/* Main Content */}
      <div className="adminContent">
        <div className="tabNavigation" style={{ display: "flex", justifyContent: "center", gap: "20px" }}>
          <button
            className={activeTab === "docs" ? "active" : ""}
            onClick={() => setActiveTab("docs")}
          >
            Docs
          </button>
          <button
            className={activeTab === "videos" ? "active" : ""}
            onClick={() => setActiveTab("videos")}
          >
            Video Links
          </button>
        </div>

        {activeTab === "docs" && (
          <div className="docsSection">
            <h2>Uploaded Documents</h2>
            <ul className="file-list">
              {documents.map((doc, index) => (
                <li key={index} className="file-item">
                  <a href={`http://localhost:5137/${doc.path}`} target="_blank" rel="noopener noreferrer">
                    {doc.name}
                  </a>
                  <button className="view-file-btn" onClick={() => window.open(`http://localhost:5137/${doc.path}`, "_blank")}>
                    View
                  </button>
                  <button className="remove-file-btn" onClick={() => handleRemoveFile(doc.name)}>✖</button>
                </li>
              ))}
            </ul>


            <div className="file-upload-container">
              <input
                type="file"
                id="fileUpload"
                multiple
                accept=".pdf,.pptx,.docx"
                onChange={handleFileUpload}
                className="hidden-input"
              />
              <label htmlFor="fileUpload" className="custom-file-button">
                📂 Choose Files
              </label>
              {documents.length > 0 && (
                <span className="file-name">{documents.length} files uploaded</span>
              )}
            </div>

            {/* Warning Message if Duplicate Files Exist */}
            {duplicateFiles.length > 0 && (
              <div className="warning-message">
                <span className="warning-icon">⚠️</span>
                <div>
                  The following files already exist:
                  <ul>
                    {duplicateFiles.map((file, index) => (
                      <li key={index}>{file}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "videos" && (
          <div className="videosSection">
            <h2>Video Links</h2>

            {/* Input Field for Adding Video Links */}
            <div className="inputContainer">
              <input
                type="text"
                placeholder="Enter video link"
                value={newLink}
                onChange={(e) => setNewLink(e.target.value)}
              />
              <button onClick={async () => {
                if (newLink.trim() === "") return;
                
                try {
                  const response = await fetch("http://localhost:5137/api/video-links", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ link: newLink }),
                  });

                  if (response.ok) {
                    setVideoLinks((prevLinks) => [...prevLinks, newLink]); // Add to UI
                    setNewLink(""); // Clear input
                  } else {
                    console.error("Failed to add video link");
                  }
                } catch (error) {
                  console.error("Error adding video link:", error);
                }
              }}>Add</button>
            </div>

            {/* Display Existing Video Links BELOW the Input Box */}
            <ul className="video-links-list">
              {videoLinks.length > 0 ? (
                videoLinks.map((link, index) => (
                  <li key={index} className="video-item">
                    <a href={link} target="_blank" rel="noopener noreferrer">{link}</a>
                    <button className="delete-video-btn" onClick={async () => {
                      try {
                        const response = await fetch("http://localhost:5137/api/video-links", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ link }),
                        });

                        if (response.ok) {
                          setVideoLinks((prevLinks) => prevLinks.filter((l) => l !== link)); // Remove from UI
                        } else {
                          console.error("Failed to delete video link");
                        }
                      } catch (error) {
                        console.error("Error deleting video link:", error);
                      }
                    }}>✖</button>
                  </li>
                ))
              ) : (
                <p className="no-videos">No video links available.</p>
              )}
            </ul>
          </div>
        )}


      </div>
    </div>
  );
};

export default AdminPage;
