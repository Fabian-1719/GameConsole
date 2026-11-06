:- module(server, [server/1, server/0]).

:- use_module(library(http/thread_httpd)).
:- use_module(library(http/http_dispatch)).
:- use_module(library(http/http_json)).
:- use_module(library(http/http_cors)).
:- use_module(connect4).

% Endpoints HTTP
:- http_handler('/health', handle_health, [methods([get, options])]).
:- http_handler('/decide', handle_decide, [methods([post, options])]).

handle_health(Request) :-
    cors_enable(Request, [methods([get, options])]),
    reply_json_dict(_{status: "ok"}).

handle_decide(Request) :-
    cors_enable(Request, [methods([post, options])]),
    (   http_read_json_dict(Request, DictIn) ->
        get_dict(board, DictIn, BoardList),
        (get_dict(player, DictIn, Player) -> true ; Player = 2),
        (get_dict(level, DictIn, Level) -> true ; Level = 2),
        best_move(BoardList, Player, Level, BestCol, Score, Nodes, Depth, TimeMs),
        reply_json_dict(_{
            column: BestCol,
            score: Score,
            nodes: Nodes,
            depthReached: Depth,
            timeMs: TimeMs
        })
    ;   reply_json_dict(_{error: "JSON invalido o faltan campos obligatorios"}, [status(400)])
    ).

server :-
    getenv('PORT', PortAtom),
    atom_number(PortAtom, Port), !,
    server(Port).
server :-
    server(5000).

server(Port) :-
    set_setting(http:cors, [*]),
    http_server(http_dispatch, [port(Port)]),
    format('prolog-ai escuchando en el puerto ~w~n', [Port]).

% Si se ejecuta como script independiente
:- initialization(server, main).
