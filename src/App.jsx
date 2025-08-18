import { useState, useRef, useEffect } from 'react';
import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, addDoc } from "firebase/firestore";

// WebRTC configuration using public Google STUN servers
const servers = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
  ],
  iceCandidatePoolSize: 10,
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
  
  // useRef to hold instances that shouldn't trigger re-renders on change
  const pc = useRef(new RTCPeerConnection(servers));
  const dataChannel = useRef(null);
  const peerNickname = useRef('Peer');

  // Ref for auto-scrolling to the latest message
  const messagesEndRef = useRef(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- WebRTC Logic: Create Chat (Caller) ---
  const handleCreateChat = async () => {
    if (!nickname.trim()) return alert("Please enter a nickname!");
    setStatus('Creating chat...');

    // Firestore references for signaling
    const callDoc = doc(collection(db, 'calls'));
    const offerCandidates = collection(callDoc, 'offerCandidates');
    const answerCandidates = collection(callDoc, 'answerCandidates');

    setChatId(callDoc.id);

    // 1. Listen for ICE candidates and add them to Firestore
    pc.current.onicecandidate = (event) => {
      event.candidate && addDoc(offerCandidates, event.candidate.toJSON());
    };

    // 2. Create the data channel
    dataChannel.current = pc.current.createDataChannel("chat");
    setupDataChannelEvents();

    // 3. Create an offer, set it as local description, and save to Firestore
    const offerDescription = await pc.current.createOffer();
    await pc.current.setLocalDescription(offerDescription);
    const offer = { sdp: offerDescription.sdp, type: offerDescription.type };
    await setDoc(callDoc, { offer });

    // 4. Listen for the answer from the peer
    onSnapshot(callDoc, (snapshot) => {
      const data = snapshot.data();
      if (!pc.current.currentRemoteDescription && data?.answer) {
        setStatus('Connecting...');
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.current.setRemoteDescription(answerDescription);
      }
    });

    // 5. Listen for ICE candidates from the peer
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

    // 1. Listen for ICE candidates and add them to Firestore
    pc.current.onicecandidate = (event) => {
      event.candidate && addDoc(answerCandidates, event.candidate.toJSON());
    };

    // 2. Wait for the data channel to be established by the caller
    pc.current.ondatachannel = (event) => {
      dataChannel.current = event.channel;
      setupDataChannelEvents();
    };

    // 3. Get the offer from Firestore, set it as remote description
    const callData = (await getDoc(callDoc)).data();
    const offerDescription = new RTCSessionDescription(callData.offer);
    await pc.current.setRemoteDescription(offerDescription);

    // 4. Create an answer, set it as local description, and save to Firestore
    const answerDescription = await pc.current.createAnswer();
    await pc.current.setLocalDescription(answerDescription);
    const answer = { type: answerDescription.type, sdp: answerDescription.sdp };
    await updateDoc(callDoc, { answer });

    // 5. Listen for ICE candidates from the peer
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
      // Exchange nicknames once the connection is open
      dataChannel.current.send(JSON.stringify({ type: 'nickname', name: nickname }));
      setPage('chat'); // Switch to the chat view
    };

    dataChannel.current.onclose = () => {
      console.log("Data channel is closed!");
      setStatus('Disconnected.');
      alert("Connection closed.");
      window.location.reload(); // Simple way to reset state
    };

    dataChannel.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'nickname') {
        peerNickname.current = data.name;
        setMessages((prev) => [...prev, { type: 'system', content: `${data.name} has joined.` }]);
      } else if (data.type === 'chat') {
        setMessages((prev) => [...prev, { type: 'peer', content: data.message }]);
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
        setMessages((prev) => [...prev, { type: 'self', content: message }]);
        setNewMessage('');
    }
  };

  // --- JSX for Rendering UI ---
  return (
    <div className="h-full bg-slate-100 font-sans antialiased text-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl h-full max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col">
        <header className="bg-slate-800 text-white p-4 rounded-t-2xl shadow-md text-center">
          <h1 className="text-xl font-bold">Secure Peer-to-Peer Chat</h1>
          <p className="text-xs text-slate-300">Messages are sent directly and are never stored.</p>
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
                      <button onClick={() => navigator.clipboard.writeText(chatId)} className="w-full mt-2 bg-slate-200 text-slate-700 py-1 px-3 rounded-md hover:bg-slate-300 text-sm">Copy ID</button>
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
              <div className="flex-grow bg-slate-100 rounded-lg p-4 mb-4 overflow-y-auto">
                {messages.map((msg, index) => (
                  <div key={index}>
                    {msg.type === 'system' && <p className="text-center text-sm text-slate-400 my-2">{msg.content}</p>}
                    {msg.type !== 'system' && (
                      <div className={`flex flex-col mb-4 ${msg.type === 'self' ? 'items-end' : 'items-start'}`}>
                        <div className="text-xs text-slate-500 mb-1">{msg.type === 'self' ? nickname : peerNickname.current}</div>
                        <div className={`px-4 py-2 rounded-2xl shadow max-w-xs md:max-w-md ${msg.type === 'self' ? 'bg-indigo-500 text-white rounded-br-none' : 'bg-slate-200 text-slate-800 rounded-bl-none'}`}>{msg.content}</div>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
                <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type your message..." className="flex-grow w-full px-4 py-2 bg-white border border-slate-300 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" />
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
