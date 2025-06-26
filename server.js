const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

const games = []; // Array of games, each with { players: [{ws, symbol}], gameState, currentPlayer }

function createGame() {
    return {
        players: [],
        gameState: Array(9).fill(null),
        currentPlayer: 'X'
    };
}

function findAvailableGame() {
    // Return an existing game with < 2 players, or create a new one
    let game = games.find(g => g.players.length < 2);
    if (!game) {
        game = createGame();
        games.push(game);
        console.log(`Created new game. Total games: ${games.length}`);
    }
    return game;
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

wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    const game = findAvailableGame();
    const playerSymbol = game.players.length === 0 ? 'X' : 'O';
    game.players.push({ ws, symbol: playerSymbol });

    ws.send(JSON.stringify({
        type: 'joined',
        playerSymbol,
        gameState: game.gameState,
        currentPlayer: game.currentPlayer
    }));
    console.log(`Player ${playerSymbol} joined game ${games.indexOf(game)}. Players in game: ${game.players.length}`);

    if (game.players.length === 1) {
        ws.send(JSON.stringify({ type: 'waiting' }));
    } else if (game.players.length === 2) {
        game.players.forEach(p => {
            p.ws.send(JSON.stringify({
                type: 'start',
                currentPlayer: game.currentPlayer
            }));
        });
        console.log(`Game ${games.indexOf(game)} started with players X and O`);
    }

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`Received message in game ${games.indexOf(game)}:`, data);

            if (data.type === 'move' && data.player === game.currentPlayer && !game.gameState[data.index]) {
                game.gameState[data.index] = data.player;
                game.currentPlayer = game.currentPlayer === 'X' ? 'O' : 'X';
                const winner = checkWinner(game.gameState);
                const gameOver = winner || game.gameState.every(cell => cell);
                game.players.forEach(p => {
                    p.ws.send(JSON.stringify({
                        type: 'update',
                        gameState: game.gameState,
                        currentPlayer: game.currentPlayer,
                        gameOver,
                        winner
                    }));
                });
                console.log(`Game ${games.indexOf(game)} updated: currentPlayer=${game.currentPlayer}, gameOver=${gameOver}, winner=${winner}`);
            } else if (data.type === 'rematch') {
                game.gameState = Array(9).fill(null);
                game.currentPlayer = 'X';
                game.players.forEach(p => {
                    p.ws.send(JSON.stringify({
                        type: 'rematch',
                        playerSymbol: p.symbol,
                        gameState: game.gameState,
                        currentPlayer: game.currentPlayer
                    }));
                });
                console.log(`Game ${games.indexOf(game)} rematch started`);
            } else if (data.type === 'leave') {
                game.players = game.players.filter(p => p.ws !== ws);
                if (game.players.length) {
                    game.players[0].ws.send(JSON.stringify({ type: 'opponent_left' }));
                    console.log(`Player left game ${games.indexOf(game)}. Remaining players: ${game.players.length}`);
                } else {
                    console.log(`Game ${games.indexOf(game)} empty, removing`);
                    games.splice(games.indexOf(game), 1);
                }
            }
        } catch (e) {
            console.error('Invalid message:', e);
        }
    });

    ws.on('close', () => {
        game.players = game.players.filter(p => p.ws !== ws);
        if (game.players.length) {
            game.players[0].ws.send(JSON.stringify({ type: 'opponent_left' }));
            console.log(`Player disconnected from game ${games.indexOf(game)}. Remaining players: ${game.players.length}`);
        } else {
            console.log(`Game ${games.indexOf(game)} empty, removing`);
            games.splice(games.indexOf(game), 1);
        }
    });
});

console.log(`Server running on port ${process.env.PORT || 8080}`);
