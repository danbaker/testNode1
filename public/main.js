MySocket = {
    theSocket: null,        // THE socket connection to the server

    // initialize.  establish connection to server
    init: function() {
        var self = this;
        self.theSocket = io.connect('http://localhost');
        self.theSocket.on('news', function (data) {
            console.log(data);
            self.theSocket.emit('my other event', { my: 'data' });
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


MyGame = {
    socket: null,           // THE socket connection to the server

    els: [],                // array of all canvas elements (first items are toward the back)
    ctx: [],                // array of all canvas contexts (last is on-top)
    w: 600,
    h: 600,
    gsize: 15,              // size of each grid-cell (square)
    gw: 0,                  // # of grid cells wide and high
    gh: 0,

    // initialize the game
    init: function(es, idInput) {
        this.idInput = idInput;
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
        // attach keypress handler
        var self = this;
        $(this.idInput).keydown(function(evt) {
            self.onKeyPress(evt);
        });
        $(this.idInput).focus();
    },

    // RUN the game (the main entry point)
    run: function() {
        this.socket.init(this);
    },

    onKeyPress: function(evt) {
        evt.preventDefault();
        console.log("Keypress: "+evt.which);
        // left=37, right=39, up=38, down=40
        // a=65,    d=68,     w=87,  s=83,x=88
    },

    zLastJunk: null
};
