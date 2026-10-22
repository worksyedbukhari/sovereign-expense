import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import api, { WS_URL } from '../utils/api';
import { useAuth } from '../context/AuthContext';

let socket = null;

export default function Chat() {
  const { user } = useAuth();
  const location = useLocation();
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [typing, setTyping] = useState(false);
  const [typingUser, setTypingUser] = useState('');
  const messagesEndRef = useRef(null);
  const typingTimeout = useRef(null);

  useEffect(() => { fetchGroups(); return () => { if (socket) socket.disconnect(); }; }, []);
  useEffect(() => { if (location.state?.groupId) selectGroup(parseInt(location.state.groupId)); }, [location.state]);
  useEffect(() => { scrollToBottom(); }, [messages]);

  const fetchGroups = async () => { try { const d = await api.get('/groups'); setGroups(d); } catch (e) { console.error(e); } };

  const selectGroup = async (groupId) => {
    setSelectedGroup(groupId);
    if (socket) socket.disconnect();
    socket = io(WS_URL, {
      transports: ['websocket'],
      auth: { token: localStorage.getItem('token') }
    });
    socket.on('connect', () => socket.emit('join_group', groupId));
    socket.on('connect_error', (error) => console.error('Chat connection rejected:', error.message));
    socket.on('new_message', (message) => setMessages(prev => [...prev, message]));
    socket.on('user_typing', (data) => { setTypingUser(data.username); setTyping(true); });
    socket.on('user_stop_typing', () => { setTyping(false); setTypingUser(''); });
    try { const d = await api.get(`/chat/${groupId}`); setMessages(d); } catch (e) { console.error(e); }
  };

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedGroup) return;
    const message = newMessage.trim();
    try {
      // The REST endpoint authenticates the writer, persists the message,
      // and broadcasts the saved record to the group.
      await api.post(`/chat/${selectedGroup}`, { content: message });
      setNewMessage('');
      socket?.emit('stop_typing', { groupId: selectedGroup });
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleTyping = () => {
    if (!socket || !selectedGroup) return;
    socket.emit('typing', { groupId: selectedGroup });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => socket.emit('stop_typing', { groupId: selectedGroup }), 2000);
  };

  const selectedGroupData = groups.find(g => g.id === selectedGroup);

  return (
    <div>
      <div className="page-header"><h2>Chat</h2><p>Discuss expenses with your groups</p></div>
      <div style={{ display: 'flex', gap: 20, height: 'calc(100vh - 180px)' }}>
        <div style={{ width: 260, flexShrink: 0 }}>
          <div className="card" style={{ height: '100%', overflow: 'auto', padding: 16 }}>
            <h3 style={{ marginBottom: 14, fontSize: 14 }}>Groups</h3>
            {groups.length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No groups yet</p> : groups.map(group => (
              <div key={group.id} onClick={() => selectGroup(group.id)} style={{ padding: 12, borderRadius: 10, cursor: 'pointer', marginBottom: 6, background: selectedGroup === group.id ? 'var(--accent-dim)' : 'transparent', transition: 'all 0.2s', border: selectedGroup === group.id ? '1px solid rgba(27,37,89,0.3)' : '1px solid transparent' }} onMouseOver={(e) => { if (selectedGroup !== group.id) e.currentTarget.style.background = 'var(--bg-input)'; }} onMouseOut={(e) => { if (selectedGroup !== group.id) e.currentTarget.style.background = 'transparent'; }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{group.name}</div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>{group.member_count} members</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="chat-container" style={{ padding: 0 }}>
            {!selectedGroup ? (
              <div className="empty-state" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}><div className="icon">💬</div><h3>Select a group to start chatting</h3></div>
            ) : (
              <>
                <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 15 }}>{selectedGroupData?.name || 'Chat'}</div>
                <div className="chat-messages">
                  {messages.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40, fontSize: 14 }}>No messages yet. Start the conversation!</div> : messages.map((msg, i) => (
                    <div className={`chat-message ${msg.user_id === user.id ? 'sent' : 'received'}`} key={msg.id || i}>
                      <div className="avatar" style={{ background: msg.user_id === user.id ? 'var(--gradient-navy)' : 'var(--bg-input)', color: msg.user_id === user.id ? '#fff' : 'var(--text-primary)' }}>{msg.name?.charAt(0).toUpperCase()}</div>
                      <div className="bubble">
                        <div className="sender">{msg.name}</div>
                        <div className="text">{msg.content}</div>
                        <div className="time">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>
                  ))}
                  {typing && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '0 12px' }}>{typingUser} is typing...</div>}
                  <div ref={messagesEndRef} />
                </div>
                <form onSubmit={sendMessage} className="chat-input">
                  <input type="text" value={newMessage} onChange={(e) => { setNewMessage(e.target.value); handleTyping(); }} placeholder="Type a message..." />
                  <button type="submit" className="btn btn-primary">Send</button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
