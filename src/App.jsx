import { useState, useRef, useEffect } from 'react';
import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, addDoc, deleteDoc } from "firebase/firestore";

// WebRTC configuration using public Google STUN servers
const servers = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
  ],
  iceCandidatePoolSize: 10,
};

// --- Audio Notification Function ---
const playNotificationSound = () => {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioCtx.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); 
  oscillator.connect(audioCtx.destination);
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + 0.1);
};


export default function App() {
  // State for managing UI pages and inputs
  const [page, setPage] = useState('setup'); // 'setup' or 'chat'
  const [nickname, setNickname] = useState('');
  const [joinId, setJoinId] = useState('');
  const [chatId, setChatId] = useState(null);
  const [status, setStatus] = useState('Waiting');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [peerIsTyping, setPeerIsTyping] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState('Copy ID');
  
  // useRef to hold instances that shouldn't trigger re-renders on change
  const pc = useRef(new RTCPeerConnection(servers));
  const dataChannel = useRef(null);
  const peerNickname = useRef('Peer');
  const typingTimeout = useRef(null);

  // Ref for auto-scrolling to the latest message
  const messagesEndRef = useRef(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Effect for automatic cleanup on tab close ---
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      // This will trigger the disconnect logic if the user closes the tab
      handleDisconnect(true);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [chatId, joinId]); // Rerun if chatId or joinId changes

  // --- WebRTC Logic: Create Chat (Caller) ---
  const handleCreateChat = async () => {
    if (!nickname.trim()) return alert("Please enter a nickname!");
    setStatus('Creating chat...');

    const callDoc = doc(collection(db, 'calls'));
    const offerCandidates = collection(callDoc, 'offerCandidates');
    const answerCandidates = collection(callDoc, 'answerCandidates');

    setChatId(callDoc.id);

    pc.current.onicecandidate = (event) => {
      event.candidate && addDoc(offerCandidates, event.candidate.toJSON());
    };

    dataChannel.current = pc.current.createDataChannel("chat");
    setupDataChannelEvents();

    const offerDescription = await pc.current.createOffer();
    await pc.current.setLocalDescription(offerDescription);
    const offer = { sdp: offerDescription.sdp, type: offerDescription.type };
    await setDoc(callDoc, { offer });

    onSnapshot(callDoc, (snapshot) => {
      const data = snapshot.data();
      if (!pc.current.currentRemoteDescription && data?.answer) {
        setStatus('Connecting...');
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.current.setRemoteDescription(answerDescription);
      }
    });

    onSnapshot(answerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          pc.current.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        }
      });
    });

    setStatus(`Chat created. Share the ID!`);
  };

  // --- WebRTC Logic: Join Chat (Callee) ---
  const handleJoinChat = async () => {
    if (!nickname.trim()) return alert("Please enter a nickname!");
    if (!joinId.trim()) return alert("Please enter a chat ID!");
    setStatus('Joining chat...');

    const callDoc = doc(db, 'calls', joinId);
    const answerCandidates = collection(callDoc, 'answerCandidates');
    const offerCandidates = collection(callDoc, 'offerCandidates');

    pc.current.onicecandidate = (event) => {
      event.candidate && addDoc(answerCandidates, event.candidate.toJSON());
    };

    pc.current.ondatachannel = (event) => {
      dataChannel.current = event.channel;
      setupDataChannelEvents();
    };

    const callData = (await getDoc(callDoc)).data();
    const offerDescription = new RTCSessionDescription(callData.offer);
    await pc.current.setRemoteDescription(offerDescription);

    const answerDescription = await pc.current.createAnswer();
    await pc.current.setLocalDescription(answerDescription);
    const answer = { type: answerDescription.type, sdp: answerDescription.sdp };
    await updateDoc(callDoc, { answer });

    onSnapshot(offerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          pc.current.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        }
      });
    });
  };

  // --- Data Channel Event Handling ---
  const setupDataChannelEvents = () => {
    dataChannel.current.onopen = () => {
      console.log("Data channel is open!");
      setStatus('Connected!');
      dataChannel.current.send(JSON.stringify({ type: 'nickname', name: nickname }));
      setPage('chat');
    };

    dataChannel.current.onclose = () => {
      console.log("Data channel is closed!");
      setStatus('Disconnected.');
      if (page === 'chat') {
        alert("Peer has disconnected.");
        window.location.reload();
      }
    };

    dataChannel.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (data.type === 'nickname') {
        peerNickname.current = data.name;
        setMessages((prev) => [...prev, { type: 'system', content: `${data.name} has joined.`, timestamp }]);
      } else if (data.type === 'chat') {
        playNotificationSound();
        setPeerIsTyping(false); 
        clearTimeout(typingTimeout.current);
        setMessages((prev) => [...prev, { type: 'peer', content: data.message, timestamp }]);
      } else if (data.type === 'typing') {
        setPeerIsTyping(true);
        clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => {
          setPeerIsTyping(false);
        }, 2000); 
      }
    };
  };
  
  // --- Message Sending Logic ---
  const handleSendMessage = (e) => {
    e.preventDefault();
    const message = newMessage.trim();
    if (!message) return;

    if (dataChannel.current && dataChannel.current.readyState === 'open') {
        const data = { type: 'chat', message: message };
        dataChannel.current.send(JSON.stringify(data));
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setMessages((prev) => [...prev, { type: 'self', content: message, timestamp }]);
        setNewMessage('');
    }
  };

  // --- Typing Indicator Logic ---
  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    if (dataChannel.current && dataChannel.current.readyState === 'open') {
      dataChannel.current.send(JSON.stringify({ type: 'typing' }));
    }
  };

  // --- Disconnect and Cleanup Logic ---
  const handleDisconnect = async (isUnloading = false) => {
    // Determine which ID to use for deletion
    const docId = chatId || joinId;
    if (docId) {
      const callDoc = doc(db, 'calls', docId);
      // Note: Deleting subcollections client-side is complex. 
      // This deletes the main doc, orphaning the subcollections.
      // For a production app, a Cloud Function is better for deep deletes.
      await deleteDoc(callDoc);
    }

    if (dataChannel.current) {
      dataChannel.current.close();
    }
    if (pc.current) {
      pc.current.close();
    }
    
    // Don't reload if the page is already unloading
    if (!isUnloading) {
      window.location.reload();
    }
  };

  // --- Copy ID Logic ---
  const handleCopyId = () => {
    navigator.clipboard.writeText(chatId);
    setCopyButtonText('Copied!');
    setTimeout(() => {
      setCopyButtonText('Copy ID');
    }, 2000);
  };

  // --- JSX for Rendering UI ---
  return (
    <div className="h-full bg-slate-100 font-sans antialiased text-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl h-full max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col">
        <header className="bg-slate-800 text-white p-4 rounded-t-2xl shadow-md flex justify-between items-center">
          <div className="text-left">
            <h1 className="text-xl font-bold">Secure Peer-to-Peer Chat</h1>
            <p className="text-xs text-slate-300">Messages are sent directly and are never stored.</p>
          </div>
          {page === 'chat' && (
            <button onClick={() => handleDisconnect(false)} className="bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition text-sm">
              Disconnect
            </button>
          )}
        </header>

        <main className="flex-grow flex flex-col p-6 space-y-4 overflow-hidden">
          {page === 'setup' ? (
            // --- Setup View ---
            <div>
              <h2 className="text-lg font-semibold text-center mb-4">Start a Secure Chat</h2>
              <div className="mb-4">
                <label htmlFor="nickname-input" className="block text-sm font-medium text-slate-700">Your Nickname:</label>
                <input type="text" id="nickname-input" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Enter your name..." className="w-full mt-1 p-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <h3 className="font-semibold mb-2">1. Create a New Chat</h3>
                  <button onClick={handleCreateChat} className="w-full bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition">Create Chat</button>
                  {chatId && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-slate-700">Share this ID with your peer:</label>
                      <input type="text" value={chatId} readOnly className="w-full mt-1 p-2 bg-white border border-slate-300 rounded-md shadow-sm" />
                      <button onClick={handleCopyId} className="w-full mt-2 bg-slate-200 text-slate-700 py-1 px-3 rounded-md hover:bg-slate-300 text-sm transition-colors">
                        {copyButtonText}
                      </button>
                    </div>
                  )}
                </div>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <h3 className="font-semibold mb-2">2. Join an Existing Chat</h3>
                  <label htmlFor="join-id-input" className="block text-sm font-medium text-slate-700">Enter Peer's Chat ID:</label>
                  <input type="text" id="join-id-input" value={joinId} onChange={(e) => setJoinId(e.target.value)} className="w-full mt-1 p-2 bg-white border border-slate-300 rounded-md shadow-sm" />
                  <button onClick={handleJoinChat} className="w-full mt-2 bg-emerald-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-emerald-700 transition">Join Chat</button>
                </div>
              </div>
              <div className="text-center mt-4 text-slate-500">Status: {status}</div>
            </div>
          ) : (
            // --- Chat View ---
            <div className="flex-grow flex flex-col overflow-hidden">
              <div className="flex-grow bg-slate-100 rounded-lg p-4 mb-4 overflow-y-auto space-y-4">
                {messages.map((msg, index) => (
                  <div key={index}>
                    {msg.type === 'system' && <p className="text-center text-sm text-slate-400 my-2">{msg.content}</p>}
                    {msg.type !== 'system' && (
                      <div className={`flex items-end gap-2 ${msg.type === 'self' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`flex flex-col space-y-1 text-sm max-w-xs mx-2 ${msg.type === 'self' ? 'order-1 items-end' : 'order-2 items-start'}`}>
                          <div className={`px-4 py-2 rounded-2xl inline-block ${msg.type === 'self' ? 'bg-indigo-500 text-white rounded-br-none' : 'bg-slate-200 text-slate-800 rounded-bl-none'}`}>
                            <span className="block font-semibold mb-1">{msg.type === 'self' ? nickname : peerNickname.current}</span>
                            {msg.content}
                            <span className="block text-xs mt-1 opacity-75">{msg.timestamp}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              {/* Typing indicator UI */}
              <div className="h-6 px-4 pb-2">
                {peerIsTyping && <p className="text-sm text-slate-500 italic">{`${peerNickname.current} is typing...`}</p>}
              </div>
              <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
                <input type="text" value={newMessage} onChange={handleTyping} placeholder="Type your message..." className="flex-grow w-full px-4 py-2 bg-white border border-slate-300 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" />
                <button type="submit" className="bg-indigo-600 text-white rounded-full p-3 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-transform active:scale-95">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
