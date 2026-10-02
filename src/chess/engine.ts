// Chess Engine - Complete game logic, AI, and sound effects

// ==================== TYPES ====================
export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
export type PieceColor = 'white' | 'black';

export interface Piece {
  type: PieceType;
  color: PieceColor;
  hasMoved?: boolean;
}

export interface Position {
  row: number;
  col: number;
}

export interface Move {
  from: Position;
  to: Position;
  piece: Piece;
  captured?: Piece;
  isEnPassant?: boolean;
  isCastling?: 'kingside' | 'queenside';
  promotion?: PieceType;
  notation?: string;
}

export interface GameState {
  board: (Piece | null)[][];
  currentTurn: PieceColor;
  moveHistory: Move[];
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  enPassantTarget: Position | null;
  capturedPieces: { white: Piece[]; black: Piece[] };
  halfMoveClock: number;
  fullMoveNumber: number;
}

// ==================== CONSTANTS ====================
export const PIECE_SYMBOLS: Record<PieceColor, Record<PieceType, string>> = {
  white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
  black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' },
};

export const PIECE_VALUES: Record<PieceType, number> = {
  pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0,
};

// Position tables for AI evaluation
const PAWN_TABLE = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const KNIGHT_TABLE = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];

const BISHOP_TABLE = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];

const ROOK_TABLE = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 5, 5, 0, 0, 0],
];

const QUEEN_TABLE = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
];

const KING_MIDDLE_TABLE = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20],
];

const POSITION_TABLES: Record<PieceType, number[][]> = {
  pawn: PAWN_TABLE,
  knight: KNIGHT_TABLE,
  bishop: BISHOP_TABLE,
  rook: ROOK_TABLE,
  queen: QUEEN_TABLE,
  king: KING_MIDDLE_TABLE,
};

// ==================== GAME INITIALIZATION ====================
export function createInitialBoard(): (Piece | null)[][] {
  const board: (Piece | null)[][] = Array(8).fill(null).map(() => Array(8).fill(null));

  // Place pawns
  for (let col = 0; col < 8; col++) {
    board[1][col] = { type: 'pawn', color: 'black' };
    board[6][col] = { type: 'pawn', color: 'white' };
  }

  // Place other pieces
  const backRow: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  for (let col = 0; col < 8; col++) {
    board[0][col] = { type: backRow[col], color: 'black' };
    board[7][col] = { type: backRow[col], color: 'white' };
  }

  return board;
}

export function createInitialGameState(): GameState {
  return {
    board: createInitialBoard(),
    currentTurn: 'white',
    moveHistory: [],
    isCheck: false,
    isCheckmate: false,
    isStalemate: false,
    enPassantTarget: null,
    capturedPieces: { white: [], black: [] },
    halfMoveClock: 0,
    fullMoveNumber: 1,
  };
}

// ==================== HELPER FUNCTIONS ====================
function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function cloneBoard(board: (Piece | null)[][]): (Piece | null)[][] {
  return board.map(row => row.map(cell => cell ? { ...cell } : null));
}

function findKing(board: (Piece | null)[][], color: PieceColor): Position | null {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.type === 'king' && piece.color === color) {
        return { row, col };
      }
    }
  }
  return null;
}

function isSquareAttacked(board: (Piece | null)[][], pos: Position, byColor: PieceColor): boolean {
  // Check pawn attacks
  const pawnDir = byColor === 'white' ? 1 : -1;
  for (const dc of [-1, 1]) {
    const r = pos.row + pawnDir;
    const c = pos.col + dc;
    if (inBounds(r, c)) {
      const piece = board[r][c];
      if (piece && piece.type === 'pawn' && piece.color === byColor) return true;
    }
  }

  // Check knight attacks
  const knightMoves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  for (const [dr, dc] of knightMoves) {
    const r = pos.row + dr;
    const c = pos.col + dc;
    if (inBounds(r, c)) {
      const piece = board[r][c];
      if (piece && piece.type === 'knight' && piece.color === byColor) return true;
    }
  }

  // Check king attacks
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = pos.row + dr;
      const c = pos.col + dc;
      if (inBounds(r, c)) {
        const piece = board[r][c];
        if (piece && piece.type === 'king' && piece.color === byColor) return true;
      }
    }
  }

  // Check sliding pieces (rook, bishop, queen)
  const directions = [
    { dr: -1, dc: 0, types: ['rook', 'queen'] as PieceType[] },
    { dr: 1, dc: 0, types: ['rook', 'queen'] as PieceType[] },
    { dr: 0, dc: -1, types: ['rook', 'queen'] as PieceType[] },
    { dr: 0, dc: 1, types: ['rook', 'queen'] as PieceType[] },
    { dr: -1, dc: -1, types: ['bishop', 'queen'] as PieceType[] },
    { dr: -1, dc: 1, types: ['bishop', 'queen'] as PieceType[] },
    { dr: 1, dc: -1, types: ['bishop', 'queen'] as PieceType[] },
    { dr: 1, dc: 1, types: ['bishop', 'queen'] as PieceType[] },
  ];

  for (const { dr, dc, types } of directions) {
    let r = pos.row + dr;
    let c = pos.col + dc;
    while (inBounds(r, c)) {
      const piece = board[r][c];
      if (piece) {
        if (piece.color === byColor && types.includes(piece.type)) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  return false;
}

export function isInCheck(board: (Piece | null)[][], color: PieceColor): boolean {
  const kingPos = findKing(board, color);
  if (!kingPos) return false;
  const opponent = color === 'white' ? 'black' : 'white';
  return isSquareAttacked(board, kingPos, opponent);
}

// ==================== MOVE GENERATION ====================
function getPseudoLegalMoves(
  board: (Piece | null)[][],
  pos: Position,
  enPassantTarget: Position | null
): Position[] {
  const piece = board[pos.row][pos.col];
  if (!piece) return [];

  const moves: Position[] = [];
  const { row, col } = pos;
  const color = piece.color;

  switch (piece.type) {
    case 'pawn': {
      const dir = color === 'white' ? -1 : 1;
      const startRow = color === 'white' ? 6 : 1;

      // Forward one
      if (inBounds(row + dir, col) && !board[row + dir][col]) {
        moves.push({ row: row + dir, col });
        // Forward two from start
        if (row === startRow && !board[row + 2 * dir][col]) {
          moves.push({ row: row + 2 * dir, col });
        }
      }

      // Captures
      for (const dc of [-1, 1]) {
        const nr = row + dir;
        const nc = col + dc;
        if (inBounds(nr, nc)) {
          const target = board[nr][nc];
          if (target && target.color !== color) {
            moves.push({ row: nr, col: nc });
          }
          // En passant
          if (enPassantTarget && enPassantTarget.row === nr && enPassantTarget.col === nc) {
            moves.push({ row: nr, col: nc });
          }
        }
      }
      break;
    }

    case 'knight': {
      const knightMoves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
      for (const [dr, dc] of knightMoves) {
        const nr = row + dr;
        const nc = col + dc;
        if (inBounds(nr, nc)) {
          const target = board[nr][nc];
          if (!target || target.color !== color) {
            moves.push({ row: nr, col: nc });
          }
        }
      }
      break;
    }

    case 'bishop': {
      const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      for (const [dr, dc] of dirs) {
        let nr = row + dr;
        let nc = col + dc;
        while (inBounds(nr, nc)) {
          const target = board[nr][nc];
          if (!target) {
            moves.push({ row: nr, col: nc });
          } else {
            if (target.color !== color) moves.push({ row: nr, col: nc });
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
      break;
    }

    case 'rook': {
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        let nr = row + dr;
        let nc = col + dc;
        while (inBounds(nr, nc)) {
          const target = board[nr][nc];
          if (!target) {
            moves.push({ row: nr, col: nc });
          } else {
            if (target.color !== color) moves.push({ row: nr, col: nc });
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
      break;
    }

    case 'queen': {
      const dirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
      for (const [dr, dc] of dirs) {
        let nr = row + dr;
        let nc = col + dc;
        while (inBounds(nr, nc)) {
          const target = board[nr][nc];
          if (!target) {
            moves.push({ row: nr, col: nc });
          } else {
            if (target.color !== color) moves.push({ row: nr, col: nc });
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
      break;
    }

    case 'king': {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = row + dr;
          const nc = col + dc;
          if (inBounds(nr, nc)) {
            const target = board[nr][nc];
            if (!target || target.color !== color) {
              moves.push({ row: nr, col: nc });
            }
          }
        }
      }
      break;
    }
  }

  return moves;
}

export function getLegalMoves(
  board: (Piece | null)[][],
  pos: Position,
  enPassantTarget: Position | null
): Position[] {
  const piece = board[pos.row][pos.col];
  if (!piece) return [];

  const pseudoMoves = getPseudoLegalMoves(board, pos, enPassantTarget);
  const legalMoves: Position[] = [];

  for (const move of pseudoMoves) {
    const testBoard = cloneBoard(board);
    // Make the move on test board
    testBoard[move.row][move.col] = testBoard[pos.row][pos.col];
    testBoard[pos.row][pos.col] = null;

    // Handle en passant capture on test board
    if (piece.type === 'pawn' && enPassantTarget &&
        move.row === enPassantTarget.row && move.col === enPassantTarget.col) {
      const capturedPawnRow = piece.color === 'white' ? move.row + 1 : move.row - 1;
      testBoard[capturedPawnRow][move.col] = null;
    }

    // Check if king is in check after move
    if (!isInCheck(testBoard, piece.color)) {
      legalMoves.push(move);
    }
  }

  // Add castling moves
  if (piece.type === 'king' && !piece.hasMoved && !isInCheck(board, piece.color)) {
    const row = pos.row;
    const opponent = piece.color === 'white' ? 'black' : 'white';

    // Kingside castling
    const kRook = board[row][7];
    if (kRook && kRook.type === 'rook' && !kRook.hasMoved) {
      if (!board[row][5] && !board[row][6]) {
        if (!isSquareAttacked(board, { row, col: 5 }, opponent) &&
            !isSquareAttacked(board, { row, col: 6 }, opponent)) {
          legalMoves.push({ row, col: 6 });
        }
      }
    }

    // Queenside castling
    const qRook = board[row][0];
    if (qRook && qRook.type === 'rook' && !qRook.hasMoved) {
      if (!board[row][1] && !board[row][2] && !board[row][3]) {
        if (!isSquareAttacked(board, { row, col: 3 }, opponent) &&
            !isSquareAttacked(board, { row, col: 2 }, opponent)) {
          legalMoves.push({ row, col: 2 });
        }
      }
    }
  }

  return legalMoves;
}

export function getAllLegalMoves(
  board: (Piece | null)[][],
  color: PieceColor,
  enPassantTarget: Position | null
): Move[] {
  const moves: Move[] = [];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.color === color) {
        const legalTargets = getLegalMoves(board, { row, col }, enPassantTarget);
        for (const target of legalTargets) {
          const move: Move = {
            from: { row, col },
            to: target,
            piece: { ...piece },
            captured: board[target.row][target.col] ? { ...board[target.row][target.col]! } : undefined,
          };

          // En passant
          if (piece.type === 'pawn' && enPassantTarget &&
              target.row === enPassantTarget.row && target.col === enPassantTarget.col) {
            move.isEnPassant = true;
            move.captured = { type: 'pawn', color: color === 'white' ? 'black' : 'white' };
          }

          // Castling
          if (piece.type === 'king' && Math.abs(target.col - col) === 2) {
            move.isCastling = target.col > col ? 'kingside' : 'queenside';
          }

          // Promotion
          if (piece.type === 'pawn' && (target.row === 0 || target.row === 7)) {
            move.promotion = 'queen'; // Default, will be overridden by user choice
          }

          moves.push(move);
        }
      }
    }
  }

  return moves;
}

// ==================== MAKE MOVE ====================
export function makeMove(state: GameState, move: Move): GameState {
  const newBoard = cloneBoard(state.board);
  const piece = { ...newBoard[move.from.row][move.from.col]! };
  const newCaptured = {
    white: [...state.capturedPieces.white],
    black: [...state.capturedPieces.black],
  };

  // Handle en passant capture
  if (move.isEnPassant) {
    const capturedRow = piece.color === 'white' ? move.to.row + 1 : move.to.row - 1;
    const capturedPawn = newBoard[capturedRow][move.to.col];
    if (capturedPawn) {
      newCaptured[piece.color].push(capturedPawn);
    }
    newBoard[capturedRow][move.to.col] = null;
  }

  // Handle regular capture
  if (newBoard[move.to.row][move.to.col] && !move.isEnPassant) {
    newCaptured[piece.color].push(newBoard[move.to.row][move.to.col]!);
  }

  // Move piece
  newBoard[move.to.row][move.to.col] = { ...piece, hasMoved: true };
  newBoard[move.from.row][move.from.col] = null;

  // Handle promotion
  if (move.promotion) {
    newBoard[move.to.row][move.to.col] = { type: move.promotion, color: piece.color, hasMoved: true };
  }

  // Handle castling
  if (move.isCastling) {
    const row = move.from.row;
    if (move.isCastling === 'kingside') {
      const rook = newBoard[row][7];
      if (rook) {
        newBoard[row][5] = { ...rook, hasMoved: true };
        newBoard[row][7] = null;
      }
    } else {
      const rook = newBoard[row][0];
      if (rook) {
        newBoard[row][3] = { ...rook, hasMoved: true };
        newBoard[row][0] = null;
      }
    }
  }

  // Update en passant target
  let newEnPassant: Position | null = null;
  if (piece.type === 'pawn' && Math.abs(move.to.row - move.from.row) === 2) {
    newEnPassant = {
      row: (move.from.row + move.to.row) / 2,
      col: move.from.col,
    };
  }

  const nextTurn = state.currentTurn === 'white' ? 'black' : 'white';
  const inCheck = isInCheck(newBoard, nextTurn);
  const allMoves = getAllLegalMoves(newBoard, nextTurn, newEnPassant);
  const noLegalMoves = allMoves.length === 0;

  // Generate notation
  const notation = generateNotation(move, state.board, inCheck, noLegalMoves);

  const newMove: Move = {
    ...move,
    captured: move.captured || (state.board[move.to.row][move.to.col] ? { ...state.board[move.to.row][move.to.col]! } : undefined),
    notation,
  };

  return {
    board: newBoard,
    currentTurn: nextTurn,
    moveHistory: [...state.moveHistory, newMove],
    isCheck: inCheck,
    isCheckmate: inCheck && noLegalMoves,
    isStalemate: !inCheck && noLegalMoves,
    enPassantTarget: newEnPassant,
    capturedPieces: newCaptured,
    halfMoveClock: (piece.type === 'pawn' || move.captured || move.isEnPassant) ? 0 : state.halfMoveClock + 1,
    fullMoveNumber: state.currentTurn === 'black' ? state.fullMoveNumber + 1 : state.fullMoveNumber,
  };
}

// ==================== NOTATION ====================
function generateNotation(move: Move, board: (Piece | null)[][], isCheck: boolean, isCheckmate: boolean): string {
  if (move.isCastling === 'kingside') return isCheckmate ? 'O-O#' : isCheck ? 'O-O+' : 'O-O';
  if (move.isCastling === 'queenside') return isCheckmate ? 'O-O-O#' : isCheck ? 'O-O-O+' : 'O-O-O';

  const files = 'abcdefgh';
  const ranks = '87654321';
  let notation = '';

  const piece = move.piece;
  if (piece.type !== 'pawn') {
    const symbols: Record<PieceType, string> = {
      king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', pawn: '',
    };
    notation += symbols[piece.type];
  }

  // Disambiguation for non-pawn pieces
  if (piece.type !== 'pawn' && piece.type !== 'king') {
    // Check if another piece of same type can move to same square
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (r === move.from.row && c === move.from.col) continue;
        const other = board[r][c];
        if (other && other.type === piece.type && other.color === piece.color) {
          const otherMoves = getLegalMoves(board, { row: r, col: c }, null);
          if (otherMoves.some(m => m.row === move.to.row && m.col === move.to.col)) {
            if (c !== move.from.col) {
              notation += files[move.from.col];
            } else if (r !== move.from.row) {
              notation += ranks[move.from.row];
            } else {
              notation += files[move.from.col] + ranks[move.from.row];
            }
            break;
          }
        }
      }
    }
  }

  // Capture
  if (move.captured || move.isEnPassant) {
    if (piece.type === 'pawn') {
      notation += files[move.from.col];
    }
    notation += 'x';
  }

  // Destination
  notation += files[move.to.col] + ranks[move.to.row];

  // Promotion
  if (move.promotion) {
    const promoSymbols: Record<PieceType, string> = {
      queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', king: '', pawn: '',
    };
    notation += '=' + promoSymbols[move.promotion];
  }

  // Check/Checkmate
  if (isCheckmate) notation += '#';
  else if (isCheck) notation += '+';

  return notation;
}

// ==================== AI ENGINE ====================
function evaluateBoard(board: (Piece | null)[][]): number {
  let score = 0;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece) continue;

      const value = PIECE_VALUES[piece.type];
      const table = POSITION_TABLES[piece.type];
      const posValue = piece.color === 'white'
        ? table[row][col]
        : table[7 - row][col];

      if (piece.color === 'white') {
        score += value * 100 + posValue;
      } else {
        score -= value * 100 + posValue;
      }
    }
  }

  return score;
}

function minimax(
  board: (Piece | null)[][],
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  enPassantTarget: Position | null
): number {
  if (depth === 0) {
    return evaluateBoard(board);
  }

  const color: PieceColor = isMaximizing ? 'white' : 'black';
  const moves = getAllLegalMoves(board, color, enPassantTarget);

  if (moves.length === 0) {
    if (isInCheck(board, color)) {
      return isMaximizing ? -99999 + (3 - depth) : 99999 - (3 - depth);
    }
    return 0; // Stalemate
  }

  // Move ordering: captures first
  moves.sort((a, b) => {
    const aVal = a.captured ? PIECE_VALUES[a.captured.type] : 0;
    const bVal = b.captured ? PIECE_VALUES[b.captured.type] : 0;
    return bVal - aVal;
  });

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const testMove = { ...move, promotion: move.promotion || 'queen' };
      const testBoard = cloneBoard(board);
      applyMoveToBoard(testBoard, testMove);

      let newEnPassant: Position | null = null;
      if (move.piece.type === 'pawn' && Math.abs(move.to.row - move.from.row) === 2) {
        newEnPassant = { row: (move.from.row + move.to.row) / 2, col: move.from.col };
      }

      const eval_ = minimax(testBoard, depth - 1, alpha, beta, false, newEnPassant);
      maxEval = Math.max(maxEval, eval_);
      alpha = Math.max(alpha, eval_);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const testMove = { ...move, promotion: move.promotion || 'queen' };
      const testBoard = cloneBoard(board);
      applyMoveToBoard(testBoard, testMove);

      let newEnPassant: Position | null = null;
      if (move.piece.type === 'pawn' && Math.abs(move.to.row - move.from.row) === 2) {
        newEnPassant = { row: (move.from.row + move.to.row) / 2, col: move.from.col };
      }

      const eval_ = minimax(testBoard, depth - 1, alpha, beta, true, newEnPassant);
      minEval = Math.min(minEval, eval_);
      beta = Math.min(beta, eval_);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function applyMoveToBoard(board: (Piece | null)[][], move: Move): void {
  const piece = board[move.from.row][move.from.col];
  if (!piece) return;

  if (move.isEnPassant) {
    const capturedRow = piece.color === 'white' ? move.to.row + 1 : move.to.row - 1;
    board[capturedRow][move.to.col] = null;
  }

  board[move.to.row][move.to.col] = { ...piece, hasMoved: true };
  board[move.from.row][move.from.col] = null;

  if (move.promotion) {
    board[move.to.row][move.to.col] = { type: move.promotion, color: piece.color, hasMoved: true };
  }

  if (move.isCastling === 'kingside') {
    const row = move.from.row;
    const rook = board[row][7];
    if (rook) {
      board[row][5] = { ...rook, hasMoved: true };
      board[row][7] = null;
    }
  } else if (move.isCastling === 'queenside') {
    const row = move.from.row;
    const rook = board[row][0];
    if (rook) {
      board[row][3] = { ...rook, hasMoved: true };
      board[row][0] = null;
    }
  }
}

export function getBestMove(state: GameState, depth: number = 3): Move | null {
  const moves = getAllLegalMoves(state.board, state.currentTurn, state.enPassantTarget);
  if (moves.length === 0) return null;

  const isMaximizing = state.currentTurn === 'white';
  let bestMove: Move | null = null;
  let bestEval = isMaximizing ? -Infinity : Infinity;

  // Add some randomness for variety
  const shuffled = [...moves].sort(() => Math.random() - 0.5);

  for (const move of shuffled) {
    const testMove = { ...move, promotion: move.promotion || 'queen' };
    const testBoard = cloneBoard(state.board);
    applyMoveToBoard(testBoard, testMove);

    let newEnPassant: Position | null = null;
    if (move.piece.type === 'pawn' && Math.abs(move.to.row - move.from.row) === 2) {
      newEnPassant = { row: (move.from.row + move.to.row) / 2, col: move.from.col };
    }

    const eval_ = minimax(
      testBoard,
      depth - 1,
      -Infinity,
      Infinity,
      !isMaximizing,
      newEnPassant
    );

    if (isMaximizing) {
      if (eval_ > bestEval) {
        bestEval = eval_;
        bestMove = move;
      }
    } else {
      if (eval_ < bestEval) {
        bestEval = eval_;
        bestMove = move;
      }
    }
  }

  return bestMove;
}

// ==================== SOUND EFFECTS ====================
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

export function playMoveSound(): void {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 600;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) { /* ignore audio errors */ }
}

export function playCaptureSound(): void {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 300;
    osc.type = 'sawtooth';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) { /* ignore audio errors */ }
}

export function playCheckSound(): void {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'square';
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);

    // Second tone
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 1100;
    osc2.type = 'square';
    gain2.gain.setValueAtTime(0.1, ctx.currentTime + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc2.start(ctx.currentTime + 0.1);
    osc2.stop(ctx.currentTime + 0.3);
  } catch (e) { /* ignore audio errors */ }
}

export function playCastleSound(): void {
  try {
    const ctx = getAudioContext();
    // Two quick tones for castling
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 500;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 700;
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.08, ctx.currentTime + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
    osc2.start(ctx.currentTime + 0.08);
    osc2.stop(ctx.currentTime + 0.16);
  } catch (e) { /* ignore audio errors */ }
}
