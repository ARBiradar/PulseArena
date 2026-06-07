const express = require('express');
const http = require('http');
const ws = require('ws');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

const PORT = process.env.PORT || 8080;

const matchState = {
  matchId: "8bb9a3f2-1200-47b7-849a-e152ff13b0aa",
  sportType: "Soccer",
  homeTeam: "Real Madrid",
  awayTeam: "Barcelona",
  status: "LIVE",
  homeScore: 1,
  awayScore: 1,
  possession: 52,
  lastPlay: "Barcelona is building an attack from the midfield.",
  minute: 68,
  second: 12
};

const users = {
  "test-user-id": {
    userId: "test-user-id",
    username: "RealMadridFan99",
    currentLevel: 4,
    currentXp: 3500,
    pointsBalance: 1250,
    activeStreak: 5,
    badges: ["First Prediction", "Streak Starter"]
  }
};

let activePredictionLobby = {
  lobbyId: "ac82d1fe-2856-4c7b-bba2-58ef713ac991",
  question: "Will Barcelona score in the next 3 minutes?",
  optionA: "Yes",
  optionB: "No",
  status: "ACTIVE",
  lockTime: Date.now() + 25000,
  wagers: []
};

const chatMessages = [
  { id: 1, username: "RM_Gamer", alliance: "RM", text: "Hala Madrid! Let's win this." },
  { id: 2, username: "BarcaCore", alliance: "BAR", text: "Visca el Barca! Equalizer is coming." }
];

const mockStatsDatabase = [
  { query: "head to head", answer: "Real Madrid and Barcelona have played 250 El Clasicos. Real Madrid won 102, Barcelona won 99, with 49 draws." },
  { query: "last goal", answer: "The last goal was scored by Karim Benzema in the 42nd minute from a header assist." },
  { query: "possession history", answer: "Over the last 10 matches, Barcelona has averaged 56% possession against Real Madrid's 44%." },
  { query: "top scorer", answer: "Lionel Messi holds the record for most El Clasico goals in history with 26 goals, followed by Cristiano Ronaldo with 18." }
];

const toxicWords = ["hate", "scam", "cheat", "bastard", "idiot"];

nextApp.prepare().then(() => {
  const app = express();
  app.use(express.json());

  app.post('/api/v1/auth/login', (req, res) => {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error_code: "ERR_AUTH_INVALID_USERNAME", message: "Username is required" });
    }
    const token = "mock-jwt-token-value";
    return res.status(200).json({
      access_token: token,
      expires_in: 900,
      token_type: "Bearer"
    });
  });

  app.get('/api/v1/profile', (req, res) => {
    return res.status(200).json(users["test-user-id"]);
  });

  app.post('/api/v1/predictions/submit', (req, res) => {
    const { lobby_id, chosen_option, points_wagered } = req.body;
    const user = users["test-user-id"];
    
    if (activePredictionLobby.status !== "ACTIVE" || Date.now() > activePredictionLobby.lockTime) {
      return res.status(400).json({ error_code: "ERR_PRED_LOCK_EXPIRED", message: "Prediction lobby is locked" });
    }
    if (points_wagered <= 0 || points_wagered > user.pointsBalance) {
      return res.status(400).json({ error_code: "ERR_PRED_INSUFFICIENT_FUNDS", message: "Insufficient point balance" });
    }

    user.pointsBalance -= points_wagered;
    activePredictionLobby.wagers.push({ userId: user.userId, chosenOption: chosen_option, points: points_wagered });

    return res.status(200).json({
      submission_id: "sub-uuid-" + Math.floor(Math.random() * 10000),
      points_balance: user.pointsBalance,
      status: "ACCEPTED"
    });
  });

  app.post('/api/v1/ai/query', (req, res) => {
    const { query } = req.body;
    if (!query || query.length < 3) {
      return res.status(400).json({ error_code: "ERR_AI_QUERY_LENGTH", message: "Query length must be at least 3 characters" });
    }
    
    const isToxic = toxicWords.some(word => query.toLowerCase().includes(word));
    if (isToxic) {
      return res.status(400).json({ error_code: "ERR_AI_INVALID_PROMPT", message: "Query contains unapproved language or patterns" });
    }

    const matched = mockStatsDatabase.find(item => query.toLowerCase().includes(item.query));
    const answer = matched ? matched.answer : "I couldn't locate specific historical data in my index for this query. Try asking about 'head to head', 'last goal', or 'top scorer'.";
    
    return res.status(200).json({ answer });
  });

  app.get('/api/v1/matches/active', (req, res) => {
    return res.status(200).json([matchState]);
  });

  app.all('*', (req, res) => {
    return handle(req, res);
  });

  const server = http.createServer(app);
  const wss = new ws.Server({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    if (pathname === '/ws/v1/connect') {
      wss.handleUpgrade(request, socket, head, (wsConn) => {
        wss.emit('connection', wsConn, request);
      });
    } else {
      socket.destroy();
    }
  });

  const connectedClients = new Set();

  wss.on('connection', (wsConn) => {
    connectedClients.add(wsConn);
    
    wsConn.send(JSON.stringify({
      event_type: "WELCOME",
      data: {
        match: matchState,
        activeLobby: activePredictionLobby,
        recentChat: chatMessages
      }
    }));

    wsConn.on('message', (message) => {
      try {
        const payload = JSON.parse(message);
        if (payload.type === "HEARTBEAT") {
          wsConn.send(JSON.stringify({ type: "HEARTBEAT_ACK" }));
        } else if (payload.type === "CHAT_MESSAGE") {
          const { alliance, text } = payload.data;
          const isToxic = toxicWords.some(word => text.toLowerCase().includes(word));
          if (isToxic) {
            wsConn.send(JSON.stringify({ event_type: "ERROR", data: { error_code: "ERR_CHAT_MESSAGE_BLOCKED" } }));
            return;
          }
          const msgObj = {
            id: chatMessages.length + 1,
            username: users["test-user-id"].username,
            alliance,
            text
          };
          chatMessages.push(msgObj);
          if (chatMessages.length > 50) chatMessages.shift();
          
          broadcast(JSON.stringify({ event_type: "CHAT_MESSAGE_RECEIVED", data: msgObj }));
        }
      } catch (err) {
        wsConn.send(JSON.stringify({ event_type: "ERROR", data: { error_code: "ERR_INVALID_FRAME" } }));
      }
    });

    wsConn.on('close', () => {
      connectedClients.delete(wsConn);
    });
  });

  function broadcast(payload) {
    for (const client of connectedClients) {
      if (client.readyState === ws.OPEN) {
        client.send(payload);
      }
    }
  }

  setInterval(() => {
    matchState.second += 4;
    if (matchState.second >= 60) {
      matchState.second -= 60;
      matchState.minute += 1;
    }
    const plays = [
      "Real Madrid attacks from the left wing.",
      "Corner kick awarded to Real Madrid.",
      "Dangerous shot blocked by Barcelona goalkeeper!",
      "Yellow card shown to Barcelona defender.",
      "Ball intercepted in midfield by Real Madrid.",
      "Barcelona mounts a quick counter-attack."
    ];
    if (Math.random() > 0.7) {
      matchState.lastPlay = plays[Math.floor(Math.random() * plays.length)];
      matchState.possession = Math.floor(Math.random() * 20) + 40;
    }
    broadcast(JSON.stringify({ event_type: "TELEMETRY_UPDATE", match_id: matchState.matchId, data: matchState }));
  }, 4000);

  setInterval(() => {
    const isLobbyActive = activePredictionLobby.status === "ACTIVE";
    if (isLobbyActive && Date.now() > activePredictionLobby.lockTime) {
      activePredictionLobby.status = "RESOLVING";
      broadcast(JSON.stringify({ event_type: "PRED_LOBBY_LOCKED", lobby_id: activePredictionLobby.lobbyId }));
      
      setTimeout(() => {
        const winningOption = Math.random() > 0.5 ? "OPTION_A" : "OPTION_B";
        activePredictionLobby.status = "RESOLVED";
        activePredictionLobby.winningOption = winningOption;
        activePredictionLobby.resolvedTime = Date.now();
        
        const user = users["test-user-id"];
        let userPayout = 0;
        let predictionOutcome = "LOST";
        
        activePredictionLobby.wagers.forEach(wager => {
          if (wager.userId === user.userId) {
            if (wager.chosenOption === winningOption) {
              userPayout = wager.points * 2;
              user.pointsBalance += userPayout;
              user.currentXp += 250;
              predictionOutcome = "WON";
            } else {
              user.currentXp += 50;
            }
          }
        });

        broadcast(JSON.stringify({
          event_type: "PRED_LOBBY_RESOLVED",
          lobby_id: activePredictionLobby.lobbyId,
          winning_option: winningOption,
          payout_updates: activePredictionLobby.wagers.map(w => ({
            userId: w.userId,
            outcome: w.chosenOption === winningOption ? "WON" : "LOST",
            payout: w.chosenOption === winningOption ? w.points * 2 : 0
          }))
        }));

        if (activePredictionLobby.wagers.some(w => w.userId === user.userId)) {
          let leveledUp = false;
          const oldLevel = user.currentLevel;
          const newLevel = Math.floor(user.currentXp / 1000) + 1;
          if (newLevel > oldLevel) {
            user.currentLevel = newLevel;
            leveledUp = true;
          }

          broadcast(JSON.stringify({
            event_type: "USER_XP_SETTLEMENT",
            data: {
              userId: user.userId,
              pointsBalance: user.pointsBalance,
              currentXp: user.currentXp,
              leveledUp,
              currentLevel: user.currentLevel,
              outcome: predictionOutcome,
              payout: userPayout
            }
          }));
        }

        setTimeout(() => {
          const lobbyQuestions = [
            { question: "Will the next foul result in a yellow card?", optA: "Yes", optB: "No" },
            { question: "Will the next shot target the top corner?", optA: "Yes", optB: "No" },
            { question: "Will Real Madrid take a corner within the next 2 minutes?", optA: "Yes", optB: "No" },
            { question: "Will there be a substitution before the 75th minute?", optA: "Yes", optB: "No" }
          ];
          const nextQ = lobbyQuestions[Math.floor(Math.random() * lobbyQuestions.length)];
          
          activePredictionLobby = {
            lobbyId: "lobby-uuid-" + Math.floor(Math.random() * 10000),
            question: nextQ.question,
            optionA: nextQ.optA,
            optionB: nextQ.optB,
            status: "ACTIVE",
            lockTime: Date.now() + 25000,
            wagers: []
          };

          broadcast(JSON.stringify({
            event_type: "PRED_WINDOW_OPEN",
            match_id: matchState.matchId,
            lobby_id: activePredictionLobby.lobbyId,
            question: activePredictionLobby.question,
            lock_timestamp: activePredictionLobby.lockTime,
            options: [
              { key: "OPTION_A", value: activePredictionLobby.optionA },
              { key: "OPTION_B", value: activePredictionLobby.optionB }
            ]
          }));
        }, 5000);

      }, 2000);
    }
  }, 1000);

  setInterval(() => {
    if (connectedClients.size > 0) {
      const bots = [
        { username: "HalaM12", alliance: "RM", text: "Nice play! Keep pressing." },
        { username: "MessiFanatic", alliance: "BAR", text: "Need sub now." },
        { username: "ClasicoWatch", alliance: "NEUTRAL", text: "This is intense." }
      ];
      const selectedBot = bots[Math.floor(Math.random() * bots.length)];
      const msgObj = {
        id: chatMessages.length + 1,
        username: selectedBot.username,
        alliance: selectedBot.alliance,
        text: selectedBot.text
      };
      chatMessages.push(msgObj);
      if (chatMessages.length > 50) chatMessages.shift();
      
      broadcast(JSON.stringify({ event_type: "CHAT_MESSAGE_RECEIVED", data: msgObj }));
    }
  }, 7000);

  server.listen(PORT, () => {
    console.log(`Server starting on port ${PORT}`);
  });
}).catch((ex) => {
  console.error(ex.stack);
  process.exit(1);
});
