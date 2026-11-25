import mongoose from "mongoose";

// Something the AI assistant remembers about one user, across conversations.
// Only the user creates these, by saving a memory the assistant suggested.
const memorySchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        text: { type: String, required: true, maxlength: 300 },
    },
    { timestamps: true },
);

const Memory = mongoose.model("Memory", memorySchema);

export default Memory;
