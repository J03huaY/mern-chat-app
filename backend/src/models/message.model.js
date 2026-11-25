import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
{
    senderId: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    text: {
        type: String,
    },
    image: {
        type: String,
    },
    // AI assistant replies only: the tools it used to answer
    toolCalls: {
        type: [
            {
                _id: false,
                name: String,
                label: String,
                ok: Boolean,
                resultCount: Number,
            },
        ],
        default: undefined,
    },
    // AI assistant replies only: messages it drafted for the user to send.
    // Nothing is sent until the user presses Send (see sendDraft).
    drafts: {
        type: [
            {
                recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
                recipientName: String,
                text: { type: String, required: true },
                status: {
                    type: String,
                    enum: ["pending", "sending", "sent", "cancelled"],
                    default: "pending",
                },
                sentMessageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
            },
        ],
        default: undefined,
    },

}, { timestamps: true }
);

// Loading a conversation, and counting recent messages to the AI assistant (rate limits).
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, createdAt: -1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;