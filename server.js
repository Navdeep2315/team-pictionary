const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const WORDS = ["lighthouse","octopus","umbrella","rocket ship","volcano","pineapple","guitar","snowman","dragon","helicopter","cactus","robot","mermaid","waterfall","treehouse"];

// Keep track of rooms, users, and game states
const rooms = {}; 

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // 1. Handle Room Joining
    socket.on('join-room', ({ username, room }) => {
        socket.join(room);
        socket.username = username;
        socket.room = room;

        // Initialize room if it doesn't exist
        if (!rooms[room]) {
            rooms[room] = {
                drawerId: null,
                currentWord: "",
                timeLeft: 60,
                timer: null,
                scores: {} // username: score
            };
        }

        // Add user to room scores
        rooms[room].scores[username] = rooms[room].scores[username] || 0;

        // Welcome player and update room details
        io.to(room).emit('update-scores', rooms[room].scores);
        logToRoom(room, `${username} has joined the room!`);
    });

    // 2. Handle Drawing
    socket.on('draw-start', (p) => {
        if (socket.room) socket.to(socket.room).emit('draw-start', p);
    });
    socket.on('draw-move', (data) => {
        if (socket.room) socket.to(socket.room).emit('draw-move', data);
    });
    socket.on('draw-clear', () => {
        if (socket.room) socket.to(socket.room).emit('draw-clear');
    });

    // 3. Handle Game/Round Loop
    socket.on('start-round', () => {
        const room = socket.room;
        if (!room || !rooms[room]) return;

        const roomState = rooms[room];
        roomState.drawerId = socket.id;
        roomState.currentWord = WORDS[Math.floor(Math.random() * WORDS.length)];
        roomState.timeLeft = 60;

        // Notify room
        io.to(roomState.drawerId).emit('you-are-drawer', { word: roomState.currentWord });
        socket.to(room).emit('new-round', { length: roomState.currentWord.length, drawer: socket.username });
        logToRoom(room, `${socket.username} is now drawing!`);

        // Manage timer
        clearInterval(roomState.timer);
        roomState.timer = setInterval(() => {
            roomState.timeLeft--;
            io.to(room).emit('timer-tick', roomState.timeLeft);
            if (roomState.timeLeft <= 0) {
                clearInterval(roomState.timer);
                io.to(room).emit('time-up', { word: roomState.currentWord });
                logToRoom(room, `Time's up! The word was "${roomState.currentWord}".`);
            }
        }, 1000);
    });

    // 4. Handle Guesses
    socket.on('guess', (guess) => {
        const room = socket.room;
        const roomState = rooms[room];
        if (!roomState || socket.id === roomState.drawerId) return;

        if (guess.toLowerCase() === roomState.currentWord.toLowerCase()) {
            clearInterval(roomState.timer);
            roomState.scores[socket.username] += 100; // Add points to guesser

            io.to(room).emit('correct-guess', { 
                username: socket.username, 
                word: roomState.currentWord,
                scores: roomState.scores 
            });
            logToRoom(room, `${socket.username} guessed the word correctly!`);
        } else {
            socket.emit('wrong-guess');
        }
    });

    socket.on('disconnect', () => {
        const room = socket.room;
        const roomState = rooms[room];
        if (roomState && socket.id === roomState.drawerId) {
            clearInterval(roomState.timer);
            io.to(room).emit('time-up', { word: roomState.currentWord, message: "The drawer disconnected." });
        }
    });
});

function logToRoom(room, message) {
    io.to(room).emit('log-message', message);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
