// server.js (Polished version with game IDs, optional spectators, and stat tracking)
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid'); // Requires: npm install uuid

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

const games = new Map(); // Map<gameId, gameObject>
const playerStats = new Map(); // Map<playerId, { wins, losses, draws }>

function createGame() {
    const gameId = uuidv4();
    const game = {
        id: gameId,
        players: [], // { ws, symbol, id }
        spectators: [],
        gameState: Array(9).fill(null),
        currentPlayer: 'X',
        createdAt: Date.now(),
        timeout: null
    };
    games.set(gameId, game);
    return game;
}

function findOrCreateGame() {
    for (let game of games.values()) {
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
    for (const [a, b, c] of combos) {
        if (board[a] && board[a] === board[b] && board[b] === board[c]) {
            return board[a];
        }
    }
    return null;
}

function updateStats(playerId, result) {
    if (!playerStats.has(playerId)) {
        playerStats.set(playerId, { wins: 0, losses: 0, draws: 0 });
    }
    const stats = playerStats.get(playerId);
    if (result === 'win') stats.wins++;
    else if (result === 'loss') stats.losses++;
    else stats.draws++;
}

function broadcast(game, message) {
    game.players.concat(game.spectators).forEach(p => p.ws.send(JSON.stringify(message)));
}

wss.on('connection', (ws) => {
    console.log('New WebSocket connection');

    const game = findOrCreateGame();
    let playerId = uuidv4();

    if (game.players.length < 2) {
        const symbol = game.players.length === 0 ? 'X' : 'O';
        game.players.push({ ws, symbol, id: playerId });

        ws.send(JSON.stringify({
            type: 'joined',
            playerSymbol: symbol,
            gameId: game.id,
            gameState: game.gameState,
            currentPlayer: game.currentPlayer
        }));

        if (game.players.length === 1) {
            ws.send(JSON.stringify({ type: 'waiting' }));
        } else {
            broadcast(game, {
                type: 'start',
                currentPlayer: game.currentPlayer
            });
        }
    } else {
        game.spectators.push({ ws });
        ws.send(JSON.stringify({
            type: 'spectator',
            gameId: game.id,
            gameState: game.gameState,
            currentPlayer: game.currentPlayer
        }));
    }

    ws.on('message', (msg) => {
        let data;
        try {
            data = JSON.parse(msg);
        } catch (e) {
            console.error('Invalid JSON:', e);
            return;
        }

        if (data.type === 'move') {
            const player = game.players.find(p => p.ws === ws);
            if (!player || game.currentPlayer !== player.symbol || game.gameState[data.index]) return;

            game.gameState[data.index] = player.symbol;
            const winner = checkWinner(game.gameState);
            const draw = game.gameState.every(cell => cell);
            const gameOver = !!winner || draw;

            if (gameOver) {
                const loser = game.players.find(p => p.symbol !== winner)?.id;
                const winnerId = game.players.find(p => p.symbol === winner)?.id;

                if (winner) {
                    updateStats(winnerId, 'win');
                    updateStats(loser, 'loss');
                } else {
                    game.players.forEach(p => updateStats(p.id, 'draw'));
                }
            }

            broadcast(game, {
                type: 'update',
                gameState: game.gameState,
                currentPlayer: game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X',
                gameOver,
                winner
            });
        } else if (data.type === 'rematch') {
            game.gameState = Array(9).fill(null);
            game.currentPlayer = 'X';
            broadcast(game, {
                type: 'rematch',
                gameState: game.gameState,
                currentPlayer: game.currentPlayer
            });
        } else if (data.type === 'stats') {
            const stats = playerStats.get(data.playerId) || { wins: 0, losses: 0, draws: 0 };
            ws.send(JSON.stringify({ type: 'stats', stats }));
        }
    });

    ws.on('close', () => {
        game.players = game.players.filter(p => p.ws !== ws);
        game.spectators = game.spectators.filter(s => s.ws !== ws);

        if (game.players.length === 0 && game.spectators.length === 0) {
            games.delete(game.id);
            console.log(`Game ${game.id} removed`);
        } else {
            broadcast(game, { type: 'opponent_left' });
        }
    });
});

console.log(`WebSocket server running on port ${process.env.PORT || 8080}`);
