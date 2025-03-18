import { useState, useEffect } from "react";
import { Link } from "react-router-dom"; // Import Link
import "./adminPage.css";

const AdminPage = () => {
  const [activeTab, setActiveTab] = useState("docs");
  const [documents, setDocuments] = useState([]);
  const [videoLinks, setVideoLinks] = useState([]);

  const [courses, setCourses] = useState([]); // Store courses
  const [selectedCourse, setSelectedCourse] = useState("All"); // Default to "All"

  const [newLink, setNewLink] = useState("");
  const [duplicateFiles, setDuplicateFiles] = useState([]); // Store duplicate files

  // Fetch available courses when the page loads
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const response = await fetch("http://localhost:5137/api/courses");
        if (response.ok) {
          const result = await response.json();
          
          console.log("Fetched Courses:", result); // Debugging log

          setCourses(result); // Store course list
        } else {
          console.error("Failed to fetch courses");
        }
      } catch (error) {
        console.error("Error fetching courses:", error);
      }
    };
  
    fetchCourses();
  }, []);

  // Fetch documents based on selected course
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const endpoint =
          selectedCourse === "All"
            ? "http://localhost:5137/api/filess" // Fetch all files
            : `http://localhost:5137/api/courses/${selectedCourse}/files`; // Fetch files by course

        console.log("📌 Fetching documents from:", endpoint); // ✅ Debugging

        const response = await fetch(endpoint);
        if (response.ok) {
          const result = await response.json();
          console.log("📌 Received Files:", result); // ✅ Debugging
          setDocuments(result); // Store fetched documents
        } else {
          console.error("❌ Failed to fetch files");
        }
      } catch (error) {
        console.error("❌ Error fetching files:", error);
      }
    };

    fetchDocuments();
}, [selectedCourse]);


  // Fetch video links
  useEffect(() => {
    const fetchVideoLinks = async () => {
        try {
            const endpoint =
                selectedCourse === "All"
                    ? "http://localhost:5137/api/video-links" // Fetch all video links
                    : `http://localhost:5137/api/courses/${selectedCourse}/video-links`; // Fetch video links by course

            const response = await fetch(endpoint);
            if (response.ok) {
                const result = await response.json();
                setVideoLinks(result);
            } else {
                console.error("Failed to fetch video links");
            }
        } catch (error) {
            console.error("Error fetching video links:", error);
        }
    };

    fetchVideoLinks();
}, [selectedCourse]);

  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (files.length > 0) {
      setDuplicateFiles([]);

      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }

      try {
        const uploadEndpoint =
          selectedCourse === "All"
            ? "http://localhost:5137/api/upload/general" // 🔹 Default course
            : `http://localhost:5137/api/upload/${selectedCourse}`; // 🔹 Upload to specific course

        const response = await fetch(uploadEndpoint, {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          const result = await response.json();
          setDocuments((prevDocs) => [...prevDocs, ...result.files]);

          if (result.duplicates.length > 0) {
            setDuplicateFiles(result.duplicates);
          }

          console.log("File uploaded:", result.files);
        } else {
          console.error("File upload failed");
        }
      } catch (error) {
        console.error("Error uploading files:", error);
      }
    }
};

const handleAddVideoLink = async () => {
  if (newLink.trim() === "") return;

  try {
      const endpoint = `http://localhost:5137/api/courses/${selectedCourse}/video-links`;

      const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ link: newLink }),
      });

      if (response.ok) {
        const result = await response.json();
        setVideoLinks(prevLinks => [...prevLinks, { course: selectedCourse, link: newLink }]); // ✅ Add immediately
        setNewLink("");
      }
      else {
          console.error("Failed to add video link");
      }
  } catch (error) {
      console.error("Error adding video link:", error);
  }
};

const handlePopulateDatabase = async () => {
  try {
    console.log("🚀 Populating database...");

    const response = await fetch("http://localhost:5137/api/populate-database", {
      method: "POST",
    });

    if (response.ok) {
      const result = await response.json();
      console.log("✅ Database populated:", result.logs);
      alert("✅ Database populated successfully!");
    } else {
      console.error("❌ Failed to populate database.");
      alert("❌ Failed to populate database. Check the console.");
    }
  } catch (error) {
    console.error("❌ Error populating database:", error);
    alert("❌ Error populating database. Check the console.");
  }
};



  // **🔹 Handle File Removal**
  const handleRemoveVideoLink = async (link, course) => {
    try {
        const deleteEndpoint =
            course === "All"
                ? "http://localhost:5137/api/video-links/all" // 🔹 Delete from all courses
                : `http://localhost:5137/api/courses/${course}/video-links`; // 🔹 Delete from specific course

        const response = await fetch(deleteEndpoint, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ link }),
        });

        if (response.ok) {
            console.log(`✅ Deleted video link: ${link} from ${course}`);

            // ✅ Refetch video links for the selected course to get the latest list
            const fetchUpdatedLinks = await fetch(
                course === "All"
                    ? "http://localhost:5137/api/video-links" // Fetch all videos
                    : `http://localhost:5137/api/courses/${course}/video-links` // Fetch specific course videos
            );

            if (fetchUpdatedLinks.ok) {
                const updatedLinks = await fetchUpdatedLinks.json();
                setVideoLinks(updatedLinks); // ✅ Update state with the new list
            } else {
                console.error("❌ Failed to fetch updated video links");
            }
        } else {
            console.error("❌ Failed to delete video link");
        }
    } catch (error) {
        console.error("❌ Error deleting video link:", error);
    }
};

const handleRemoveFile = async (fileName) => {
  try {
    // 🔹 If "All" is selected, use the no-course delete endpoint
    const endpoint = selectedCourse === "All"
      ? `http://localhost:5137/api/files/${fileName}` // DELETE from any course
      : `http://localhost:5137/api/files/${selectedCourse}/${fileName}`; // DELETE from specific course

    const response = await fetch(endpoint, {
      method: "DELETE",
    });

    if (response.ok) {
      setDocuments((prevDocs) => prevDocs.filter((file) => file.name !== fileName));
      console.log(`✅ File deleted successfully: ${fileName}`);
    } else {
      console.error("❌ Failed to delete file");
    }
  } catch (error) {
    console.error("❌ Error deleting file:", error);
  }
};

  

  return (
    <div className="adminPage">
      {/* Main Content */}
      <div className="adminContent">
        <div className="tabNavigation" style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <button className={activeTab === "docs" ? "active" : ""} onClick={() => setActiveTab("docs")}>
            Docs
          </button>
          <button className={activeTab === "videos" ? "active" : ""} onClick={() => setActiveTab("videos")}>
            Video Links
          </button>

          {/* Course Selection Dropdown */}
          <select value={selectedCourse} onChange={(e) => setSelectedCourse(e.target.value)} className="courseDropdown">
            <option value="All">All Courses</option>
            {courses.map((course, index) => (
              <option key={index} value={course}>{course}</option>
            ))}
          </select>
          <div className="right-tab">
            <Link to="/dashboard" className="chat-button">Chat</Link>
          </div>
        </div>

        {activeTab === "docs" && (
          <div className="docsSection">
            <h2>Uploaded Documents ({selectedCourse === "All" ? "All Courses" : selectedCourse})</h2>
            {documents.length === 0 ? (
              <p className="no-files-message">No files available.</p>
            ) : (
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
            )}

            <div className="file-upload-container">
              {/* 🔹 Show Upload Button Only if a Specific Course is Selected */}
              {selectedCourse !== "All" && (
                <>
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
                </>
              )}
              
              {/* 🔹 Always Show File Count */}
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
            <h2>Video Links ({selectedCourse === "All" ? "All Courses" : selectedCourse})</h2>

            {/* Input Field for Adding Video Links (Only if a specific course is selected) */}
            {selectedCourse !== "All" && (
              <div className="inputContainer">
                <input 
                  type="text" 
                  placeholder="Enter video link" 
                  value={newLink} 
                  onChange={(e) => setNewLink(e.target.value)} 
                />
                <button onClick={handleAddVideoLink}>
                  Add
                </button>

              </div>
            )}

            {/* Display Existing Video Links */}
            {/* Display Existing Video Links */}
            <ul className="video-links-list">
              {videoLinks.length > 0 ? (
                videoLinks.map((video, index) => (
                  <li key={index} className="video-item">
                    <a href={video.link} target="_blank" rel="noopener noreferrer">
                      {video.link}
                    </a>

                    {/* 🔹 Show course names only if "All Courses" is selected */}
                    {selectedCourse === "All" && (
                      <span className="video-course">({video.courses})</span>
                    )}

                    <button
                      className="delete-video-btn"
                      onClick={() =>
                        handleRemoveVideoLink(video.link, selectedCourse === "All" ? "All" : selectedCourse)
                      }
                    >
                      ✖
                    </button>
                  </li>
                ))
              ) : (
                <p className="no-videos">No video links available.</p>
              )}
            </ul>
          



          </div>
        )}
      {/* 🔹 Populate Database Button */}
      <button className="populate-db-btn" onClick={handlePopulateDatabase}>
            Upload
      </button>


      </div>
      
    </div>
  );
};

export default AdminPage;
