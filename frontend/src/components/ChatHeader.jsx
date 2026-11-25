import { useState } from "react";
import { Brain, X } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import MemoryPanel from "./MemoryPanel";

const ChatHeader = () => {
  const { selectedUser, setSelectedUser } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);

  return (
    <div className="p-2.5 border-b border-base-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="avatar">
            <div className="size-10 rounded-full relative">
              <img src={selectedUser.profilePic || "/avatar.png"} alt={selectedUser.fullName} />
            </div>
          </div>

          {/* User info */}
          <div>
            <h3 className="font-medium">{selectedUser.fullName}</h3>
            <p className="text-sm text-base-content/70">
              {selectedUser.isBot
                ? "AI assistant · always online"
                : onlineUsers.includes(selectedUser._id) ? "Online" : "Offline"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedUser.isBot && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsMemoryOpen(true)}>
              <Brain className="size-4" aria-hidden="true" />
              Memory
            </button>
          )}
          {/* Close button */}
          <button onClick={() => setSelectedUser(null)} aria-label="Close chat">
            <X />
          </button>
        </div>
      </div>
      {isMemoryOpen && <MemoryPanel onClose={() => setIsMemoryOpen(false)} />}
    </div>
  );
};
export default ChatHeader;