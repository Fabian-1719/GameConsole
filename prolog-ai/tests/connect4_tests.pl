:- begin_tests(connect4_ai).
:- use_module('../connect4.pl').

test(toma_victoria_inmediata) :-
    % Jugador 2 (CPU) tiene 3 fichas en fila en la base (fila 5, cols 0, 1, 2)
    % Debe jugar col 3 para ganar inmediatamente
    empty_board(B0),
    apply_move(B0, 0, 2, B1),
    apply_move(B1, 1, 2, B2),
    apply_move(B2, 2, 2, B3),
    best_move(B3, 2, 1, BestCol, _, _, _, _),
    assertion(BestCol == 3).

test(bloquea_victoria_inmediata_del_rival) :-
    % Jugador 1 (humano) tiene 3 fichas en fila en la base (fila 5, cols 0, 1, 2)
    % Jugador 2 (CPU) debe bloquear en col 3
    empty_board(B0),
    apply_move(B0, 0, 1, B1),
    apply_move(B1, 1, 1, B2),
    apply_move(B2, 2, 1, B3),
    best_move(B3, 2, 1, BestCol, _, _, _, _),
    assertion(BestCol == 3).

test(nunca_devuelve_columna_llena) :-
    % Llenar la columna 3 completamente (6 fichas)
    empty_board(B0),
    apply_move(B0, 3, 1, B1),
    apply_move(B1, 3, 2, B2),
    apply_move(B2, 3, 1, B3),
    apply_move(B3, 3, 2, B4),
    apply_move(B4, 3, 1, B5),
    apply_move(B5, 3, 2, BFull),
    best_move(BFull, 2, 1, BestCol, _, _, _, _),
    assertion(BestCol \== 3).

test(nodes_crece_al_subir_profundidad) :-
    % En la misma posicion, nivel 2 (prof 4) debe explorar mas nodos que nivel 1 (prof 2)
    empty_board(B0),
    apply_move(B0, 3, 1, B1),
    best_move(B1, 2, 1, _, _, Nodes1, Depth1, _),
    best_move(B1, 2, 2, _, _, Nodes2, Depth2, _),
    assertion(Depth1 == 2),
    assertion(Depth2 == 4),
    assertion(Nodes2 > Nodes1).

:- end_tests(connect4_ai).
