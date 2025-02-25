import { useState } from "react";
import "./adminPage.css";

const AdminPage = () => {
  const [activeTab, setActiveTab] = useState("docs");
  const [documents, setDocuments] = useState([]);
  const [videoLinks, setVideoLinks] = useState([]);
  const [newLink, setNewLink] = useState("");

  const handleFileUpload = (event) => {
    const files = event.target.files;
    if (files.length > 0) {
      setDocuments([...documents, ...files]);
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
            <ul>
              {documents.map((doc, index) => (
                <li key={index}>{doc.name}</li>
              ))}
            </ul>
            <input type="file" multiple accept=".pdf,.pptx,.docx" onChange={handleFileUpload} />
          </div>
        )}

        {activeTab === "videos" && (
          <div className="videosSection">
            <h2>Video Links</h2>
            <ul>
              {videoLinks.map((link, index) => (
                <li key={index}>{link}</li>
              ))}
            </ul>
            <div className="inputContainer">
              <input 
                type="text" 
                placeholder="Enter video link" 
                value={newLink} 
                onChange={(e) => setNewLink(e.target.value)} 
              />
              <button onClick={handleAddVideoLink}>Add</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPage;
