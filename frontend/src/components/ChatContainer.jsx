import React from 'react'
import { useEffect, useRef } from "react";
import { useChatStore } from '../store/useChatStore'
import ChatHeader from './ChatHeader';
import MessageInput from './MessageInput';
import MessageSkeleton from './skeletons/MessageSkeleton';
import { useAuthStore } from '../store/useAuthStore';
import { formatMessageTime } from '../lib/utils';
import AiToolSteps from './AiToolSteps';
import DraftCard from './DraftCard';
import MemoryCard from './MemoryCard';


const ChatContainer = () => {
  const {messages, getMessages, isMessagesLoading, selectedUser, subscribeToMessages,
    unsubscribeFromMessages, aiReply, sendDraft, cancelDraft, saveMemory, dismissMemory,
  } = useChatStore();
  const { authUser } = useAuthStore();  
  const messageEndRef = useRef(null);

  useEffect(() => {
    getMessages(selectedUser._id)

    subscribeToMessages();

    return () => unsubscribeFromMessages();
  }, [selectedUser._id, getMessages, subscribeToMessages, unsubscribeFromMessages]);

  useEffect(() => {
    if (messageEndRef.current && messages) {
        messageEndRef.current.scrollIntoView({ behavior: "smooth"});
    }
  },[messages, aiReply]);

  if(isMessagesLoading) {return (
    <div className='flex-1 flex flex-col overflow-auto'>
        <ChatHeader />
        <MessageSkeleton />
        <MessageInput />
    </div>
    )
  }


  return (
    <div className='flex-1 flex flex-col overflow-auto'>
        <ChatHeader />

        <div className='flex-1 overflow-y-auto p-4 space-y-4'>
            {messages.map((message) => (
                <div
                    key={message._id}
                    className={`chat ${message.senderId === authUser._id ? "chat-end": "chat-start"}`}
                    ref={messageEndRef}
                    >
                        <div className=' chat-image avatar'>
                            <div className='size-10 rounded-full border'>
                                <img 
                                src={
                                    message.senderId === authUser._id
                                    ? authUser.profilePic || "/avatar.png"
                                    : selectedUser.profilePic || "/avatar.png"
                                    

                                }
                                alt='profile-pic'
                                    />
                            </div> 
                        </div> 
                        <div className='chat-header mb-1'>
                            <time className='text-xs opacity-50 ml-1'>
                                {formatMessageTime(message.createdAt)}
                            </time>
                        </div>
                        <div className='chat-bubble flex flex-col'>
                            {message.image && (
                                <img
                                src={message.image}
                                alt="Attachment"
                                className="sm:max-w-[200px] rounded-md mb-2"
                                />
                            )}
                            {message.text && <p className='whitespace-pre-wrap'>{message.text}</p>}
                            {message.drafts?.map((draft) => (
                                <DraftCard key={draft._id} draft={draft} onSend={sendDraft} onCancel={cancelDraft} />
                            ))}
                            {message.memoryProposals?.map((proposal) => (
                                <MemoryCard key={proposal._id} proposal={proposal} onSave={saveMemory} onDismiss={dismissMemory} />
                            ))}
                        </div>
                        {message.toolCalls?.some((call) => call.ok) && (
                            <div className='chat-footer opacity-60 text-xs mt-1'>
                                {message.toolCalls.filter((call) => call.ok).map((call) => call.label).join(" · ")}
                            </div>
                        )}
                </div>
            ))}

            {/* AI assistant reply that is still streaming in */}
            {aiReply && (
                <div className='chat chat-start' ref={messageEndRef}>
                    <div className='chat-image avatar'>
                        <div className='size-10 rounded-full border'>
                            <img src={selectedUser.profilePic || "/avatar.png"} alt='AI assistant' />
                        </div>
                    </div>
                    <div className='chat-bubble flex flex-col'>
                        <AiToolSteps steps={aiReply.tools} />
                        {aiReply.text
                            ? <p className='whitespace-pre-wrap'>{aiReply.text}</p>
                            : <span className='loading loading-dots loading-sm' aria-label='AI assistant is typing' />}
                        {aiReply.drafts?.map((draft) => (
                            <DraftCard key={draft._id} draft={draft} preview />
                        ))}
                        {aiReply.memories?.map((proposal) => (
                            <MemoryCard key={proposal._id} proposal={proposal} preview />
                        ))}
                    </div>
                </div>
            )}
        </div>
      
        <MessageInput />
    </div>
  )
}

export default ChatContainer
