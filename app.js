var express = require('express'),
    app = express.createServer(),
    io = require('socket.io').listen(app);

app.listen(8123);
console.log("Server listening on port %d in %s mode", app.address().port, app.settings.env);

io.configure(function(){
    io.set('log level', 1);
});
app.configure('development', function(){
    app.use(express.static(__dirname + '/public'));
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});


// // // // // // //
// THIS IS THE GAME
var srvSocket = {
    brd: [],
    brdSize: {w:40, h:40},          // board size (in cells, not pixels)
    timerID: null,                  // id of setInterval timer
    timerMS: Math.floor(1000/5),    // ms between "game ticks"  // @TODO: need ability to slowly speed-up game
    tickCounter: 0,                 // # of game ticks that have elapsed
    tickMessage: {},                // message object to broadcast to everyone on this tick

    nConnections: 0,                // total connections
    nPlayers: 0,                    // total connections that are playing
    nDead: 0,                       // total players that have died so far
    allConnections: {},             // [id] = server-data for each connection (see connData below)
    nextSnakeId: 1,                 // unique snake id to use for next snake

    // iterate over every connection, and call a function
    eachConnection: function(fnc) {
        var id;
        for(id in this.allConnections) {
            if (this.allConnections.hasOwnProperty(id)) {
                fnc(this.allConnections[id]);
            }
        }
    },

    // broadcast/send-to-everyone
    broadcast: function(evt, data, fnc) {
        this.eachConnection(function(connData) {
            //console.log("Sending to "+connData.id+":"+evt);
            if (connData.socket) {
                if (fnc) {
                    fnc(connData, data);          // allow callback to alter the data per-client
                }
                connData.socket.emit("ServerEvent", {evt:evt, data:data});
            }
        });
    },

    // tell everyone about current connections status (how many connected, how many ready)
    broadcast_connections: function() {
        var nTotal = 0,
            nReady = 0;
        this.eachConnection(function(connData) {
            nTotal++;
            if (connData.isReady) nReady++;
        });
        this.broadcast("InfoClients", { total: nTotal, ready: nReady });
        if (nTotal === nReady && nReady > 0) {
            if (nReady < 2) {
                nReady += 5;            // DEBUG: add some fake-players if only 1 player ready
            }
            this.onStartNewGameNow(nReady);
        }
    },

    // tell everyone the current state of all players
    broadcast_playerData: function() {
        var data = {
            nPlayers: this.nPlayers,        // # of players
            yourId: 0,                      // your ID (playerData.id === this)
            timerMS: this.timerMS,          // ms between game-ticks (snakes move every tick)
            playerData: []                  // collection of players-data
        };
        this.eachConnection(function(connData) {
            data.playerData.push({
                id: connData.id,
                sid: connData.sid,
                pos: connData.pos,
                dir: connData.dir,
                tail: connData.tail
            })
        });
        this.broadcast("PlayerData", data, function(connData, data) {
            data.yourId = connData.id;
        });
    },

    // setup/create a new game now for all connected+ready players
    onStartNewGameNow: function(nPlayers) {
        this.nPlayers = nPlayers;
        this.nextSnakeId = 1;
        this.nDead = 0;
        console.log("StartNewGame nPlayers="+nPlayers);
        // locate players along edges
        var self = this,
            x,y,
            nPerEdge,           // n per edge
            nRemainder,         // 1 more on N other edges
            edge,               // edge# working on
            nOnEdge,            // n starting places on the edge working on
            dist,               // distance between starting places
            n,                  // which starting place building along current edge
            loc,                // 1 starting location {x:0, y:0}
            starting = [];      // actual starting locations ready to use

        // create an empty board
        this.brd = [];
        for(x=0; x<this.brdSize.w; x++) {
            this.brd[x] = [];
            for(y=0; y<this.brdSize.h; y++) {
                this.brd[x][y] = 0;             // EMPTY CELL
                if (x === 0 || y === 0 || x === this.gw-1 || y === this.gh-1) {
                    this.brd[x][y] = -1;        // EDGE CELL
                }
            }
        }

        // calculate the starting locations for each player
        nPerEdge = Math.floor(nPlayers / 4);            // at-least this many on every edge
        nRemainder = nPlayers - (nPerEdge*4);           // remainder (some edges get 1)
        // calculate positions on each edge
        for(edge=0; edge<4; edge++) {
            nOnEdge = nPerEdge + (nRemainder>0? 1 : 0); // total starting locations along this edge
            nRemainder--;                               // 1 fewer remainders left to handle
            dist = Math.floor(this.brdSize.w / (nOnEdge+1));
            for(n=0; n<nOnEdge; n++) {
                loc = {x:this.brdSize.w-2, y:this.brdSize.h-2, dir:(edge+2)%4};
                switch (edge) {
                    case 0:         // right
                        loc.y = dist * (n+1);
                        break;
                    case 1:         // top
                        loc.x = dist * (n+1);
                        loc.y = 1;
                        break;
                    case 2:         // left
                        loc.x = 1;
                        loc.y = dist * (n+1);
                        break;
                    case 3:         // bottom
                        loc.x = dist * (n+1);
                        break;
                }
                starting.push(loc);
            }
        }


        // prepare each connected-ready-player with a snake
        this.eachConnection(function(connData) {
            if (connData.isReady) {
                loc = starting.pop();
                self.connData_newGame(connData, loc);
            }
        });

        // create FAKE players (DEBUG ONLY)
        n = 1;
        while (starting.length) {
            loc = starting.pop();
            this.allConnections["FAKE_"+n] = {
                id: "FAKE_"+n
            };
            self.connData_newGame(this.allConnections["FAKE_"+n], loc);
            n++;
        }

        // broadcast ALL player-data to ALL players
        this.broadcast_playerData();

        // startup the interval timer to run the game with
        this.tickCounter = 1;
        this.startTimer();

    },

    startTimer: function() {
        var self = this;
        this.stopTimer();
        this.timerID = setInterval(function() {
//            self.onGameTick();
        }, this.timerMS);
    },
    stopTimer: function() {
        if (this.timerID) {
            clearInterval(this.timerID);
            this.removeFakeSnakes();
        }
        this.timerID = null;
    },
    removeFakeSnakes: function() {
        var fakes = [];
        for(var key in this.allConnections) {
            if (this.allConnections.hasOwnProperty((key))) {
                if ((""+key).substring(0,4) == "FAKE") {
                    fakes.push(key);
                } else {
//                    this.allConnections[key]. ???
                }
            }
        }
        for(var idx=0; idx<fakes.length; idx++) {
            delete this.allConnections[fakes[idx]];
        }
    },

    doMovePos: function(pdata) {
        var obj;
        if (!pdata.dead) {
            var pos = pdata.pos;
            pdata.tail.push({x:pos.x, y:pos.y});
            switch(pdata.dir) {
                case 0:     pos.x++;    break;
                case 1:     pos.y--;    break;
                case 2:     pos.x--;    break;
                case 3:     pos.y++;    break;
            }
            // TODO: shrink tail sometimes
            if (this.brd[pos.x][pos.y] !== 0) {
                this.killSnake(pdata);
            } else {
                this.brd[pos.x][pos.y] = pdata.sid;
            }
        }
    },

    killSnake: function(pdata) {
        pdata.dead = true;                          // mark this player as dead
        this.nDead++;                               // 1 more player is dead
        if (!this.tickMessage[pdata.sid]) {
            this.tickMessage[pdata.sid] = {};
        }
        this.tickMessage[pdata.sid].dead = true;    // pass to every client that this player is dead
        console.log("DEAD: "+pdata.sid+" "+pdata.id);
    },

    dumpBoard: function() {
        var x,y,str;
        console.log("----------------------");
        for(y=0; y<this.brdSize.h; y++) {
            str = "";
            for(x=0; x<this.brdSize.w; x++) {
                str += (""+this.brd[x][y]).substring(0,1) + ",";
            }
            console.log(str);
        }
    },

    // one game tick has elapsed ... move all snakes
    onGameTick: function() {
        var self = this;
        this.tickCounter++;
        this.tickMessage = { tick:this.tickCounter };
        this.eachConnection(function(connData) {
            self.doMovePos(connData);
        });
        // check if multiple snakes collided (first snake didn't die ... kill it)
        this.eachConnection(function(connData) {
            if (!connData.dead) {
                self.eachConnection(function(cdata) {
                    if (cdata.dead) {
                        if (connData.pos.x === cdata.pos.x && connData.pos.y === cdata.pos.y) {
                            self.killSnake(connData);
                        }
                    }
                });
            }
        });
        // TODO: for now, always broadcast a "tick" event
        // TODO: add when a snake: turns, dies (in the tickMessage)
        this.broadcast("GameTick", this.tickMessage);
        if (this.nDead >= this.nPlayers) {
            this.stopTimer();
        }
//        this.dumpBoard();
    },

    // force a connection-data into a new game situation (unknown starting location)
    connData_newGame: function(connData, loc) {
        //console.log("...starting at: ("+loc.x+","+loc.y+") facing "+loc.dir);
        connData.sid = (this.nextSnakeId++);        // unique snake id
        connData.pos = {x:loc.x, y:loc.y};          // starting location
        connData.dir = loc.dir;                     // starting direction
        connData.tail = [];                         // start with NO tail
        this.brd[loc.x][loc.y] = connData.sid;      // snake id
        //console.log(connData);
    },

    // Client just connected
    onConnect: function(socket) {
        var self = this;

        if (socket && socket.id && !this.allConnections[socket.id]) {
            // NEW client just connected.           // *******************************************************
            // Remember this client info.           // **                     Player                        **
            this.allConnections[socket.id] = {      // **                     connData                      **
                id:socket.id,                       // **                                                   **
                socket:socket,
                pos: {x:0, y:0},                    // snake position             1
                dir: 0,                             // direction facing:        2   0  (like degrees)
                tail: [],                           // tail locations             3
                zJunkLastItem: null
            };
            this.nConnections++;
            this.log("New connection.  client id="+socket.id+"  total connections now="+this.nConnections);
            socket.on("ClientEvent", function(data) {
                // Client published an "event" to this server
                var evtName = data.evt || "UNKNOWN",
                    evtData = data.data || {};
                self.onClientEvent(evtName, evtData, self.allConnections[socket.id], socket);
            });
            this.broadcast_connections();
        } else {
            this.log("ERROR: Same client connection ID used twice");
        }
    },

    // CLient just disconnected
    onDisconnect: function(socket) {
        var self = this;
        if (socket && socket.id) {
            delete this.allConnections[socket.id];
            this.nConnections--;
            if (this.nConnections === 0) {
                this.stopTimer();
                this.allConnections = {};
                console.log("NO CONNECTIONS");
            }
            this.log("Disconnection.  client id="+socket.id+"  total connections left="+this.nConnections);
        } else {
            this.log("ERROR: unknown client disconnected");
        }
    },

    // an event just came in from a client
    // in:  evt = "EVENT"                       event name
    //      data = { ... event-data ... }       data that came with the event
    //      connData = { id:, ... }             connection-data (data stored about this client-connection)
    //      socket = {}                         actual socket the event came from
    onClientEvent: function(evt, data, connData, socket) {
        this.log("EVENT:"+evt);
        connData.isReady = true;            // mark this client as "Ready"
        this.broadcast_connections();
    },

    log: function(msg) {
        console.log(msg);
    }

};

// watch for clients connecting and disconnecting to this server
io.sockets.on('connection', function (socket) {
    srvSocket.onConnect(socket);
    socket.on('disconnect', function () {
        srvSocket.onDisconnect(socket);
    });
});