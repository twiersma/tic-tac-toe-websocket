// Enhanced Tic Tac Toe WebSocket server
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid'); // For optional player IDs

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });
const games = []; // Tracks all active games

function createGame() {
    return {
        id: uuidv4(),
        players: [],
        gameState: Array(9).fill(null),
        currentPlayer: 'X',
        lastActivity: Date.now()
    };
}

function findAvailableGame() {
    let game = games.find(g => g.players.length < 2);
    if (!game) {
        game = createGame();
        games.push(game);
        console.log(`Created new game (ID: ${game.id}). Total games: ${games.length}`);
    }
    return game;
}

function checkWinner(board) {
    const winningCombos = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];
    for (let combo of winningCombos) {
        const [a, b, c] = combo;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    return null;
}

wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    const game = findAvailableGame();
    const playerSymbol = game.players.length === 0 ? 'X' : 'O';
    game.players.push({ ws, symbol: playerSymbol });

    ws.send(JSON.stringify({
        type: 'joined',
        playerSymbol,
        gameState: game.gameState,
        currentPlayer: game.currentPlayer,
        gameId: game.id
    }));

    if (game.players.length === 1) {
        ws.send(JSON.stringify({ type: 'waiting' }));
    } else if (game.players.length === 2) {
        broadcast(game, {
            type: 'start',
            currentPlayer: game.currentPlayer
        });
    }

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            game.lastActivity = Date.now();

            switch (data.type) {
                case 'move':
                    if (
                        data.player === game.currentPlayer &&
                        Number.isInteger(data.index) &&
                        data.index >= 0 &&
                        data.index < 9 &&
                        !game.gameState[data.index]
                    ) {
                        game.gameState[data.index] = data.player;
                        game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X';

                        const winner = checkWinner(game.gameState);
                        const gameOver = winner || game.gameState.every(Boolean);

                        broadcast(game, {
                            type: 'update',
                            gameState: game.gameState,
                            currentPlayer: game.currentPlayer,
                            gameOver,
                            winner
                        });
                    }
                    break;
                case 'rematch':
                    game.gameState = Array(9).fill(null);
                    game.currentPlayer = 'X';
                    broadcast(game, {
                        type: 'rematch',
                        gameState: game.gameState,
                        currentPlayer: game.currentPlayer
                    });
                    break;
                case 'leave':
                    removePlayer(game, ws);
                    break;
            }
        } catch (err) {
            console.error('Invalid message:', err);
        }
    });

    ws.on('close', () => {
        removePlayer(game, ws);
    });
});

function broadcast(game, message) {
    game.players.forEach(p => {
        p.ws.send(JSON.stringify(message));
    });
}

function removePlayer(game, ws) {
    game.players = game.players.filter(p => p.ws !== ws);
    if (game.players.length === 0) {
        console.log(`Game ${game.id} is empty. Removing.`);
        games.splice(games.indexOf(game), 1);
    } else {
        game.players[0].ws.send(JSON.stringify({ type: 'opponent_left' }));
        console.log(`Player left game ${game.id}. One player remains.`);
    }
}

// Clean up inactive games every 10 minutes
setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    games.forEach((game, index) => {
        if (game.players.length === 1 && game.lastActivity < cutoff) {
            console.log(`Removing stale game ${game.id}`);
            game.players[0].ws.close();
            games.splice(index, 1);
        }
    });
}, 5 * 60 * 1000); // Run every 5 minutes

console.log(`WebSocket server running on port ${process.env.PORT || 8080}`);
