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
// THIS IS THE APP
var srvSocket = {
    nConnections: 0,                // total connections
    allConnections: {},             // [id] = server-data for each connection (see connData below)

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

    // Client just connected
    onConnect: function(socket) {
        var self = this;

        if (socket && socket.id && !this.allConnections[socket.id]) {
            // NEW client just connected.           // *******************************************************
            this.allConnections[socket.id] = {
                id:socket.id,
                socket:socket,
                zJunkLastItem: null
            };
            this.nConnections++;
            this.log("New connection.  client id="+socket.id+"  total connections now="+this.nConnections);
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
                this.allConnections = {};
                console.log("NO CONNECTIONS");
            }
            this.log("Disconnection.  client id="+socket.id+"  total connections left="+this.nConnections);
        } else {
            this.log("ERROR: unknown client disconnected");
        }
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