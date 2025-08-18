import { useState, useRef, useEffect } from 'react';

const playNotificationSound = () => {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioCtx.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime);
  oscillator.connect(audioCtx.destination);
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + 0.1);
};

export default function ChatRoom({ nickname, dataChannel, onDisconnect }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [peerIsTyping, setPeerIsTyping] = useState(false);
  
  const peerNickname = useRef('Peer');
  const typingTimeout = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (dataChannel.current) {
      dataChannel.current.onopen = () => {
        console.log("Data channel is open!");
        dataChannel.current.send(JSON.stringify({ type: 'nickname', name: nickname }));
      };

      dataChannel.current.onclose = () => {
        console.log("Data channel is closed!");
        alert("Peer has disconnected.");
        onDisconnect();
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
          typingTimeout.current = setTimeout(() => setPeerIsTyping(false), 2000);
        }
      };
    }
  }, [dataChannel, nickname, onDisconnect]);

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

  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    if (dataChannel.current && dataChannel.current.readyState === 'open') {
      dataChannel.current.send(JSON.stringify({ type: 'typing' }));
    }
  };

  return (
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
  );
}
