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
    if (!dataChannel.current) return;

    dataChannel.current.send(JSON.stringify({ type: 'nickname', name: nickname }));

    dataChannel.current.onclose = () => {
      console.log("Data channel is closed!");
      setMessages((prev) => [...prev, { type: 'system', content: `${peerNickname.current} has disconnected.` }]);
      setTimeout(() => {
        onDisconnect();
      }, 3000);
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
    
    return () => {
        if (dataChannel.current) {
            dataChannel.current.onmessage = null;
            dataChannel.current.onclose = null;
        }
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
      <div className="flex-grow bg-transparent rounded-lg p-4 mb-4 overflow-y-auto space-y-4 custom-scrollbar">
        {messages.map((msg, index) => (
          <div key={index}>
            {msg.type === 'system' && <p className="text-center text-sm text-slate-500 my-2">{msg.content}</p>}
            {msg.type !== 'system' && (
              <div className={`flex items-end gap-2 ${msg.type === 'self' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex flex-col space-y-1 text-sm max-w-xs mx-2 ${msg.type === 'self' ? 'order-1 items-end' : 'order-2 items-start'}`}>
                  <div className={`px-4 py-3 rounded-2xl inline-block shadow-md ${msg.type === 'self' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-600 text-white rounded-bl-none'}`}>
                    <span className="block font-semibold mb-1 text-xs text-slate-300">{msg.type === 'self' ? nickname : peerNickname.current}</span>
                    <p className="text-base">{msg.content}</p>
                    <span className="block text-xs mt-2 text-slate-400 text-right">{msg.timestamp}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="h-6 px-4 pb-2">
        {peerIsTyping && <p className="text-sm text-slate-400 italic">{`${peerNickname.current} is typing...`}</p>}
      </div>
      <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
        <input type="text" value={newMessage} onChange={handleTyping} placeholder="Type your message..." className="flex-grow w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-white" />
        <button type="submit" className="bg-blue-600 text-white rounded-full p-3 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform active:scale-95">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </form>
    </div>
  );
}
