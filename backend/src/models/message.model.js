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

}, { timestamps: true }
);

const Message = mongoose.model("Message", messageSchema);

export default Message;