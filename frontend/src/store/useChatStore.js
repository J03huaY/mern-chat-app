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
    // The AI assistant's reply while it is still streaming:
    // { replyId, text, tools: [{ id, label, status, resultCount }] }
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
            // The AI assistant uses the browser's time zone to understand "yesterday", "tonight", etc.
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, { ...messageData, timeZone });
            set({messages:[...messages, res.data]})
        } catch (error) {
            toast.error(error.response.data.message);
        }
    },

    // Replaces one message in the list (e.g. an AI reply whose draft changed status).
    replaceMessage: (updated) => {
        set({ messages: get().messages.map((m) => (m._id === updated._id ? updated : m)) });
    },

    // Sends a draft the AI assistant wrote. Returns true on success.
    sendDraft: async (draftId, editedText) => {
        try {
            const res = await axiosInstance.post(`/messages/drafts/${draftId}/send`,
                editedText !== undefined ? { text: editedText } : {});
            get().replaceMessage(res.data.assistantMessage);
            const draft = res.data.assistantMessage.drafts?.find((d) => d._id === draftId);
            toast.success(`Sent to ${draft?.recipientName || "your contact"}`);
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || "Couldn't send the message.");
            // The draft may have changed elsewhere (e.g. sent from another tab): reload it.
            if (error.response?.status === 409 && get().selectedUser) get().getMessages(get().selectedUser._id);
            return false;
        }
    },

    cancelDraft: async (draftId) => {
        try {
            const res = await axiosInstance.post(`/messages/drafts/${draftId}/cancel`);
            get().replaceMessage(res.data.assistantMessage);
            return true;
        } catch (error) {
            toast.error(error.response?.data?.message || "Couldn't cancel the draft.");
            if (error.response?.status === 409 && get().selectedUser) get().getMessages(get().selectedUser._id);
            return false;
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
        // Returns the in-progress reply for replyId, starting one if the chat was
        // opened mid-reply.
        const replyFor = (replyId) => {
            const current = get().aiReply;
            return current?.replyId === replyId ? current : { replyId, text: "", tools: [], drafts: [] };
        };

        socket.on("ai:start", ({ replyId }) => {
            set({ aiReply: { replyId, text: "", tools: [], drafts: [] } });
        });
        // A draft the assistant just wrote (shown as a preview until the reply is saved).
        socket.on("ai:draft", ({ replyId, draft }) => {
            const reply = replyFor(replyId);
            set({ aiReply: { ...reply, drafts: [...reply.drafts, draft] } });
        });
        socket.on("ai:delta", ({ replyId, text }) => {
            const reply = replyFor(replyId);
            set({ aiReply: { ...reply, text: reply.text + text } });
        });
        // A failed stream was retried: replace the partial text.
        socket.on("ai:reset", ({ replyId, text }) => {
            set({ aiReply: { ...replyFor(replyId), text } });
        });
        socket.on("ai:tool", ({ replyId, id, label, status, resultCount }) => {
            const reply = replyFor(replyId);
            const step = { id, label, status, resultCount };
            const exists = reply.tools.some((t) => t.id === id);
            const tools = exists ? reply.tools.map((t) => (t.id === id ? step : t)) : [...reply.tools, step];
            set({ aiReply: { ...reply, tools } });
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
        socket.off("ai:reset");
        socket.off("ai:tool");
        socket.off("ai:draft");
        socket.off("ai:done");
        socket.off("ai:error");
        set({ aiReply: null });
    },

    setSelectedUser: (selectedUser) => set({ selectedUser }),
}));