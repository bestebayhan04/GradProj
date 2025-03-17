import './chatList.css';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from 'react';
import eventEmitter from '../../lib/eventEmitter'; // Adjust path as needed

const courses = ["CS 201", "CS 204", "CS 210", "CS 301", "CS 303"];

const ChatList = () => {
  const queryClient = useQueryClient();
  const [selectedCourse, setSelectedCourse] = useState("");

  const { isPending, error, data } = useQuery({
    queryKey: ['userChats'],
    queryFn: () =>
      fetch(`${import.meta.env.VITE_API_URL}/api/userchats`, {
        credentials: "include",
      }).then((res) => res.json()),
  });

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

  const handleCourseChange = (e) => {
    const course = e.target.value;
    setSelectedCourse(course);
    console.log("📢 Emitting course change:", course); // ✅ Debugging
    eventEmitter.emit("courseChanged", course);
  };
  

  return (
    <div className='chatList'>
      <span className="title">DASHBOARD</span>

      {/* Course Selection Dropdown */}
      <select 
        value={selectedCourse} 
        onChange={handleCourseChange} 
        className="courseSelect"
      >
        <option value="">Select Course</option>
        {courses.map((course) => (
          <option key={course} value={course}>{course}</option>
        ))}
      </select>

      {/* New Chat button */}
      <Link to="/dashboard" className="button">+New Chat</Link>

      {/* Admin Page button (Same style as New Chat) */}
      <Link to="/dashboard/admin" className="button">Admin Page</Link>

      <hr />
      <span className="title">RECENT CHATS</span>
      <div className='list'>
        {isPending
          ? "Loading..."
          : error
          ? "Something went wrong!"
          : data?.map((chat) => (
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
}

export default ChatList;
