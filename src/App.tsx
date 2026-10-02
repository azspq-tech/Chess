import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  GameState,
  Position,
  Move,
  PieceType,
  PieceColor,
  Piece,
  PIECE_SYMBOLS,
  PIECE_VALUES,
  createInitialGameState,
  getLegalMoves,
  makeMove,
  getBestMove,
  playMoveSound,
  playCaptureSound,
  playCheckSound,
  playCastleSound,
} from './chess/engine';

// ==================== TIMER HOOK ====================
function useChessClock(initialTime: number, enabled: boolean) {
  const [whiteTime, setWhiteTime] = useState(initialTime);
  const [blackTime, setBlackTime] = useState(initialTime);
  const [activeColor, setActiveColor] = useState<PieceColor | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (enabled && activeColor) {
      intervalRef.current = setInterval(() => {
        if (activeColor === 'white') {
          setWhiteTime(prev => {
            if (prev <= 0) return 0;
            return prev - 0.1;
          });
        } else {
          setBlackTime(prev => {
            if (prev <= 0) return 0;
            return prev - 0.1;
          });
        }
      }, 100);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, activeColor]);

  const switchTurn = useCallback((color: PieceColor) => {
    setActiveColor(color);
  }, []);

  const reset = useCallback(() => {
    setWhiteTime(initialTime);
    setBlackTime(initialTime);
    setActiveColor(null);
  }, [initialTime]);

  const isTimedOut = whiteTime <= 0 || blackTime <= 0;
  const timedOutColor = whiteTime <= 0 ? 'white' : blackTime <= 0 ? 'black' : null;

  return { whiteTime, blackTime, activeColor, switchTurn, reset, isTimedOut, timedOutColor };
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ==================== PROMOTION MODAL ====================
function PromotionModal({ color, onSelect }: { color: PieceColor; onSelect: (type: PieceType) => void }) {
  const pieces: PieceType[] = ['queen', 'rook', 'bishop', 'knight'];
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-2xl p-6 shadow-2xl border border-gray-600">
        <h3 className="text-white text-lg font-bold mb-4 text-center">Promote Pawn</h3>
        <div className="flex gap-3">
          {pieces.map(type => (
            <button
              key={type}
              onClick={() => onSelect(type)}
              className="w-16 h-16 md:w-20 md:h-20 flex items-center justify-center text-4xl md:text-5xl
                bg-gray-700 hover:bg-amber-600 rounded-xl transition-all duration-200
                hover:scale-110 active:scale-95 border border-gray-500 hover:border-amber-400"
            >
              {PIECE_SYMBOLS[color][type]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== MAIN APP ====================
export default function App() {
  const [gameState, setGameState] = useState<GameState>(createInitialGameState());
  const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);
  const [legalMoves, setLegalMoves] = useState<Position[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [gameMode, setGameMode] = useState<'pvp' | 'bot'>('pvp');
  const [botThinking, setBotThinking] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<{ move: Move; state: GameState } | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Position; to: Position } | null>(null);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [gameOver, setGameOver] = useState<string | null>(null);
  const [historyScrollRef, setHistoryScrollRef] = useState<HTMLDivElement | null>(null);

  const clock = useChessClock(timerMinutes * 60, timerEnabled);
  const moveListRef = useRef<HTMLDivElement>(null);

  // Auto-scroll move history
  useEffect(() => {
    if (moveListRef.current) {
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
    }
  }, [gameState.moveHistory.length]);

  // Check game over conditions
  useEffect(() => {
    if (gameState.isCheckmate) {
      const winner = gameState.currentTurn === 'white' ? 'Black' : 'White';
      setGameOver(`Checkmate! ${winner} wins!`);
      if (timerEnabled) clock.switchTurn(null as any);
    } else if (gameState.isStalemate) {
      setGameOver('Stalemate! Draw.');
      if (timerEnabled) clock.switchTurn(null as any);
    } else if (clock.isTimedOut && timerEnabled) {
      const winner = clock.timedOutColor === 'white' ? 'Black' : 'White';
      setGameOver(`Time's up! ${winner} wins!`);
    }
  }, [gameState.isCheckmate, gameState.isStalemate, clock.isTimedOut]);

  // Bot move
  useEffect(() => {
    if (gameMode === 'bot' && gameState.currentTurn === 'black' && !gameState.isCheckmate && !gameState.isStalemate && !pendingPromotion) {
      setBotThinking(true);
      const timer = setTimeout(() => {
        const bestMove = getBestMove(gameState, 3);
        if (bestMove) {
          const newState = makeMove(gameState, bestMove);
          setGameState(newState);
          setLastMove({ from: bestMove.from, to: bestMove.to });

          if (bestMove.captured || bestMove.isEnPassant) playCaptureSound();
          else if (bestMove.isCastling) playCastleSound();
          else playMoveSound();
          if (newState.isCheck) setTimeout(playCheckSound, 100);

          if (timerEnabled) clock.switchTurn('white');
        }
        setBotThinking(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [gameState, gameMode, pendingPromotion]);

  const handleSquareClick = useCallback((row: number, col: number) => {
    if (gameState.isCheckmate || gameState.isStalemate || pendingPromotion) return;
    if (botThinking) return;
    if (gameMode === 'bot' && gameState.currentTurn === 'black') return;

    const displayRow = flipped ? 7 - row : row;
    const displayCol = flipped ? 7 - col : col;

    const clickedPiece = gameState.board[displayRow][displayCol];

    // If a square is already selected
    if (selectedSquare) {
      // Check if clicked square is a legal move
      const isLegal = legalMoves.some(m => m.row === displayRow && m.col === displayCol);

      if (isLegal) {
        // Execute move
        const piece = gameState.board[selectedSquare.row][selectedSquare.col]!;
        const isCapture = !!gameState.board[displayRow][displayCol] ||
          (piece.type === 'pawn' && gameState.enPassantTarget &&
           displayRow === gameState.enPassantTarget.row && displayCol === gameState.enPassantTarget.col);
        const isCastling = piece.type === 'king' && Math.abs(displayCol - selectedSquare.col) === 2;

        // Check for pawn promotion
        if (piece.type === 'pawn' && (displayRow === 0 || displayRow === 7)) {
          const isEP = !!(piece.type === 'pawn' && gameState.enPassantTarget &&
            displayRow === gameState.enPassantTarget.row && displayCol === gameState.enPassantTarget.col);
          const move: Move = {
            from: selectedSquare,
            to: { row: displayRow, col: displayCol },
            piece,
            captured: gameState.board[displayRow][displayCol] || undefined,
            isEnPassant: isEP || undefined,
            isCastling: isCastling ? (displayCol > selectedSquare.col ? 'kingside' : 'queenside') : undefined,
          };
          setPendingPromotion({ move, state: gameState });
          setSelectedSquare(null);
          setLegalMoves([]);
          return;
        }

        const isEP = !!(piece.type === 'pawn' && gameState.enPassantTarget &&
          displayRow === gameState.enPassantTarget.row && displayCol === gameState.enPassantTarget.col);
        const move: Move = {
          from: selectedSquare,
          to: { row: displayRow, col: displayCol },
          piece,
          captured: gameState.board[displayRow][displayCol] || undefined,
          isEnPassant: isEP || undefined,
          isCastling: isCastling ? (displayCol > selectedSquare.col ? 'kingside' : 'queenside') : undefined,
        };

        const newState = makeMove(gameState, move);
        setGameState(newState);
        setLastMove({ from: selectedSquare, to: { row: displayRow, col: displayCol } });
        setSelectedSquare(null);
        setLegalMoves([]);

        // Sound effects
        if (isCapture) playCaptureSound();
        else if (isCastling) playCastleSound();
        else playMoveSound();
        if (newState.isCheck) setTimeout(playCheckSound, 100);

        if (timerEnabled) {
          clock.switchTurn(newState.currentTurn);
        }
        return;
      }

      // If clicked on own piece, select it instead
      if (clickedPiece && clickedPiece.color === gameState.currentTurn) {
        setSelectedSquare({ row: displayRow, col: displayCol });
        setLegalMoves(getLegalMoves(gameState.board, { row: displayRow, col: displayCol }, gameState.enPassantTarget));
        return;
      }

      // Deselect
      setSelectedSquare(null);
      setLegalMoves([]);
      return;
    }

    // Select a piece
    if (clickedPiece && clickedPiece.color === gameState.currentTurn) {
      setSelectedSquare({ row: displayRow, col: displayCol });
      setLegalMoves(getLegalMoves(gameState.board, { row: displayRow, col: displayCol }, gameState.enPassantTarget));
    }
  }, [gameState, selectedSquare, legalMoves, flipped, gameMode, botThinking, pendingPromotion, timerEnabled, clock]);

  const handlePromotion = useCallback((type: PieceType) => {
    if (!pendingPromotion) return;
    const move = { ...pendingPromotion.move, promotion: type };
    const newState = makeMove(pendingPromotion.state, move);
    setGameState(newState);
    setLastMove({ from: move.from, to: move.to });
    setPendingPromotion(null);

    playCaptureSound();
    if (newState.isCheck) setTimeout(playCheckSound, 100);

    if (timerEnabled) clock.switchTurn(newState.currentTurn);
  }, [pendingPromotion, timerEnabled, clock]);

  const handleNewGame = useCallback(() => {
    setGameState(createInitialGameState());
    setSelectedSquare(null);
    setLegalMoves([]);
    setLastMove(null);
    setGameOver(null);
    setPendingPromotion(null);
    setBotThinking(false);
    clock.reset();
  }, [clock]);

  const handleUndo = useCallback(() => {
    if (gameState.moveHistory.length === 0) return;
    // For bot mode, undo two moves
    const movesToUndo = (gameMode === 'bot' && gameState.moveHistory.length >= 2) ? 2 : 1;
    let state = createInitialGameState();
    const moves = gameState.moveHistory.slice(0, gameState.moveHistory.length - movesToUndo);
    for (const move of moves) {
      state = makeMove(state, move);
    }
    setGameState(state);
    setSelectedSquare(null);
    setLegalMoves([]);
    setGameOver(null);
    setPendingPromotion(null);

    if (state.moveHistory.length > 0) {
      const last = state.moveHistory[state.moveHistory.length - 1];
      setLastMove({ from: last.from, to: last.to });
    } else {
      setLastMove(null);
    }
  }, [gameState, gameMode]);

  const handleFlip = useCallback(() => {
    setFlipped(f => !f);
  }, []);

  // Material advantage calculation
  const getMaterialAdvantage = () => {
    let whiteVal = 0, blackVal = 0;
    gameState.capturedPieces.white.forEach(p => whiteVal += PIECE_VALUES[p.type]);
    gameState.capturedPieces.black.forEach(p => blackVal += PIECE_VALUES[p.type]);
    return whiteVal - blackVal;
  };

  // Render board
  const renderBoard = () => {
    const rows = [];
    for (let displayRow = 0; displayRow < 8; displayRow++) {
      const cols = [];
      for (let displayCol = 0; displayCol < 8; displayCol++) {
        const row = flipped ? 7 - displayRow : displayRow;
        const col = flipped ? 7 - displayCol : displayCol;
        const piece = gameState.board[row][col];
        const isLight = (displayRow + displayCol) % 2 === 0;
        const isSelected = selectedSquare && selectedSquare.row === row && selectedSquare.col === col;
        const isLegal = legalMoves.some(m => m.row === row && m.col === col);
        const isLastMoveFrom = lastMove && lastMove.from.row === row && lastMove.from.col === col;
        const isLastMoveTo = lastMove && lastMove.to.row === row && lastMove.to.col === col;
        const isKingInCheck = gameState.isCheck && piece?.type === 'king' && piece?.color === gameState.currentTurn;

        let bgColor = isLight ? 'bg-amber-100' : 'bg-amber-800';
        if (isSelected) bgColor = 'bg-emerald-400';
        else if (isLastMoveFrom || isLastMoveTo) bgColor = isLight ? 'bg-yellow-200' : 'bg-yellow-600';
        if (isKingInCheck) bgColor = 'bg-red-500';

        cols.push(
          <div
            key={`${displayRow}-${displayCol}`}
            className={`relative flex items-center justify-center ${bgColor} cursor-pointer
              select-none transition-colors duration-100`}
            style={{ touchAction: 'manipulation' }}
            onClick={() => handleSquareClick(displayRow, displayCol)}
            onTouchEnd={(e) => { e.preventDefault(); handleSquareClick(displayRow, displayCol); }}
          >
            {/* Coordinate labels */}
            {displayCol === 0 && (
              <span className="absolute top-0.5 left-0.5 text-[9px] md:text-[10px] font-bold opacity-60 pointer-events-none"
                style={{ color: isLight ? '#92400e' : '#fef3c7' }}>
                {8 - row}
              </span>
            )}
            {displayRow === 7 && (
              <span className="absolute bottom-0 right-0.5 text-[9px] md:text-[10px] font-bold opacity-60 pointer-events-none"
                style={{ color: isLight ? '#92400e' : '#fef3c7' }}>
                {'abcdefgh'[col]}
              </span>
            )}

            {/* Legal move indicator */}
            {isLegal && !piece && (
              <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-black/20" />
            )}
            {isLegal && piece && (
              <div className="absolute inset-0 border-[3px] md:border-4 border-black/30 rounded-sm" />
            )}

            {/* Piece */}
            {piece && (
              <span className={`text-2xl sm:text-3xl md:text-4xl lg:text-5xl leading-none pointer-events-none
                ${piece.color === 'white' ? 'drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]' : 'drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]'}`}
                style={{ filter: piece.color === 'white' ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' : 'none' }}
              >
                {PIECE_SYMBOLS[piece.color][piece.type]}
              </span>
            )}
          </div>
        );
      }
      rows.push(<div key={displayRow} className="grid grid-cols-8">{cols}</div>);
    }
    return rows;
  };

  // Render captured pieces
  const renderCapturedPieces = (color: PieceColor) => {
    const pieces = gameState.capturedPieces[color];
    const sorted = [...pieces].sort((a, b) => PIECE_VALUES[b.type] - PIECE_VALUES[a.type]);
    return (
      <div className="flex flex-wrap gap-0.5 min-h-[24px]">
        {sorted.map((piece, i) => (
          <span key={i} className="text-sm md:text-lg opacity-80">
            {PIECE_SYMBOLS[piece.color][piece.type]}
          </span>
        ))}
      </div>
    );
  };

  // Render move history
  const renderMoveHistory = () => {
    const moves = gameState.moveHistory;
    const pairs: { num: number; white?: string; black?: string }[] = [];
    for (let i = 0; i < moves.length; i += 2) {
      pairs.push({
        num: Math.floor(i / 2) + 1,
        white: moves[i]?.notation,
        black: moves[i + 1]?.notation,
      });
    }
    return pairs;
  };

  const materialAdv = getMaterialAdvantage();

  return (
    <div className="h-[100dvh] w-screen bg-gray-900 flex flex-col lg:flex-row items-center justify-center overflow-hidden">
      {/* Promotion Modal */}
      {pendingPromotion && (
        <PromotionModal color={pendingPromotion.state.currentTurn} onSelect={handlePromotion} />
      )}

      {/* Mobile: Top Panel / Desktop: Left Side */}
      <div className="w-full lg:w-auto flex flex-col lg:flex-col items-center lg:items-start gap-2 p-2 lg:p-4 lg:h-full lg:justify-center">
        {/* Game Mode Selector */}
        <div className="flex gap-2 mb-1">
          <button
            onClick={() => { setGameMode('pvp'); handleNewGame(); }}
            className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-all
              ${gameMode === 'pvp' ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            👥 2 Player
          </button>
          <button
            onClick={() => { setGameMode('bot'); handleNewGame(); }}
            className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-all
              ${gameMode === 'bot' ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            🤖 vs Bot
          </button>
        </div>

        {/* Timer */}
        <div className="flex gap-2 items-center">
          <button
            onClick={() => { setTimerEnabled(!timerEnabled); clock.reset(); }}
            className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-all
              ${timerEnabled ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            ⏱️ {timerEnabled ? `${timerMinutes}min` : 'Clock'}
          </button>
          {timerEnabled && (
            <select
              value={timerMinutes}
              onChange={(e) => { setTimerMinutes(Number(e.target.value)); clock.reset(); }}
              className="bg-gray-700 text-white text-xs rounded px-2 py-1.5"
            >
              <option value={3}>3 min</option>
              <option value={5}>5 min</option>
              <option value={10}>10 min</option>
            </select>
          )}
        </div>

        {/* Status */}
        <div className="text-center lg:text-left">
          {gameOver ? (
            <div className="text-amber-400 font-bold text-sm md:text-base animate-pulse">{gameOver}</div>
          ) : botThinking ? (
            <div className="text-blue-400 text-sm animate-pulse">🤔 Bot is thinking...</div>
          ) : (
            <div className="text-white text-sm md:text-base">
              {gameState.isCheck ? (
                <span className="text-red-400 font-bold">⚠️ {gameState.currentTurn === 'white' ? 'White' : 'Black'} is in Check!</span>
              ) : (
                <span>{gameState.currentTurn === 'white' ? '♔' : '♚'} {gameState.currentTurn === 'white' ? 'White' : 'Black'}'s turn</span>
              )}
              <span className="text-gray-400 ml-2 text-xs">Move {gameState.fullMoveNumber}</span>
            </div>
          )}
        </div>

        {/* Clock Display */}
        {timerEnabled && (
          <div className="flex gap-3 text-center">
            <div className={`px-3 py-1 rounded font-mono text-sm md:text-base font-bold
              ${clock.activeColor === 'white' ? 'bg-white text-gray-900' : 'bg-gray-700 text-gray-300'}
              ${clock.whiteTime <= 30 && clock.activeColor === 'white' ? 'text-red-500 animate-pulse' : ''}`}>
              ♔ {formatTime(clock.whiteTime)}
            </div>
            <div className={`px-3 py-1 rounded font-mono text-sm md:text-base font-bold
              ${clock.activeColor === 'black' ? 'bg-white text-gray-900' : 'bg-gray-700 text-gray-300'}
              ${clock.blackTime <= 30 && clock.activeColor === 'black' ? 'text-red-500 animate-pulse' : ''}`}>
              ♚ {formatTime(clock.blackTime)}
            </div>
          </div>
        )}
      </div>

      {/* Chess Board */}
      <div className="flex-shrink-0 flex items-center justify-center p-1 md:p-2">
        <div
          className="grid grid-rows-8 border-2 border-gray-600 rounded-sm shadow-2xl overflow-hidden"
          style={{
            width: 'min(85vw, 68vh, 560px)',
            height: 'min(85vw, 68vh, 560px)',
          }}
        >
          {renderBoard()}
        </div>
      </div>

      {/* Desktop Sidebar / Mobile Bottom Panel */}
      <div className="w-full lg:w-72 xl:w-80 flex flex-col gap-2 p-2 lg:p-4 lg:h-full lg:overflow-hidden">
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
          <button
            onClick={handleNewGame}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs md:text-sm font-medium transition-all active:scale-95"
          >
            🔄 New Game
          </button>
          <button
            onClick={handleUndo}
            disabled={gameState.moveHistory.length === 0}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-xs md:text-sm font-medium transition-all active:scale-95"
          >
            ↩️ Undo
          </button>
          <button
            onClick={handleFlip}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs md:text-sm font-medium transition-all active:scale-95"
          >
            🔃 Flip
          </button>
          {timerEnabled && (
            <button
              onClick={() => clock.reset()}
              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs md:text-sm font-medium transition-all active:scale-95"
            >
              ⏱️ Reset
            </button>
          )}
        </div>

        {/* Captured Pieces */}
        <div className="bg-gray-800 rounded-xl p-2 md:p-3 border border-gray-700">
          <div className="flex justify-between items-center mb-1">
            <span className="text-gray-400 text-xs font-medium">Captured</span>
            {materialAdv !== 0 && (
              <span className={`text-xs font-bold ${materialAdv > 0 ? 'text-white' : 'text-gray-400'}`}>
                {materialAdv > 0 ? `+${materialAdv}` : materialAdv}
              </span>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">♔</span>
              {renderCapturedPieces('white')}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">♚</span>
              {renderCapturedPieces('black')}
            </div>
          </div>
        </div>

        {/* Move History */}
        <div className="bg-gray-800 rounded-xl p-2 md:p-3 border border-gray-700 flex-1 lg:min-h-0 lg:overflow-hidden flex flex-col">
          <span className="text-gray-400 text-xs font-medium mb-1">Move History</span>
          <div
            ref={moveListRef}
            className="flex-1 overflow-y-auto min-h-[80px] lg:min-h-0 lg:max-h-[300px] scrollbar-thin"
          >
            {renderMoveHistory().length === 0 ? (
              <div className="text-gray-500 text-xs italic">No moves yet</div>
            ) : (
              <div className="space-y-0.5">
                {renderMoveHistory().map((pair, i) => (
                  <div key={i} className="flex text-xs md:text-sm font-mono">
                    <span className="text-gray-500 w-6">{pair.num}.</span>
                    <span className="text-white w-16">{pair.white || ''}</span>
                    <span className="text-gray-300 w-16">{pair.black || ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
