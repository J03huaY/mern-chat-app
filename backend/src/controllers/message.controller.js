import User from "../models/user.model.js";
import Message from "../models/message.model.js"
import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import { isAssistant, queueAssistantReply } from "../lib/ai.js";
import { isValidTimeZone } from "../lib/aiToolHelpers.js";
import { assistantUsage, checkAssistantLimits, checkAssistantMessageText, readLimits } from "../lib/aiRateLimit.js";

export const getUsersForSidebar = async(req, res) => {
    try {
        const loggedInUserId = req.user._id;
        // The AI assistant is listed first.
        const fileteredUsers = await User.find({_id: {$ne:loggedInUserId}})
            .select("-password")
            .sort({ isBot: -1, fullName: 1 });

        res.status(200).json(fileteredUsers)
    } catch (error) {
        console.error("Error in getUserForSidebar: ", error.message);
        res.status(500).json({ error:"Internal server error"});
    }
}

export const getMessages = async(req, res) => {
    try {
        const {id:userToChatId} = req.params
        const myId = req.user._id;

        // Sorted explicitly: without a sort, MongoDB returns whatever order the
        // query plan produces (newest first, one sender at a time, with the indexes).
        const messages = await Message.find({
            $or: [
                {senderId:myId, receiverId:userToChatId},
                {senderId:userToChatId, receiverId:myId}
            ]
        }).sort({ createdAt: 1, _id: 1 })

        res.status(200).json(messages);
    } catch (error) {
        console.log("Error in getMessages controller: ", error.message);
        res.status(500).json({ error: "Internal server error"});
    }
}

export const sendMessage = async(req, res) => {
    try {
        const { text, image} = req.body;
        const { id: receiverId } = req.params;
        const senderId = req.user._id;

        // Every message to the AI assistant costs an API call, so cap length and rate
        // before uploading or saving anything.
        if (isAssistant(receiverId)) {
            const tooLong = checkAssistantMessageText(text);
            if (tooLong) return res.status(400).json({ message: tooLong });

            const limited = checkAssistantLimits(await assistantUsage(senderId, receiverId), readLimits());
            if (limited) {
                console.log(`AI assistant limit reached for user ${senderId}: ${limited.error}`);
                res.set("Retry-After", String(limited.retryAfterSeconds));
                return res.status(429).json({ message: limited.error });
            }
        }

        let imageUrl;
        if (image) {
            //upload base64 image to cloudinary
            const uploadResponse = await cloudinary.uploader.upload(image);
            imageUrl = uploadResponse.secure_url;
        }

        const newMessage = new Message({
            senderId,
            receiverId,
            text,
            image: imageUrl,
        });

        await newMessage.save();

        // realtime functionality
        const receiverSocketId = getReceiverSocketId(receiverId);
        if(receiverSocketId) {
            io.to(receiverSocketId).emit("newMessage", newMessage);
        }

        res.status(201).json(newMessage);

        // Messages to the AI assistant get a streamed reply over the socket.
        if (isAssistant(receiverId)) {
            // The browser's time zone, if it sent a valid one; otherwise the server's.
            const timeZone = isValidTimeZone(req.body.timeZone) ? req.body.timeZone : undefined;
            queueAssistantReply(senderId, { timeZone });
        }

    } catch (error) {
        console.log("Error in sendMessage controller: ", error.message);
        res.status(500).json({ error: "Internal server error"});
    }
}