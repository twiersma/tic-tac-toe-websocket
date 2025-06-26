// Enhanced WebSocket server for Tic Tac Toe with game cleanup, UUID game IDs, and optional stats
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

const games = new Map(); // Map of gameId -> game object

function createGame() {
    const gameId = uuidv4();
    const game = {
        id: gameId,
        players: [], // { ws, symbol, lastSeen }
        gameState: Array(9).fill(null),
        currentPlayer: 'X',
        lastUpdated: Date.now()
    };
    games.set(gameId, game);
    return game;
}

function findAvailableGame() {
    for (const game of games.values()) {
        if (game.players.length < 2) return game;
    }
    return createGame();
}

function checkWinner(board) {
    const combos = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];
    for (let [a, b, c] of combos) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    return null;
}

function sendToGame(game, payload) {
    game.players.forEach(p => {
        if (p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify(payload));
        }
    });
    game.lastUpdated = Date.now();
}

function removeGame(game) {
    games.delete(game.id);
    console.log(`Game ${game.id} removed. Active games: ${games.size}`);
}

// Clean up idle games every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [id, game] of games.entries()) {
        const isEmpty = game.players.length === 0;
        const isIdle = now - game.lastUpdated > 60 * 60 * 1000; // 1 hour
        if (isEmpty || isIdle) {
            removeGame(game);
        }
    }
}, 5 * 60 * 1000);

wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    const game = findAvailableGame();
    const symbol = game.players.length === 0 ? 'X' : 'O';
    const player = { ws, symbol, lastSeen: Date.now() };
    game.players.push(player);

    ws.send(JSON.stringify({
        type: 'joined',
        playerSymbol: symbol,
        gameState: game.gameState,
        currentPlayer: game.currentPlayer
    }));

    if (game.players.length === 1) {
        ws.send(JSON.stringify({ type: 'waiting' }));
    } else if (game.players.length === 2) {
        sendToGame(game, {
            type: 'start',
            currentPlayer: game.currentPlayer
        });
    }

    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);
            player.lastSeen = Date.now();

            if (data.type === 'move' && data.player === game.currentPlayer && !game.gameState[data.index]) {
                game.gameState[data.index] = data.player;
                game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X';
                const winner = checkWinner(game.gameState);
                const gameOver = winner || game.gameState.every(cell => cell);

                sendToGame(game, {
                    type: 'update',
                    gameState: game.gameState,
                    currentPlayer: game.currentPlayer,
                    gameOver,
                    winner
                });
            }

            else if (data.type === 'rematch') {
                game.gameState = Array(9).fill(null);
                game.currentPlayer = 'X';
                sendToGame(game, {
                    type: 'rematch',
                    playerSymbol: player.symbol,
                    gameState: game.gameState,
                    currentPlayer: game.currentPlayer
                });
            }

            else if (data.type === 'leave') {
                game.players = game.players.filter(p => p.ws !== ws);
                sendToGame(game, { type: 'opponent_left' });
            }

        } catch (err) {
            console.error('Invalid message:', err);
        }
    });

    ws.on('close', () => {
        game.players = game.players.filter(p => p.ws !== ws);
        if (game.players.length > 0) {
            sendToGame(game, { type: 'opponent_left' });
        } else {
            removeGame(game);
        }
    });
});

console.log(`WebSocket server running on port ${process.env.PORT || 8080}`);
