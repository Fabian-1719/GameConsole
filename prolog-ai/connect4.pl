:- module(connect4, [
    empty_board/1,
    legal_moves/2,
    apply_move/4,
    winner/2,
    game_over/2,
    evaluate/3,
    best_move/8
]).

:- use_module(library(lists)).

% Tablero vacio de 6 filas x 7 columnas (0: vacio, 1: humano, 2: computadora)
empty_board([
    [0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0]
]).

% Obtener elemento en coordenada (Fila, Columna) base 0
get_cell(Board, Row, Col, Val) :-
    nth0(Row, Board, RowList),
    nth0(Col, RowList, Val).

% Reemplazar elemento en coordenada (Fila, Columna) base 0
set_cell(Board, Row, Col, Val, NewBoard) :-
    nth0(Row, Board, OldRow, RestRows),
    nth0(Col, OldRow, _, RestCols),
    nth0(Col, NewRow, Val, RestCols),
    nth0(Row, NewBoard, NewRow, RestRows).

% Columnas ordenadas por preferencia central para optimizar la poda alfa-beta
preferred_columns([3, 2, 4, 1, 5, 0, 6]).

% Movimientos legales: columnas cuya fila 0 (superior) este vacia (0)
legal_moves(Board, LegalCols) :-
    preferred_columns(Order),
    include(is_column_open(Board), Order, LegalCols).

is_column_open(Board, Col) :-
    get_cell(Board, 0, Col, 0).

% Aplicar jugada: la ficha cae por gravedad a la fila mas baja disponible
apply_move(Board, Col, Player, NewBoard) :-
    find_lowest_empty_row(Board, Col, 5, TargetRow),
    set_cell(Board, TargetRow, Col, Player, NewBoard).

find_lowest_empty_row(Board, Col, Row, Row) :-
    Row >= 0,
    get_cell(Board, Row, Col, 0), !.
find_lowest_empty_row(Board, Col, Row, TargetRow) :-
    Row > 0,
    NextRow is Row - 1,
    find_lowest_empty_row(Board, Col, NextRow, TargetRow).

% Deteccion de victoria: 4 fichas consecutivas del jugador (1 o 2, nunca 0)
winner(Board, Player) :-
    member(Player, [1, 2]),
    (   horizontal_win(Board, Player) ;
        vertical_win(Board, Player) ;
        diagonal_down_win(Board, Player) ;
        diagonal_up_win(Board, Player)
    ).

horizontal_win(Board, Player) :-
    between(0, 5, R),
    between(0, 3, C),
    C1 is C + 1, C2 is C + 2, C3 is C + 3,
    get_cell(Board, R, C, Player),
    get_cell(Board, R, C1, Player),
    get_cell(Board, R, C2, Player),
    get_cell(Board, R, C3, Player), !.

vertical_win(Board, Player) :-
    between(0, 2, R),
    between(0, 6, C),
    R1 is R + 1, R2 is R + 2, R3 is R + 3,
    get_cell(Board, R, C, Player),
    get_cell(Board, R1, C, Player),
    get_cell(Board, R2, C, Player),
    get_cell(Board, R3, C, Player), !.

diagonal_down_win(Board, Player) :-
    between(0, 2, R),
    between(0, 3, C),
    R1 is R + 1, C1 is C + 1,
    R2 is R + 2, C2 is C + 2,
    R3 is R + 3, C3 is C + 3,
    get_cell(Board, R, C, Player),
    get_cell(Board, R1, C1, Player),
    get_cell(Board, R2, C2, Player),
    get_cell(Board, R3, C3, Player), !.

diagonal_up_win(Board, Player) :-
    between(3, 5, R),
    between(0, 3, C),
    R1 is R - 1, C1 is C + 1,
    R2 is R - 2, C2 is C + 2,
    R3 is R - 3, C3 is C + 3,
    get_cell(Board, R, C, Player),
    get_cell(Board, R1, C1, Player),
    get_cell(Board, R2, C2, Player),
    get_cell(Board, R3, C3, Player), !.

% Estado terminal de fin de juego
game_over(Board, winner(Player)) :-
    winner(Board, Player), !.
game_over(Board, draw) :-
    legal_moves(Board, []), !.

% Jugador oponente
opponent(1, 2).
opponent(2, 1).

% Evaluacion heuristica de posicion
evaluate(Board, Player, 10000) :-
    winner(Board, Player), !.
evaluate(Board, Player, -10000) :-
    opponent(Player, Opp),
    winner(Board, Opp), !.
evaluate(Board, Player, Score) :-
    opponent(Player, Opp),
    center_control_score(Board, Player, Opp, CenterScore),
    windows_score(Board, Player, Opp, WinScore),
    Score is CenterScore + WinScore.

center_control_score(Board, Player, Opp, Score) :-
    findall(1, (between(0, 5, R), get_cell(Board, R, 3, Player)), MyCenter),
    findall(1, (between(0, 5, R), get_cell(Board, R, 3, Opp)), OppCenter),
    length(MyCenter, MyCount),
    length(OppCenter, OppCount),
    Score is (MyCount * 6) - (OppCount * 6).

% Ventanas de 4 casillas en todas direcciones
windows_score(Board, Player, Opp, Total) :-
    findall(S, (window(Board, W), score_window(W, Player, Opp, S)), Scores),
    sum_list(Scores, Total).

score_window(W, Player, _, 100) :-
    count_occurrences(Player, W, 3),
    count_occurrences(0, W, 1), !.
score_window(W, Player, _, 10) :-
    count_occurrences(Player, W, 2),
    count_occurrences(0, W, 2), !.
score_window(W, _, Opp, -120) :-
    count_occurrences(Opp, W, 3),
    count_occurrences(0, W, 1), !.
score_window(W, _, Opp, -10) :-
    count_occurrences(Opp, W, 2),
    count_occurrences(0, W, 2), !.
score_window(_, _, _, 0).

count_occurrences(Elem, List, Count) :-
    include(=(Elem), List, Sub),
    length(Sub, Count).

window(Board, [A, B, C, D]) :-
    (   between(0, 5, R), between(0, 3, Col),
        C1 is Col + 1, C2 is Col + 2, C3 is Col + 3,
        get_cell(Board, R, Col, A), get_cell(Board, R, C1, B),
        get_cell(Board, R, C2, C), get_cell(Board, R, C3, D)
    ) ; (
        between(0, 2, Row), between(0, 6, C),
        R1 is Row + 1, R2 is Row + 2, R3 is Row + 3,
        get_cell(Board, Row, C, A), get_cell(Board, R1, C, B),
        get_cell(Board, R2, C, C), get_cell(Board, R3, C, D)
    ) ; (
        between(0, 2, Row), between(0, 3, Col),
        R1 is Row + 1, C1 is Col + 1,
        R2 is Row + 2, C2 is Col + 2,
        R3 is Row + 3, C3 is Col + 3,
        get_cell(Board, Row, Col, A), get_cell(Board, R1, C1, B),
        get_cell(Board, R2, C2, C), get_cell(Board, R3, C3, D)
    ) ; (
        between(3, 5, Row), between(0, 3, Col),
        R1 is Row - 1, C1 is Col + 1,
        R2 is Row - 2, C2 is Col + 2,
        R3 is Row - 3, C3 is Col + 3,
        get_cell(Board, Row, Col, A), get_cell(Board, R1, C1, B),
        get_cell(Board, R2, C2, C), get_cell(Board, R3, C3, D)
    ).

% Nivel a profundidad de busqueda
level_depth(1, 2).
level_depth(2, 4).
level_depth(3, 6).
level_depth(Level, 4) :- \+ member(Level, [1, 2, 3]).

% Punto de entrada principal para decidir la mejor jugada
best_move(Board, Player, Level, BestCol, BestScore, TotalNodes, Depth, TimeMs) :-
    level_depth(Level, Depth),
    get_time(T0),
    legal_moves(Board, Moves),
    (   Moves == [] ->
        BestCol = -1, BestScore = 0, TotalNodes = 1
    ;   Alpha = -100000, Beta = 100000,
        minimax(Board, Player, Depth, true, Alpha, Beta, Player, BestCol, BestScore, 0, TotalNodes)
    ),
    get_time(T1),
    TimeMs is max(1, round((T1 - T0) * 1000)), !.

% Minimax con poda alfa-beta
minimax(Board, _CurrentPlayer, 0, _, _, _, MaximizingPlayer, -1, Score, NodesIn, NodesOut) :-
    !,
    NodesOut is NodesIn + 1,
    evaluate(Board, MaximizingPlayer, Score).

minimax(Board, CurrentPlayer, Depth, IsMaximizing, Alpha, Beta, MaximizingPlayer, BestMove, BestScore, NodesIn, NodesOut) :-
    (   game_over(Board, Result) ->
        NodesOut is NodesIn + 1,
        BestMove = -1,
        (   Result = winner(MaximizingPlayer) -> BestScore = 10000
        ;   Result = winner(_) -> BestScore = -10000
        ;   BestScore = 0
        )
    ;   legal_moves(Board, Moves),
        (   Moves == [] ->
            NodesOut is NodesIn + 1,
            BestMove = -1,
            BestScore = 0
        ;   (   IsMaximizing == true ->
                max_value(Board, Moves, CurrentPlayer, Depth, Alpha, Beta, MaximizingPlayer, -1, -100000, BestMove, BestScore, NodesIn, NodesOut)
            ;   min_value(Board, Moves, CurrentPlayer, Depth, Alpha, Beta, MaximizingPlayer, -1, 100000, BestMove, BestScore, NodesIn, NodesOut)
            )
        )
    ).

max_value(_, [], _, _, _, _, _, BestMove, BestScore, BestMove, BestScore, Nodes, Nodes) :- !.
max_value(Board, [Move|Rest], Player, Depth, Alpha, Beta, MaxPlayer, CurrentBestMove, CurrentBestScore, FinalMove, FinalScore, NodesIn, NodesOut) :-
    apply_move(Board, Move, Player, NextBoard),
    opponent(Player, NextPlayer),
    NextDepth is Depth - 1,
    minimax(NextBoard, NextPlayer, NextDepth, false, Alpha, Beta, MaxPlayer, _, Score, NodesIn, Nodes1),
    (   Score > CurrentBestScore ->
        NewBestMove = Move,
        NewBestScore = Score
    ;   (CurrentBestMove == -1 ->
            NewBestMove = Move,
            NewBestScore = Score
        ;   NewBestMove = CurrentBestMove,
            NewBestScore = CurrentBestScore
        )
    ),
    NewAlpha is max(Alpha, NewBestScore),
    (   NewAlpha >= Beta ->
        FinalMove = NewBestMove,
        FinalScore = NewBestScore,
        NodesOut = Nodes1
    ;   max_value(Board, Rest, Player, Depth, NewAlpha, Beta, MaxPlayer, NewBestMove, NewBestScore, FinalMove, FinalScore, Nodes1, NodesOut)
    ).

min_value(_, [], _, _, _, _, _, BestMove, BestScore, BestMove, BestScore, Nodes, Nodes) :- !.
min_value(Board, [Move|Rest], Player, Depth, Alpha, Beta, MaxPlayer, CurrentBestMove, CurrentBestScore, FinalMove, FinalScore, NodesIn, NodesOut) :-
    apply_move(Board, Move, Player, NextBoard),
    opponent(Player, NextPlayer),
    NextDepth is Depth - 1,
    minimax(NextBoard, NextPlayer, NextDepth, true, Alpha, Beta, MaxPlayer, _, Score, NodesIn, Nodes1),
    (   Score < CurrentBestScore ->
        NewBestMove = Move,
        NewBestScore = Score
    ;   (CurrentBestMove == -1 ->
            NewBestMove = Move,
            NewBestScore = Score
        ;   NewBestMove = CurrentBestMove,
            NewBestScore = CurrentBestScore
        )
    ),
    NewBeta is min(Beta, NewBestScore),
    (   Alpha >= NewBeta ->
        FinalMove = NewBestMove,
        FinalScore = NewBestScore,
        NodesOut = Nodes1
    ;   min_value(Board, Rest, Player, Depth, Alpha, NewBeta, MaxPlayer, NewBestMove, NewBestScore, FinalMove, FinalScore, Nodes1, NodesOut)
    ).
