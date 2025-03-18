import './chatList.css';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from 'react';
import eventEmitter from '../../lib/eventEmitter'; // Adjust path as needed

const ChatList = () => {
  const queryClient = useQueryClient();
  const [selectedCourse, setSelectedCourse] = useState("");

  // Fetch available courses
  const { data: courses, isLoading: coursesLoading, error: coursesError } = useQuery({
    queryKey: ['courses'],
    queryFn: () =>
      fetch("http://localhost:5137/api/courses", {
        credentials: "include",
      }).then((res) => res.json()),
  });

  // Fetch user chats
  const { isPending, error: error, data: userChats } = useQuery({
    queryKey: ['userChats'],
    queryFn: () =>
      fetch(`${import.meta.env.VITE_API_URL}/api/userchats`, {
        credentials: "include",
      }).then((res) => res.json()),
  });


  // Handle chat deletion
  const deleteChatMutation = useMutation({
    mutationFn: async (chatId) => {
      return fetch(`${import.meta.env.VITE_API_URL}/api/chats/${chatId}`, {
        method: "DELETE",
        credentials: "include",
      }).then((res) => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userChats'] });
    },
    onError: (err) => {
      console.error("Error deleting chat:", err);
    },
  });

  // 🔹 When user picks a course from dropdown
  const handleCourseChange = (e) => {
    const course = e.target.value;
    setSelectedCourse(course);
    console.log("📢 Emitting course change:", course); // ✅ Debugging
    eventEmitter.emit("courseChanged", course);
  };


  return (
    <div className='chatList'>
      <span className="title">DASHBOARD</span>

      {/* 🔹 Course Selection Dropdown */}
      <select 
        value={selectedCourse} 
        onChange={handleCourseChange} 
        className="courseSelect"
        disabled={coursesLoading || coursesError}
      >
        <option value="">Select Course</option>
        {coursesLoading && <option>Loading courses...</option>}
        {coursesError && <option>Error loading courses</option>}
        {courses && courses.map((course, index) => (
          <option key={index} value={course}>{course}</option>
        ))}
      </select>

      {/* 🔹 New Chat & Admin Page buttons */}
      <Link to="/dashboard" className="button">+New Chat</Link>
      <Link to="/dashboard/admin" className="button">Admin Page</Link>

      <hr />
      <span className="title">RECENT CHATS</span>
      <div className='list'>
        {isPending
          ? "Loading..."
          : error
          ? "Something went wrong!"
          : userChats?.map((chat) => (
            <div key={chat._id} className="chatItem">
              <Link to={`/dashboard/chats/${chat._id}`} className="chatLink">
                {chat.title}
              </Link>
              <button 
                className="deleteChatBtn" 
                onClick={() => deleteChatMutation.mutate(chat._id)}
                title="Delete Chat"
              >
                ×
              </button>
            </div>
          ))}
      </div>
      <hr />
    </div>
  );
};

export default ChatList;
