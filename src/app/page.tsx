'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, Sparkles, Clock, Coins, Award, Flame, Zap, ShieldAlert } from 'lucide-react';

interface Match {
  matchId: string;
  sportType: string;
  homeTeam: string;
  awayTeam: string;
  status: string;
  homeScore: number;
  awayScore: number;
  possession: number;
  lastPlay: string;
  minute: number;
  second: number;
}

interface Lobby {
  lobbyId: string;
  question: string;
  optionA: string;
  optionB: string;
  status: string;
  lockTime: number;
}

interface ChatMessage {
  id: number;
  username: string;
  alliance: string;
  text: string;
}

interface UserProfile {
  userId: string;
  username: string;
  currentLevel: number;
  currentXp: number;
  pointsBalance: number;
  activeStreak: number;
  badges: string[];
}

interface AIChat {
  sender: 'user' | 'assistant';
  text: string;
}

export default function PulseArenaDashboard() {
  const [usernameInput, setUsernameInput] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  
  const [match, setMatch] = useState<Match | null>(null);
  const [timeline, setTimeline] = useState<string[]>([]);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [wagerPoints, setWagerPoints] = useState<number>(50);
  const [wagerStatus, setWagerStatus] = useState<string | null>(null);
  
  const [chatRoom, setChatRoom] = useState<string>('NEUTRAL');
  const [chatInput, setChatInput] = useState<string>('');
  const [chatList, setChatList] = useState<ChatMessage[]>([]);
  
  const [aiInput, setAiInput] = useState<string>('');
  const [aiHistory, setAiHistory] = useState<AIChat[]>([
    { sender: 'assistant', text: "Welcome! Ask me any statistical questions about El Clasico history, match records, or batter stats." }
  ]);
  const [aiLoading, setAiLoading] = useState(false);
  
  const [payoutAlert, setPayoutAlert] = useState<{ outcome: string; payout: number } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  const socketRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatList]);

  useEffect(() => {
    if (!lobby || lobby.status !== 'ACTIVE') return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((lobby.lockTime - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [lobby]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput })
      });
      if (response.ok) {
        setIsLoggedIn(true);
        fetchProfile();
        connectWebSocket();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/v1/profile');
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/v1/connect`;
    
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      setWsConnected(true);
    };

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      switch (payload.event_type) {
        case 'WELCOME':
          setMatch(payload.data.match);
          setChatList(payload.data.recentChat);
          if (payload.data.activeLobby) {
            setLobby(payload.data.activeLobby);
          }
          break;
        case 'TELEMETRY_UPDATE':
          setMatch(payload.data);
          setTimeline(prev => {
            if (prev.length === 0 || prev[0] !== payload.data.lastPlay) {
              const updated = [payload.data.lastPlay, ...prev];
              return updated.slice(0, 10);
            }
            return prev;
          });
          break;
        case 'PRED_WINDOW_OPEN':
          setLobby({
            lobbyId: payload.lobby_id,
            question: payload.question,
            optionA: payload.options[0].value,
            optionB: payload.options[1].value,
            status: 'ACTIVE',
            lockTime: payload.lock_timestamp
          });
          setSelectedOption(null);
          setWagerStatus(null);
          break;
        case 'PRED_LOBBY_LOCKED':
          setLobby(prev => prev ? { ...prev, status: 'LOCKED' } : null);
          break;
        case 'PRED_LOBBY_RESOLVED':
          setLobby(prev => prev ? { ...prev, status: 'RESOLVED' } : null);
          break;
        case 'CHAT_MESSAGE_RECEIVED':
          setChatList(prev => [...prev, payload.data]);
          break;
        case 'USER_XP_SETTLEMENT':
          setUserProfile(prev => prev ? {
            ...prev,
            pointsBalance: payload.data.pointsBalance,
            currentXp: payload.data.currentXp,
            currentLevel: payload.data.currentLevel
          } : null);
          if (payload.data.payout > 0 || payload.data.outcome === 'LOST') {
            setPayoutAlert({
              outcome: payload.data.outcome,
              payout: payload.data.payout
            });
            setTimeout(() => setPayoutAlert(null), 4000);
          }
          break;
        case 'ERROR':
          if (payload.data.error_code === 'ERR_CHAT_MESSAGE_BLOCKED') {
            alert('Your message was blocked by the safety system.');
          }
          break;
      }
    };

    socket.onclose = () => {
      setWsConnected(false);
      setTimeout(connectWebSocket, 3000);
    };
  };

  const handleWagerSubmit = async () => {
    if (!lobby || !selectedOption || wagerPoints <= 0) return;
    try {
      const response = await fetch('/api/v1/predictions/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lobby_id: lobby.lobbyId,
          chosen_option: selectedOption,
          points_wagered: wagerPoints
        })
      });
      if (response.ok) {
        const data = await response.json();
        setWagerStatus('SUBMITTED');
        if (userProfile) {
          setUserProfile({ ...userProfile, pointsBalance: data.points_balance });
        }
      } else {
        const err = await response.json();
        alert(err.message);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendChatMessage = () => {
    if (!chatInput.trim() || !socketRef.current) return;
    socketRef.current.send(JSON.stringify({
      type: 'CHAT_MESSAGE',
      data: {
        alliance: chatRoom,
        text: chatInput
      }
    }));
    setChatInput('');
  };

  const handleAskAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim()) return;

    const userMsg = aiInput;
    setAiHistory(prev => [...prev, { sender: 'user', text: userMsg }]);
    setAiInput('');
    setAiLoading(true);

    try {
      const res = await fetch('/api/v1/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMsg })
      });
      const data = await res.json();
      if (res.ok) {
        setAiHistory(prev => [...prev, { sender: 'assistant', text: data.answer }]);
      } else {
        setAiHistory(prev => [...prev, { sender: 'assistant', text: `Error: ${data.message}` }]);
      }
    } catch (err) {
      setAiHistory(prev => [...prev, { sender: 'assistant', text: "Failed to connect to the AI model services." }]);
    } finally {
      setAiLoading(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#0D0E15' }}>
        <div className="dashboard-card" style={{ width: '400px', padding: '32px', border: '1px solid #2E324D' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 200" width="100%" height="50px">
              <defs>
                <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FF007A" />
                  <stop offset="50%" stopColor="#7928CA" />
                  <stop offset="100%" stopColor="#00DFD8" />
                </linearGradient>
                <linearGradient id="t-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="100%" stopColor="#8E9EAB" />
                </linearGradient>
              </defs>
              <ellipse cx="75" cy="75" rx="65" ry="40" fill="none" stroke="url(#logo-grad)" strokeWidth="4" />
              <circle cx="75" cy="75" r="8" fill="#00DFD8" />
              <g transform="translate(200, 115)">
                <text fontFamily="'Outfit', sans-serif" fontSize="72" fontWeight="900" fill="url(#logo-grad)">PULSE</text>
                <text x="270" fontFamily="'Outfit', sans-serif" fontSize="72" fontWeight="300" fill="url(#t-grad)">ARENA</text>
              </g>
            </svg>
          </div>
          <h2 style={{ textAlign: 'center', marginBottom: '8px', color: '#FFFFFF' }}>Join the Arena</h2>
          <p style={{ textAlign: 'center', color: '#8E9EAB', fontSize: '14px', marginBottom: '24px' }}>
            Live Match Telemetry & Real-Time Predictions
          </p>
          <form onSubmit={handleLogin}>
            <input
              type="text"
              className="chat-input-box"
              style={{ width: '100%', padding: '12px', fontSize: '16px', marginBottom: '16px' }}
              placeholder="Create username (e.g. Madridista9)"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              required
            />
            <button type="submit" className="wager-submit-btn" style={{ width: '100%', padding: '12px', fontSize: '16px' }}>
              Enter Arena
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <header className="header-bar">
        <div className="logo-container">
          <div className="logo-svg-wrapper">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 200" width="100%" height="100%">
              <defs>
                <linearGradient id="pulsar-grad-header" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FF007A" />
                  <stop offset="50%" stopColor="#7928CA" />
                  <stop offset="100%" stopColor="#00DFD8" />
                </linearGradient>
                <linearGradient id="text-grad-header" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="100%" stopColor="#8E9EAB" />
                </linearGradient>
              </defs>
              <ellipse cx="75" cy="75" rx="65" ry="40" fill="none" stroke="url(#pulsar-grad-header)" strokeWidth="4" />
              <path d="M 40,75 L 40,60 M 50,75 L 50,50 M 60,75 L 60,40 M 70,75 L 70,30 M 80,75 L 80,30 M 90,75 L 90,40 M 100,75 L 100,50 M 110,75 L 110,60" fill="none" stroke="url(#pulsar-grad-header)" strokeWidth="3" />
              <circle cx="75" cy="75" r="8" fill="#00DFD8" />
              <g transform="translate(200, 115)">
                <text fontFamily="'Outfit', sans-serif" fontSize="64" fontWeight="900" fill="url(#pulsar-grad-header)">PULSE</text>
                <text x="235" fontFamily="'Outfit', sans-serif" fontSize="64" fontWeight="300" fill="url(#text-grad-header)">ARENA</text>
              </g>
            </svg>
          </div>
        </div>

        <div className="header-user-stats">
          <div className="stat-pill points">
            <Coins size={16} />
            <span>{userProfile?.pointsBalance} Points</span>
          </div>
          <div className="stat-pill xp">
            <Award size={16} />
            <span>Lvl {userProfile?.currentLevel}</span>
          </div>
          <div className="stat-pill" style={{ color: wsConnected ? '#00E676' : '#FF1744', borderColor: wsConnected ? '#00E676' : '#FF1744' }}>
            <Zap size={16} />
            <span>{wsConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="dashboard-card">
            <div className="telemetry-header">
              <h2 style={{ fontSize: '20px' }}>In-Play Telemetry Dashboard</h2>
              <div className="live-indicator">LIVE</div>
            </div>

            {match && (
              <>
                <div className="score-display-row">
                  <div className="team-block">
                    <span className="team-name">{match.homeTeam}</span>
                    <span className="score-value">{match.homeScore}</span>
                  </div>
                  <div className="match-clock">
                    {match.minute}:{match.second < 10 ? `0${match.second}` : match.second}
                  </div>
                  <div className="team-block">
                    <span className="team-name">{match.awayTeam}</span>
                    <span className="score-value">{match.awayScore}</span>
                  </div>
                </div>

                <div className="possession-bar-container">
                  <div className="possession-bar-fill" style={{ width: `${match.possession}%` }}></div>
                </div>
                <div className="possession-labels">
                  <span>Possession: {match.possession}%</span>
                  <span>{100 - match.possession}%</span>
                </div>
              </>
            )}

            <div style={{ margin: '8px 0 12px 0', borderBottom: '1px solid #2E324D' }}></div>
            <h3 style={{ fontSize: '14px', color: '#8E9EAB', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={14} /> Telemetry Event Timeline
            </h3>
            
            <div className="timeline-feed">
              {timeline.length === 0 ? (
                <div className="timeline-item">No play-by-play updates streamed yet. Waiting for referee whistle.</div>
              ) : (
                timeline.map((play, index) => (
                  <div key={index} className="timeline-item" style={{ borderLeftColor: index === 0 ? '#00DFD8' : '#FF007A' }}>
                    {play}
                  </div>
                ))
              )}
            </div>
          </div>

          {lobby && (
            <div className="dashboard-card prediction-lobby-card">
              <div className="prediction-timer-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '700', color: '#FF007A' }}>
                  <Zap size={16} />
                  <span>PLAY PREDICTION</span>
                </div>
                <div className="stat-pill" style={{ borderColor: secondsLeft > 5 ? '#00DFD8' : '#FF1744', color: secondsLeft > 5 ? '#00DFD8' : '#FF1744' }}>
                  <Clock size={14} />
                  <span>{lobby.status === 'ACTIVE' ? `Locks in ${secondsLeft}s` : lobby.status}</span>
                </div>
              </div>

              <div className="prediction-question">{lobby.question}</div>

              <div className="prediction-options-grid">
                <button
                  className={`prediction-btn ${selectedOption === 'OPTION_A' ? 'selected' : ''}`}
                  onClick={() => setSelectedOption('OPTION_A')}
                  disabled={lobby.status !== 'ACTIVE' || wagerStatus === 'SUBMITTED'}
                >
                  {lobby.optionA}
                </button>
                <button
                  className={`prediction-btn ${selectedOption === 'OPTION_B' ? 'selected' : ''}`}
                  onClick={() => setSelectedOption('OPTION_B')}
                  disabled={lobby.status !== 'ACTIVE' || wagerStatus === 'SUBMITTED'}
                >
                  {lobby.optionB}
                </button>
              </div>

              {lobby.status === 'ACTIVE' && wagerStatus !== 'SUBMITTED' && (
                <div className="wager-control-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px', color: '#8E9EAB' }}>Points:</span>
                    <input
                      type="number"
                      className="wager-input"
                      value={wagerPoints}
                      onChange={(e) => setWagerPoints(Math.max(10, parseInt(e.target.value) || 0))}
                      min={10}
                      max={userProfile?.pointsBalance || 1000}
                    />
                  </div>
                  <button className="wager-submit-btn" onClick={handleWagerSubmit} disabled={!selectedOption}>
                    Submit Play Prediction
                  </button>
                </div>
              )}

              {wagerStatus === 'SUBMITTED' && (
                <div className="stat-pill" style={{ alignSelf: 'flex-start', borderColor: '#00E676', color: '#00E676' }}>
                  <span>✓ Prediction Registered! Allocated {wagerPoints} Points on {selectedOption === 'OPTION_A' ? lobby.optionA : lobby.optionB}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="chat-side-panel">
          <div className="chat-tabs">
            <button className={`chat-tab-btn ${chatRoom === 'NEUTRAL' ? 'active' : ''}`} onClick={() => setChatRoom('NEUTRAL')}>
              General
            </button>
            <button className={`chat-tab-btn ${chatRoom === 'RM' ? 'active' : ''}`} onClick={() => setChatRoom('RM')}>
              Hala Madrid
            </button>
            <button className={`chat-tab-btn ${chatRoom === 'BAR' ? 'active' : ''}`} onClick={() => setChatRoom('BAR')}>
              Visca Barca
            </button>
          </div>

          <div className="chat-messages-container">
            {chatList
              .filter(msg => msg.alliance === 'NEUTRAL' || msg.alliance === chatRoom)
              .map((msg) => (
                <div key={msg.id} className={`chat-message-bubble ${msg.alliance.toLowerCase()}`}>
                  <div className="chat-message-meta">
                    <span>{msg.username}</span>
                    <span className={`chat-alliance-badge ${msg.alliance}`}>{msg.alliance}</span>
                  </div>
                  <div>{msg.text}</div>
                </div>
              ))}
            <div ref={chatEndRef} />
          </div>

          <div className="chat-input-row">
            <input
              type="text"
              className="chat-input-box"
              placeholder="Join the conversation..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendChatMessage(); }}
            />
            <button className="chat-send-btn" onClick={handleSendChatMessage}>
              <Send size={18} />
            </button>
          </div>
        </div>

        <div className="ai-assistant-container">
          <h2 style={{ fontSize: '18px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: '#00DFD8' }}>
            <Sparkles size={18} /> Conversational AI Sports Assistant
          </h2>

          <div className="ai-chat-history">
            {aiHistory.map((bubble, i) => (
              <div key={i} className={`ai-bubble ${bubble.sender}`}>
                <strong>{bubble.sender === 'user' ? 'You: ' : 'Assistant: '}</strong>
                {bubble.text}
              </div>
            ))}
            {aiLoading && <div className="ai-bubble assistant">Running vector index query...</div>}
          </div>

          <form onSubmit={handleAskAI} className="ai-input-row">
            <input
              type="text"
              className="chat-input-box"
              placeholder="Ask AI: e.g. 'head to head statistics' or 'top scorer record'"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              disabled={aiLoading}
            />
            <button type="submit" className="wager-submit-btn" style={{ width: '120px' }} disabled={aiLoading}>
              Ask Assistant
            </button>
          </form>
        </div>

        <div className="gamification-shelf">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12px', color: '#8E9EAB', fontWeight: 600 }}>USER STREAK</span>
              <span style={{ fontSize: '20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', color: '#FFD600' }}>
                <Flame size={20} fill="#FFD600" /> {userProfile?.activeStreak} Days
              </span>
            </div>
            <div style={{ width: '1px', height: '40px', backgroundColor: '#2E324D' }}></div>
            <div className="level-progress-block">
              <div className="level-progress-labels">
                <span>XP Level {userProfile?.currentLevel} Progress</span>
                <span>{userProfile ? userProfile.currentXp % 1000 : 0} / 1000 XP</span>
              </div>
              <div className="level-progress-bar-container">
                <div
                  className="level-progress-bar-fill"
                  style={{ width: `${userProfile ? (userProfile.currentXp % 1000) / 10 : 0}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '12px', color: '#8E9EAB', fontWeight: 600, textTransform: 'uppercase' }}>Unlocked Badges</span>
            <div className="badge-row">
              {userProfile?.badges.map((badge, i) => (
                <div key={i} className="badge-item active">
                  {badge}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {payoutAlert && (
        <div className="payout-overlay-alert" style={{ borderColor: payoutAlert.outcome === 'WON' ? '#00E676' : '#FF1744' }}>
          {payoutAlert.outcome === 'WON' ? (
            <>
              <Award size={24} style={{ color: '#00E676' }} />
              <div>
                <strong style={{ display: 'block', color: '#00E676' }}>PREDICTION CORRECT!</strong>
                <span style={{ fontSize: '13px', color: '#8E9EAB' }}>Payout of +{payoutAlert.payout} points credited to balance.</span>
              </div>
            </>
          ) : (
            <>
              <ShieldAlert size={24} style={{ color: '#FF1744' }} />
              <div>
                <strong style={{ display: 'block', color: '#FF1744' }}>PREDICTION INCORRECT</strong>
                <span style={{ fontSize: '13px', color: '#8E9EAB' }}>Better luck on the next live play query!</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
