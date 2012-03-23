MySocket = {
    theSocket: null,        // THE socket connection to the server
    theGame: null,

    // initialize.  establish connection to server
    init: function(game) {
        var self = this;
        this.theGame = game;
        self.theSocket = io.connect('http://localhost');
        self.theSocket.on('news', function (data) {
            console.log(data);
            self.theSocket.emit('my other event', { my: 'data' });
        });
        self.theSocket.on('ServerEvent', function (data) {
            var evtName = data.evt,
                evtData = data.data || {};
            self.theGame.onServerEvent(evtName, evtData);
        });
    },

    // publish an event to the server
    publish: function(evt, data) {
        var self = this;
        self.theSocket.emit("ClientEvent", {evt:evt, data:data});
    },

    zLastJunk: null
};

// get a random number [0..max-1] OR [0..1)
MyRand = function(max) {
    var n = Math.random();
    if (max) {
        n = Math.floor(n * max);
    }
    return n;
};


MyPaint = {
    MyGame: null,       // game data
    board: null,        // board data
    ctxs: null,         // [] of all contexts
    ctx: null,          // THE context working with now
    w: 0,               // size of every context (in pixels)
    h: 0,
    gsize: 15,          // size of each grid-cell (square)
    gw: 0,              // # of grid cells wide and high
    gh: 0,
    colorBack: "#fff",  // color of the entire background
    colorEdge: "#000",  // color of the edge cells
    colorEmpty: "#eee", // color of an empty cell


    // initialize painting
    init: function(game, board) {
        this.MyGame = game;
        this.board = board;
        this.ctxs = game.ctx;
        this.w = game.w;
        this.h = game.h;
        this.gsize = game.gsize;
        this.gw = game.gw;
        this.gh = game.gh;
    },

    // paint the background (which generally does NOT change)
    paintBackground: function() {
        var ctx = this.ctxs[0],
            x,y;
        this.ctx = ctx;
        ctx.save();
        ctx.clearRect(0,0,this.w,this.h);
        ctx.fillStyle = this.colorBack;
        ctx.fillRect(0,0,this.w,this.h);
        ctx.fillStyle = this.colorEdge;
        for(x=0; x<this.gw; x++) {
            this.fillCell(x,0);             // top edge
            this.fillCell(x,this.gh-1);     // bottom edge
        }
        for(y=1; y<this.gw-1; y++) {
            this.fillCell(0,y);             // left edge
            this.fillCell(this.gw-1,y);     // right edge
        }
        ctx.fillStyle = this.colorEmpty;
        for(y=1; y<this.gh-1; y++) {
            for(x=1; x<this.gw-1; x++) {
                this.fillCell(x,y);
            }
        }
        ctx.restore();
    },

    paintPlayers: function() {
        var ctx = this.ctxs[1];

        this.ctx = ctx;
        ctx.save();
        ctx.clearRect(0,0,this.w,this.h);
        this.board.paintPlayers(ctx);
        ctx.restore();
    },

    // fill a cell (of current context) with fillStyle
    fillCell: function(x,y) {
        var sz = this.gsize;
        this.ctx.fillRect(x*sz,y*sz, sz-1,sz-1);
    },

    zLastJunk: null
};


MyBoard = {
    MyGame: null,
    paint: null,
    gw: 0,                  // # of grid cells wide and high
    gh: 0,
    brd: [],                // [x][y]
    nPlayers: 0,            // total players in the array below
    myId: 0,                // id of MY player in the following data
    players: [],            // [player#] = data per player (see PlayerData below)

    init: function(game, paint) {
        var x,y;
        this.MyGame = game;
        this.paint = paint;
        this.gw = game.gw;
        this.gh = game.gh;
        this.brd = [];
        for(x=0; x<this.gw; x++) {
            this.brd[x] = [];
            for(y=0; y<this.gh; y++) {
                this.brd[x][y] = 0;             // EMPTY CELL
                if (x === 0 || y === 0 || x === this.gw-1 || y === this.gh-1) {
                    this.brd[x][y] = -1;        // EDGE CELL
                }
            }
        }
    },

    // create the data for N players
    start: function(nPlayers) {
        var n;

        // create empty player data for each player
        this.players = [];
        for(n=0; n<nPlayers; n++) {         // **************************************************************
            this.players[n] = {             // **                       PlayerData                         **
                pos: {x:10, y:10 },         // head position
                dir: 0,                     // direction facing (0,1,2,3 like degrees. 0=right,1=up)
                tail: []                    // list of positions this snake exists (tail[0] = next item to remove)
            };
        }
    },

    //      .playerData = [] of player data
    //          .pos = { x:x, y:y }
    //          .dir = 0(right), 1(up), 2(left), 3(down)
    //          .tail = [] of positions the snake tail is sitting at (tail[0] = end of tail, the one to remove next)
    setPlayersData: function(nPlayers, id, playersData) {
        var idx,
            pdata;

        this.players = playersData;
        this.myId = id;
        this.nPlayers = this.players.length;
        for(idx=0; idx<this.players.length; idx++) {
            pdata = this.players[idx];
            if (pdata.id === this.myId) {
                pdata.color = "#0000ff";
            } else {
                pdata.color = "rgb("+(100+MyRand(150))+","+(50+MyRand(200))+","+(50+MyRand(100))+")";
            }
        }
        console.log(this.players);
    },

    // paint all players itno a context
    paintPlayers: function(ctx) {
        var self = this;
        this.eachPlayer(function(pdata) {
            ctx.fillStyle = pdata.color;
            self.paint.fillCell(pdata.pos.x, pdata.pos.y);
            for(var idx=0; idx<pdata.tail.length; idx++) {
                var t = pdata.tail[idx];
                self.paint.fillCell(t.x, t.y);
            }
        });
    },

    movePlayers: function() {
        var self = this;
        this.eachPlayer(function(pdata) {
            self.doMovePos(pdata);
        });
    },
    doMovePos: function(pdata) {
        if (!pdata.dead) {
            var pos = pdata.pos;
            pdata.tail.push({x:pos.x, y:pos.y});
            switch(pdata.dir) {
                case 0:     pos.x++;    break;
                case 1:     pos.y--;    break;
                case 2:     pos.x--;    break;
                case 3:     pos.y++;    break;
            }
        }
    },

    eachPlayer: function(fnc) {
        var idx,
            pdata;

        for(idx=0; idx<this.players.length; idx++) {
            pdata = this.players[idx];
            fnc(pdata, idx);
        }

    },

    // process data sent tothis client from the server
    processTickData: function(sid, data) {
        var self = this;
        this.eachPlayer(function(pdata, idx) {
            if (pdata.sid == sid) {
                if (data.dead) {
                    pdata.dead = true;
                    console.log("DEAD PLAYER: "+pdata.sid);
                }
            }
        });
    },

    zLastJunk: null
};


MyGame = {
    socket: null,           // THE socket connection to the server
    paint: null,            // THE paint
    board: null,            // THE board

    els: [],                // array of all canvas elements (first items are toward the back)
    ctx: [],                // array of all canvas contexts (last is on-top)
    w: 600,
    h: 600,
    gsize: 15,              // size of each grid-cell (square)
    gw: 0,                  // # of grid cells wide and high
    gh: 0,

    // initialize the game
    init: function(es) {
        this.gw = parseInt(this.w / this.gsize, 10);     // calc # of grid cells that fit
        this.gh = parseInt(this.h / this.gsize, 10);
        this.w = this.gw * this.gsize;                   // adjust size to fit exact grid cells
        this.h = this.gh * this.gsize;
        // iterate over the collection of canvas elements, and set their sizes
        this.els = [];
        this.ctx = [];
        for(var n=0; n<es.length; n++) {
            var el = es[n];
            el.width = this.w;
            el.height = this.h;
            this.els.push(el);
            var ctx = el.getContext("2d");
            this.ctx.push(ctx);
        }
        this.socket = MySocket;
        this.paint = MyPaint;
        this.board = MyBoard;
        // attach keypress handler
        var self = this;
        $("#inputArea").keydown(function(evt) {
            self.onKeyPress(evt);
        });
        $("#inputArea").focus();
    },

    onKeyPress: function(evt) {
        evt.preventDefault();
        console.log("Keypress: "+evt.which);
        // left=37, right=39, up=38, down=40
        // a=65,    d=68,     w=87,  s=83,x=88
    },

    // RUN the game (the main entry point)
    run: function() {
        this.socket.init(this);
        this.board.init(this, this.paint);
        this.paint.init(this, this.board);
        this.paint.paintBackground();
    },

    // user clicked the "I'm Ready to Play" button
    userReady: function() {
        this.socket.publish("READY");
        console.log("User Ready");
        $("#inputArea").focus();
    },

    // a server-event just came in
    onServerEvent: function(evt, data) {
        if (evt != "GameTick") {
            console.log("ServerEvent: "+evt);
            console.log(data);
        }

        if (this["on"+evt]) {
            this["on"+evt](evt, data);
        }
    },

    // server broadcasting information about clients connected to server
    // data .total = total clients connected to server
    //      .ready = total clients that are ready to play
    onInfoClients: function(evt, data) {
        console.log("onInfoClients: total="+data.total+"  ready="+data.ready);
    },

    // server broadcasting player-data
    // data .nPlayers   = total players playing the game
    //      .yourId     = id of my player in the following data
    //      .playerData = [] of player data
    //          .pos = { x:x, y:y }
    //          .dir = 0(right), 1(up), 2(left), 3(down)
    //          .tail = [] of positions the snake tail is sitting at (tail[0] = end of tail, the one to remove next)
    onPlayerData: function(evt, data) {
        this.board.setPlayersData(data.nPlayers, data.yourId, data.playerData);
        this.paint.paintPlayers();
    },

    onGameTick: function(evt, data) {
        var tickCounter = data.tick;
        if (tickCounter % 20 === 0) {
            console.log("Tick:"+tickCounter);
            console.log(this.board.players);
        }
        // process per-player-data passed over
        for(var key in data) {
            if (key !== "tick" && data.hasOwnProperty(key)) {
                this.board.processTickData(key, data[key]);
            }
        }
        this.board.movePlayers();
        this.paint.paintPlayers();
    },

    zLastJunk: null
};
