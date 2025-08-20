import { useState } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, addDoc } from "firebase/firestore";

export default function Setup({ nickname, setNickname, chatId, setChatId, joinId, setJoinId, pc, dataChannel, setPage }) {
  const [status, setStatus] = useState('Waiting');
  const [copyButtonText, setCopyButtonText] = useState('Copy ID');

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
    dataChannel.current.onopen = () => {
      console.log("Creator's data channel is open!");
      setPage('chat');
    };
    
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
      dataChannel.current.onopen = () => {
        console.log("Joiner's data channel is open!");
        setPage('chat');
      };
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

  const handleCopyId = () => {
    navigator.clipboard.writeText(chatId);
    setCopyButtonText('Copied!');
    setTimeout(() => setCopyButtonText('Copy ID'), 2000);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-center mb-6 text-white">Start a Secure Chat</h2>
      <div className="mb-6">
        <label htmlFor="nickname-input" className="block text-sm font-medium text-slate-300 mb-1">Your Nickname</label>
        <input type="text" id="nickname-input" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Enter your name..." className="w-full mt-1 p-3 bg-slate-700/50 border border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-white" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-700/30 p-6 rounded-lg border border-slate-600 flex flex-col">
          <h3 className="font-semibold mb-3 text-lg text-white">Create a New Chat</h3>
          <button onClick={handleCreateChat} className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition shadow-lg transform hover:scale-105">Create Chat</button>
          {chatId && (
            <div className="mt-4 flex-grow flex flex-col">
              <label className="block text-sm font-medium text-slate-300">Share this ID with your peer:</label>
              <input type="text" value={chatId} readOnly className="w-full mt-2 p-2 bg-slate-900/50 border border-slate-700 rounded-md shadow-sm font-mono text-center" />
              <button onClick={handleCopyId} className="w-full mt-2 bg-slate-600 text-slate-200 py-2 px-3 rounded-md hover:bg-slate-500 text-sm transition-colors">
                {copyButtonText}
              </button>
            </div>
          )}
        </div>
        <div className="bg-slate-700/30 p-6 rounded-lg border border-slate-600">
          <h3 className="font-semibold mb-3 text-lg text-white">Join an Existing Chat</h3>
          <label htmlFor="join-id-input" className="block text-sm font-medium text-slate-300">Enter Peer's Chat ID:</label>
          <input type="text" id="join-id-input" value={joinId} onChange={(e) => setJoinId(e.target.value)} className="w-full mt-2 p-3 bg-slate-700/50 border border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-white" />
          <button onClick={handleJoinChat} className="w-full mt-4 bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 transition shadow-lg transform hover:scale-105">Join Chat</button>
        </div>
      </div>
      <div className="text-center mt-6 text-slate-400">{status}</div>
    </div>
  );
}
