import './chatList.css';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const ChatList = () => {
  const queryClient = useQueryClient();

  const { isPending, error, data } = useQuery({
    queryKey: ['userChats'],
    queryFn: () =>
      fetch(`${import.meta.env.VITE_API_URL}/api/userchats`, {
        credentials: "include",
      }).then((res) => res.json()),
  });

  // ✅ Delete chat mutation
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

  return (
    <div className='chatList'>
      <span className="title">DASHBOARD</span>
      <Link to="/dashboard">+New Chat</Link>
      <Link to="/">Explore SU AI</Link>
      <Link to="/">Report Issue</Link>
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
