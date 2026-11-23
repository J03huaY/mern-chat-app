import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";
import { Socket } from "socket.io-client";

export const useChatStore = create((set, get) => ({
    messages:[],
    users:[],
    selectedUser: null,
    isUsersLoading: false,
    isMessagesLoading: false,
    // The AI assistant's reply while it is still streaming: { replyId, text }
    aiReply: null,


    getUsers: async () => {
        set({ isUsersLoading: true});
        try {
            const res = await axiosInstance.get("/messages/users");
            set({ users: res.data });
        } catch (error) {
            toast.error(error.response.data.message);
        } finally {
            set({ isUsersLoading: false });
        }
    },

    getMessages: async(userId) => {
        set({ isMessagesLoading: true});
        try {
            const res = await axiosInstance.get(`/messages/${userId}`);
            set({ messages: res.data });
        } catch (error) {
            toast.error(error.response.data.message);

        } finally {
            set({ isMessagesLoading: false });
        }
    },

    sendMessage: async (messageData) => {
        const {selectedUser, messages} = get();
        try {
            const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData);
            set({messages:[...messages, res.data]})
        } catch (error) {
            toast.error(error.response.data.message);
        }
    },

    subscribeToMessages: () => {
        const { selectedUser }= get();
        if(!selectedUser) return;

        const socket = useAuthStore.getState().socket;

        
        socket.on("newMessage", (newMessage) => {
            const isMessageSentFromSelectedUser = newMessage.senderId === selectedUser._id;
            if (newMessage.senderId !== selectedUser._id) return;
            set({
                messages: [...get().messages, newMessage],
            })
        })

        if (!selectedUser.isBot) return;

        // Streaming reply from the AI assistant. The finished reply arrives as a
        // normal "newMessage" event just before "ai:done".
        socket.on("ai:start", ({ replyId }) => {
            set({ aiReply: { replyId, text: "" } });
        });
        socket.on("ai:delta", ({ replyId, text }) => {
            const current = get().aiReply;
            const soFar = current?.replyId === replyId ? current.text : "";
            set({ aiReply: { replyId, text: soFar + text } });
        });
        socket.on("ai:done", ({ replyId }) => {
            if (get().aiReply?.replyId === replyId) set({ aiReply: null });
        });
        socket.on("ai:error", ({ replyId, message }) => {
            if (get().aiReply?.replyId === replyId) set({ aiReply: null });
            toast.error(message);
        });
    },

    unsubscribeFromMessages: () => {
        const socket = useAuthStore.getState().socket;
        socket.off("newMessage");
        socket.off("ai:start");
        socket.off("ai:delta");
        socket.off("ai:done");
        socket.off("ai:error");
        set({ aiReply: null });
    },

    setSelectedUser: (selectedUser) => set({ selectedUser }),
}));