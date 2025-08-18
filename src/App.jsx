import { useState, useRef, useEffect } from 'react';
import { db } from './firebase';
import { doc, deleteDoc } from "firebase/firestore";
import Setup from './components/Setup';
import ChatRoom from './components/ChatRoom';

// Updated server configuration with a TURN server for better reliability
const servers = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    {
      urls: [
        'stun:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

export default function App() {
  const [page, setPage] = useState('setup');
  const [nickname, setNickname] = useState('');
  const [chatId, setChatId] = useState(null);
  const [joinId, setJoinId] = useState('');
  
  const pc = useRef(new RTCPeerConnection(servers));
  const dataChannel = useRef(null);

  const handleDisconnect = async (isUnloading = false) => {
    const docId = chatId || joinId;
    if (docId) {
      const callDoc = doc(db, 'calls', docId);
      await deleteDoc(callDoc);
    }
    if (dataChannel.current) dataChannel.current.close();
    if (pc.current) pc.current.close();
    if (!isUnloading) window.location.reload();
  };

  useEffect(() => {
    const handleBeforeUnload = () => handleDisconnect(true);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [chatId, joinId]);

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
            <Setup
              nickname={nickname}
              setNickname={setNickname}
              chatId={chatId}
              setChatId={setChatId}
              joinId={joinId}
              setJoinId={setJoinId}
              pc={pc}
              dataChannel={dataChannel}
              setPage={setPage}
            />
          ) : (
            <ChatRoom
              nickname={nickname}
              dataChannel={dataChannel}
              onDisconnect={() => handleDisconnect(false)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
