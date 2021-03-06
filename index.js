const path = require('path')
const http = require('http');
const express = require('express')
const socketio = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = socketio(server)
const fs = require('fs')


const PORT = process.env.PORT || 5000
//////////////////////////////////////////////////////////////////////

///////////////////////// Run App and Web Sockets ///////////////////////////////
app.use(express.static(path.join(__dirname, 'public')))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.get('/', (req, res) => res.render('pages/index'))
app.get('/lobby', function(req, res) {
  res.render('pages/rooms', { });
});
app.get('/char', function(req, res) {
  res.render('pages/characterselect', { });
});
app.get('/date', function(req, res) {
  res.render('pages/date', { });
});

var json = JSON.parse(fs.readFileSync('public/Assets/dating.json', 'utf8'))

var usernames = {};
var rooms = {};
var players = {};

class Player {
  constructor(id, username) {
    this.id = id
    this.username = username
    this.character = 0
    this.gameName = null
  }
}

class Game {
  constructor(name) {
    this.name = name
    this.players = {}
    this.oneSelected = false
    this.started = false
    this.round = -1
    this.currCats = {}
    this.currQs = ['','','']
    this.inQRound = false
    this.choiceIn = 0
    this.score = 0
    this.guesses = {}
    this.currAnswers = {}
  }

  addPlayer(player) {
    this.players[player.username] = player
    player.gameName = this.name
  }

  removePlayer(username) {
    delete this.players[username]
  }

  get usernames() {
    return Object.keys(this.players)
  }

  start() {
    this.started = true
    for (const player in this.players) {
      this.emitToPlayers('dateStart', this)
    }
  }

  emitToPlayers(signal, info) {
    io.sockets.in(this.name).emit(signal, info)
  }

  selectChar(username, index) {
    this.players[username].character = index
  }

  markLoaded(username) {
    if (this.oneSelected) {
      io.sockets.in(this.name).emit('questionsStart', this)
      this.sendQuestionRound()
    }
    else {
      this.oneSelected = true
    }
  }

  sendQuestionRound() {
    this.inQRound = true
    this.round++
    if (this.round == 10)
    {
      io.sockets.in(this.name).emit('gameEnd', this.score)
      this.cleanUp()
      return
    }
    for (let i = 0; i < 3; i++)
    {
      this.currCats[i] = chooseCategory()
      this.currQs[i] = chooseQuestion(this.currCats[i])
    }
    let data = {'currRound': this.round, 'questions': this.currQs, 'score': this.score}
    io.sockets.in(this.name).emit('questionRound', data)
  }

  sendAnswerRound(choice) {
    this.inQRound = false
    this.currAnswers = answerpool(this.currCats[choice-1])
    let data = {'currRound': this.round, 'question': this.currQs[choice-1], 'answers': this.currAnswers}
    io.sockets.in(this.name).emit('answerRound', data)
  }

  sendGuessInfo() {
    io.sockets.in(this.name).emit('guessInfo', this.guesses)
  }

  cleanUp()
  {
    for(const player in Object.keys(this.players))
    {
      delete players[player]
    }
    delete rooms[this.name]
    // add clean up code here (i.e. deleting players)
  }

  selectOption(choice, username) {
    if (this.inQRound)
    {
      this.sendAnswerRound(choice)
    }
    else
    {
      this.guesses[username] = this.currAnswers[choice-1]
      if (this.choiceIn == 0)
      {
        this.choiceIn = choice
      }
      else
      {
        if (this.choiceIn == choice)
        {
          this.score++
        }
        this.choiceIn = 0
        this.sendGuessInfo()
        this.sendQuestionRound()
      }
    }
  }
}


var randomNumber = Math.floor(Math.random() * (21 - 2 + 1)) + 2;
var newNumber = 0;
var info = ' ';

function executeNextMove(movingPlayer, waitingPlayer) {
  number = waitingPlayer.numbers[waitingPlayer.numbers.length-1];
  operator = game.operators[game.operators.length-1];
  newNumber = calcNewNumber(number, operator);
  movingPlayer.numbers.push(newNumber);
  movingPlayer.isPlaying = false;
  waitingPlayer.isPlaying = true;

  game.movingPlayerId = waitingPlayer.id;
  info_waiting = '...waiting for ' + waitingPlayer.name + ' to a move!';
  info_moving = 'Please make a move ' + waitingPlayer.name + '!'
  
  io.sockets.connected[movingPlayer.id].emit('info', info_waiting);

  if(waitingPlayer.id != 'notAvailable') {
      io.sockets.connected[waitingPlayer.id].emit('info', info_moving);
  }
  io.sockets.emit('game', game);
}

function calcNewNumber(number, operator){
  newNumber = (number + operator) / 3;
  return Math.round(newNumber);
};

function getCurrentPlayerName(game) {
  return (game.movingPlayerId === game.playerA.id) ? game.playerA.name : game.playerB.name;
}

function togglePlayer() {
   game.movingPlayerId === game.playerA.id ? game.playerA.id : game.playerB.id; 
}

function leaveRoom(socket) {
  oldroom = socket.room
  if (oldroom != null && rooms[oldroom]) {
    socket.leave(oldroom)
    socket.broadcast.to(oldroom).emit('updatechat', 'SERVER', socket.username + ' has left this room')
    socket.room = null
    if (!rooms[oldroom].started)
    {
      rooms[oldroom].removePlayer(socket.player.username) 
    }
    io.sockets.in(oldroom).emit('userlist', rooms[oldroom].usernames)
  }
}

function joinRoom(socket, roomName) {
  socket.join(roomName)
  socket.emit('updatechat', 'SERVER', 'you have connected to ' + roomName)
  socket.broadcast.to(roomName).emit('updatechat', 'SERVER', socket.player.username + ' has joined this room')
  socket.emit('updaterooms', Object.keys(rooms), roomName)
  socket.room = roomName
  rooms[roomName].addPlayer(socket.player)
  io.sockets.in(roomName).emit('userlist', rooms[roomName].usernames)
}

io.sockets.on('connection', function(socket) {
    socket.on('adduser', function(username) {
        socket.player = new Player(socket.id, username)
        players[username] = socket.player
        socket.room = null
        socket.emit('updaterooms', Object.keys(rooms), null)
        console.log("A USER HAS been added")
    });

    socket.on('create', function(room) {
        game = new Game(room, {})
        rooms[room] = game;
        joinRoom(socket, room)
        socket.broadcast.emit('updaterooms', Object.keys(rooms), null)
    });

    socket.on('sendchat', function(data) {
        io.sockets["in"](socket.room).emit('updatechat', socket.player.username, data);
    });

    socket.on('switchRoom', function(newroom) {
        leaveRoom(socket)
        joinRoom(socket, newroom)
    });

    socket.on('startDate', function() {
      if (socket.room != null) {
        let game = rooms[socket.room]
        if (game.usernames.length == 2)
        {
          game.start()
        }
      }
    });

    socket.on('selectChar', function(data) {
      let player = players[data.username]
      let game = rooms[player.gameName]
      game.selectChar(player.username, data.choice)
      socket.join(game.name)
    })

    socket.on('loaded', function(username) {
      let player = players[username]
      let game = rooms[player.gameName]
      socket.join(game.name)
      game.markLoaded(username)
      socket.player = player
      socket.room = game.name
    })

    socket.on('selectOpt', function(choice) {
      let game = rooms[socket.room]
      game.selectOption(choice, socket.player.username)
    })
  
    socket.on('disconnect', function() {
        //remove player from list
        leaveRoom(socket)
        //TODO error handling for game
        //io.close();
    });
 });

function chooseQuestion(category){
  //need to feed category as input as well
  let r = getRandom(0, category.Questions.length)
  return category.Questions[r]
}

function chooseCategory(){
  // console.log(json.Categories.length)
  // console.log(r)
  let obj_keys = Object.keys(json.Categories)
  let r = getRandom(0, obj_keys.length)

  let category = json.Categories[obj_keys[r]]
  // document.getElementById("cat").innerHTML = json.Categories[r]; 
  return category
}

function answerpool(category){
  let answers = []
  for (let i = 0; i <=3; i++) {
      let new_answer = ""
      do {
        let r = getRandom(0, category.Answers.length)
        new_answer = category.Answers[r]
      } while (answers.includes(new_answer))
      answers.push(new_answer)
    }
  return answers
}

function getRandom(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}


server.listen(PORT, () => console.log("Server started!", `Listening on ${ PORT }`));
////////////////////////////////////////////////////////////////////////////////////////////




