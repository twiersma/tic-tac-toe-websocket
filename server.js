const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

let rooms = {};

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'join':
                handleJoin(ws, data);
                break;
            case 'move':
                handleMove(ws, data);
                break;
            case 'rematch':
                handleRematch(ws, data);
                break;
            'leave':
                handleLeave(ws, data);
                break;
        }
    });

    ws.on('close', () => {
        handleLeave(ws, {});
        console.log('Client disconnected');
    });
});

function handleJoin(ws, data) {
    let roomId = findOrCreateRoom();
    ws.roomId = roomId;
    ws.playerSymbol = rooms[roomId].players.length === 0 ? 'X' : 'O';
    rooms[roomId].players.push(ws);

    ws.send(JSON.stringify({
        type: 'joined',
        roomId: roomId,
        playerSymbol: ws.playerSymbol,
        gameState: rooms[roomId].gameState,
        currentPlayer: rooms[roomId].currentPlayer
    }));

    if (rooms[roomId].players.length === 2) {
        rooms[roomId].players.forEach(player => {
            player.send(JSON.stringify({
                type: 'start',
                currentPlayer: rooms[roomId].currentPlayer
            }));
        });
    } else {
        ws.send(JSON.stringify({ type: 'waiting' }));
    }
}

function findOrCreateRoom() {
    for (let id in rooms) {
        if (rooms[id].players.length < 2 && !rooms[id].gameOver) {
            return id;
        }
    }

    let newRoomId = Math.random().toString(36).substr(2, 9);
    rooms[newRoomId] = {
        players: [],
        gameState: Array(9).fill(null),
        currentPlayer: 'X',
        gameOver: false
    };
    return newRoomId;
}

function handleMove(ws, data) {
    const room = rooms[ws.roomId];
    if (!room || room.gameOver || room.players.length < 2) return;

    if (ws.playerSymbol !== room.currentPlayer || room.gameState[data.index]) return;

    room.gameState[data.index] = ws.playerSymbol;
    room.currentPlayer = room.currentPlayer === 'X' ? 'O' : 'X';

    const winner = checkWinner(room.gameState);
    if (winner || !room.gameState.includes(null)) {
        room.gameOver = true;
    }

    room.players.forEach(player => {
        player.send(JSON.stringify({
            type: 'update',
            gameState: room.gameState,
            currentPlayer: room.currentPlayer,
            winner: winner,
            gameOver: room.gameOver
        }));
    });
}

function handleRematch(ws, data) {
    const room = rooms[ws.roomId];
    if (!room || room.players.length < 2) return;

    room.rematchRequests = room.rematchRequests || new Set();
    room.rematchRequests.add(ws);

    if (room.rematchRequests.size === 2) {
        room.gameState = Array(9).fill(null);
        room.currentPlayer = 'X';
        room.gameOver = false;
        room.rematchRequests.clear();

        room.players.forEach((player, index) => {
            player.playerSymbol = index === 0 ? 'X' : 'O';
            player.send(JSON.stringify({
                type: 'rematch',
                gameState: room.gameState,
                currentPlayer: room.currentPlayer,
                playerSymbol: player.playerSymbol
            }));
        });
    } else {
        ws.send(JSON.stringify({ type: 'waiting_rematch' }));
    }
}

function handleLeave(ws, data) {
    const roomId = ws.roomId;
    if (!roomId || !rooms[roomId]) return;

    rooms[roomId].players = rooms[roomId].players.filter(player => player !== ws);
    if (rooms[roomId].players.length === 0) {
        delete rooms[roomId];
    } else {
        rooms[roomId].gameOver = true;
        rooms[roomId].players.forEach(player => {
            player.send(JSON.stringify({ type: 'opponent_left' }));
        });
    }
}

function checkWinner(board) {
    const winningCombinations = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];

    for (let combo of winningCombinations) {
        if (board[combo[0]] && board[combo[0]] === board[combo[1]] && board[combo[0]] === board[combo[2]]) {
            return board[combo[0]];
        }
    }
    return null;
}

console.log('WebSocket server running');
