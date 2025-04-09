// context/ChatContext.tsx
import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ChatMessage {
  id: string;
  sender: string;
  content: string; // Explanation
  timestamp: Date;
  attachments?: any[];
  mentions?: any[];
  diffHunks?: string[]; // Store diffs here instead of suggestions
  isError?: boolean;
}


interface ChatContextType {
  isChatOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
  unreadCount: number;
  markAsRead: () => void;
  activeSessionId: string | null;
  setActiveSessionId: (sessionId: string | null) => void;
  updateChatTitle: (sessionId: string, title: string) => Promise<void>; // Add this
}



const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastReadTimestamp, setLastReadTimestamp] = useState<Date | null>(null);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null); // <-- ADDED state

  const openChat = () => {
    setIsChatOpen(true);
    markAsRead();
  };

  const closeChat = () => {
    setIsChatOpen(false);
  };

  const toggleChat = () => {
    if (!isChatOpen) {
      markAsRead();
    }
    setIsChatOpen(!isChatOpen);
  };

  const markAsRead = () => {
    setUnreadCount(0);
    setLastReadTimestamp(new Date());
  };

  const setActiveSessionId = useCallback((sessionId: string | null) => {
    console.log('[ChatContext] Setting activeSessionId:', sessionId);
    setActiveSessionIdState(sessionId);
  }, []); // <-- ADDED callback

  const updateChatTitle = useCallback(async (sessionId: string, title: string) => {
    if (!sessionId || !title) return;

    try {
      // Update title in Firestore
      const sessionRef = doc(db, "chatSessions", sessionId);
      await updateDoc(sessionRef, {
        title,
        lastUpdated: serverTimestamp()
      });
      console.log(`[ChatContext] Updated chat title: "${title}" for session: ${sessionId}`);
    } catch (error) {
      console.error('[ChatContext] Error updating chat title:', error);
    }
  }, []);



  // This would normally fetch messages from Firebase
  // For demo purposes, we're just providing the interface
  const sendMessage = async (
    content: string,
    projectId: string,
    userId: string,
    userName: string
  ) => {
    // In production, you would add this to your Firebase collection
    // const messagesRef = collection(db, "chatMessages");
    // await addDoc(messagesRef, {
    //   content,
    //   userId,
    //   userName,
    //   projectId,
    //   createdAt: serverTimestamp()
    // });

    // For now, we'll just add it locally
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      content,
      userId,
      userName,
      projectId,
      createdAt: new Date()
    };

    setChatMessages(prev => [...prev, newMessage]);
  };

  // Effect to count unread messages
  useEffect(() => {
    if (!isChatOpen && lastReadTimestamp) {
      const newMessages = chatMessages.filter(
        msg => new Date(msg.createdAt) > lastReadTimestamp
      );
      setUnreadCount(newMessages.length);
    }
  }, [chatMessages, isChatOpen, lastReadTimestamp]);

  // In production, you would set up a Firebase listener here
  // useEffect(() => {
  //   if (!projectId) return;
  //
  //   const q = query(
  //     collection(db, "chatMessages"),
  //     where("projectId", "==", projectId),
  //     orderBy("createdAt", "asc")
  //   );
  //
  //   const unsubscribe = onSnapshot(q, (snapshot) => {
  //     const messages: ChatMessage[] = [];
  //     snapshot.forEach((doc) => {
  //       const data = doc.data();
  //       messages.push({
  //         id: doc.id,
  //         content: data.content,
  //         userId: data.userId,
  //         userName: data.userName,
  //         createdAt: data.createdAt.toDate(),
  //         projectId: data.projectId
  //       });
  //     });
  //     setChatMessages(messages);
  //   });
  //
  //   return () => unsubscribe();
  // }, [projectId]);

  return (
    <ChatContext.Provider value={{
      isChatOpen,
      openChat,
      closeChat,
      toggleChat,
      unreadCount,
      markAsRead,
      activeSessionId,
      setActiveSessionId,
      updateChatTitle  // Add this line to include the function
    }}>
      {children}
    </ChatContext.Provider>
  );  
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};