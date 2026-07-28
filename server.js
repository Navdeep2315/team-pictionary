const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const WORDS = ["lighthouse","octopus","umbrella","rocket ship","volcano","pineapple","guitar","snowman","dragon","helicopter","cactus","robot","mermaid","waterfall","treehouse"];

const rooms = {}; 

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // 1. Join Room
    socket.on('join-room', ({ username, room }) => {
        socket.join(room);
        socket.username = username;
        socket.room = room;

        if (!rooms[room]) {
            rooms[room] = {
                drawerId: null,
                currentWord: "",
                timeLeft: 60,
                timer: null,
                scores: {} 
            };
        }

        rooms[room].scores[username] = rooms[room].scores[username] || 0;
        io.to(room).emit('update-scores', rooms[room].scores);
        io.to(room).emit('log-message', `👋 <b>${username}</b> has joined the room!`);
    });

    // 2. Drawing Sync
    socket.on('draw-start', (p) => { if (socket.room) socket.to(socket.room).emit('draw-start', p); });
    socket.on('draw-move', (data) => { if (socket.room) socket.to(socket.room).emit('draw-move', data); });
    socket.on('draw-clear', () => { if (socket.room) socket.to(socket.room).emit('draw-clear'); });

    // 3. Game Loop
    socket.on('start-round', () => {
        const room = socket.room;
        if (!room || !rooms[room]) return;

        const roomState = rooms[room];
        roomState.drawerId = socket.id;
        roomState.currentWord = WORDS[Math.floor(Math.random() * WORDS.length)];
        roomState.timeLeft = 60;

        io.to(roomState.drawerId).emit('you-are-drawer', { word: roomState.currentWord });
        socket.to(room).emit('new-round', { length: roomState.currentWord.length, drawer: socket.username });
        io.to(room).emit('log-message', `✏️ <b>${socket.username}</b> is now drawing!`);

        clearInterval(roomState.timer);
        roomState.timer = setInterval(() => {
            roomState.timeLeft--;
            io.to(room).emit('timer-tick', roomState.timeLeft);
            if (roomState.timeLeft <= 0) {
                clearInterval(roomState.timer);
                io.to(room).emit('time-up', { word: roomState.currentWord });
                io.to(room).emit('log-message', `⏰ Time's up! The word was "<b>${roomState.currentWord}</b>".`);
            }
        }, 1000);
    });

    // 4. Guesses & Live Chat
    socket.on('guess', (guess) => {
        const room = socket.room;
        const roomState = rooms[room];
        if (!roomState || socket.id === roomState.drawerId) return;

        if (guess.toLowerCase() === roomState.currentWord.toLowerCase()) {
            clearInterval(roomState.timer);
            
            const timeBonus = roomState.timeLeft > 0 ? Math.ceil(roomState.timeLeft / 6) : 0;
            const pointsEarned = 100 + (timeBonus * 10);
            roomState.scores[socket.username] += pointsEarned; 

            io.to(room).emit('correct-guess', { 
                username: socket.username, 
                word: roomState.currentWord,
                scores: roomState.scores 
            });
            io.to(room).emit('log-message', `✅ <b>${socket.username}</b> guessed it! (+${pointsEarned} pts)`);
        } else {
            socket.emit('wrong-guess');
            // This line guarantees wrong guesses broadcast to the whole room
            io.to(room).emit('log-message', `💬 <b>${socket.username}:</b> ${guess}`);
        }
    });

    socket.on('disconnect', () => {
        const room = socket.room;
        const roomState = rooms[room];
        if (roomState && socket.id === roomState.drawerId) {
            clearInterval(roomState.timer);
            io.to(room).emit('time-up', { word: roomState.currentWord, message: "Drawer left." });
            io.to(room).emit('log-message', `❌ The drawer disconnected. Round ended.`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
