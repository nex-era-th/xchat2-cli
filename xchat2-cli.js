#!/usr/bin/env node
// cli-test.js -- how it works.

const readline = require('readline');
const util = require('util')
const WebSocket = require('ws');
const fetch = require('node-fetch');
const json = require('json-bigint');
const CONF = require('./conf')
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid')


let listenServer
//let wsServer = listenServer


// class

class WsMsg {

  // use this as the payload to send via websocket. So all WS payload is derived from this class by using 'new WsMsg'

  constructor( type, mode, room, from, to, msg, attach, time = Date.now()) {
    this.type = type;     // chat, system, dm, pic
    this.mode = mode;     // room, private
    this.room = room;     // #roomName
    this.from = from;     // @sender
    this.to = to;         // @friend
    this.msg = msg;       // msg to send
    this.attach = attach; // optional, the attachment dataUrl
    this.time = time;     // timestamp
  }
}










if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
  readline.emitKeypressEvents(process.stdin)
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true
});


// init vars
const question = util.promisify(rl.question).bind(rl)
const DEF_ROOM = '#world'
const DEF_MODE = 'room'
let myCurrentRoom = DEF_ROOM
let myCurrentMode = DEF_MODE
let MY_USER
let MY_KEY
let myKey = MY_KEY


// START POINT //////////////////////////////////////////////
console.log('////////// xchat2 cli 1.0 //////////');
main()



////////////////
//    MAIN    ///////////////////////////////////////////////
////////////////

function main() {

  // main program, starts here and manages everything

  rl.question('user: ', async (myUser) => {

    myUser = myUser.toLowerCase().trim();

    if (myUser && myUser.startsWith('@')) {
      let askPass = true

      while (askPass) {
        try {
          const myPass = await getPass()

          // login
          const loginCheck = await fetchPost(
            `${CONF.httpProtocol}//${CONF.serverDomain}/login`,
            {
              userName: myUser,
              password: myPass,

              user    : myUser, // will set std to these 2 lines
              pass    : myPass
            }
          )

          console.log('main/login resp =', loginCheck)
          /* response format if done
            {
              success     : true,
              message     : `Hello ${userName}. Your log-in passed.`,
              userName    : userName,
              token       : authToken,
              DEF_ROOM : defaultRoom
            } 

            if fail =
            {
              error: ...................
            }
          */
          //console.debug(loginCheck)

          if (loginCheck.accepted) {
            //console.log( loginCheck.message)

            /* loginCheck format = 
              {
                accepted: true | false,
                key: <...jwt....> | null,
              }
            */

            // save info
            MY_USER = myUser
            MY_KEY = myKey = loginCheck.key
            myCurrentRoom = loginCheck.defaultRoom // because user can set default room at any time, and server keeps in db

            rl.setPrompt( 
              MY_USER + '#' + loginCheck.defaultRoom + '> '
            )
            rl.prompt()

            console.log(`done, login & connected`)
            /*update global vars: 
              MY_USER = ${ MY_USER } 
              MY_KEY = ${MY_KEY} 
              myCurrentRoom = ${myCurrentRoom} 
              myCurrentMode = ${myCurrentMode}`)
            */
            // exit loop
            askPass = false

          } else {
            console.log('main/login rejected, resp =', loginCheck)
            rl.prompt()
          }

          


        } catch (error) {
          console.log(`main/catch error =`, error)
          main()
        }
      }



      ////////////////////////////
      //    LISTEN SERVER       //
      ////////////////////////////


      // connect web socket
      listenServer = new WebSocket(`${CONF.wsProtocol}//${CONF.serverDomain}/${MY_USER}?key=${MY_KEY}`)
      
      // listen server, for msg, and everything

      // on message - take care msg from server
      listenServer.on('message', (wsJson) => {

        const wsObj = JSON.parse( wsJson)
        readline.clearLine(rl.output, 0)
        readline.cursorTo(rl.output, 0)

console.log('onMsg, wsObj =', wsObj)

        if ( wsObj.type == 'system') {
          if ( typeof wsObj.msg == 'object') {
            
            if (wsObj.msg.actionRequired) {
              const sysMsg = wsObj.msg
            
              switch (true) {
                case sysMsg.changeModeTo == 'private':
                  /* sysMsg must be
                    {
                      actionRequired: true,
                      changeModeTo  : 'private',
                      changeRoomTo  : null
                    }
                  */
                  myCurrentMode = 'private'
                  myCurrentRoom = null
                  rl.setPrompt(MY_USER + '> ')
                  rl.prompt()
                break;

                case sysMsg.changeModeTo == 'room':
                  /* sysMsg must be 
                    { 
                      actionRequired : true, 
                      changeModeTo   : 'room', 
                      changeRoomTo   : '#room' 
                    } 
                  */
                  myCurrentMode = 'room'
                  myCurrentRoom = sysMsg.changeRoomTo
                  rl.setPrompt(MY_USER + myCurrentRoom + '> ')
                  rl.prompt()
              }
            }
            // other case may be in future  

          } else if (typeof wsObj.msg == 'string') {
            // general str msg
            console.log(`=> ${wsObj.msg} ~ ${hitTime( wsObj.time)}`)
          } else {
            // this is unknown
            console.log('onMsg, unknown typeof the wsMsg.msg')
          }
        
        } else if (wsObj.type == 'chat') {

          console.log(`${wsObj.from} => ${wsObj.msg} ~ ${hitTime( wsObj.time)}`)
        
        } else if (wsObj.type == 'dm') {

          if (wsObj.from != MY_USER) { // not my own dm
            console.log(`{{ ${wsObj.from} => ${wsObj.msg} ~ ${hitTime(wsObj.time)} }}`)
          } else { // my own dm - display differently
            console.log(`{{ to: ${wsObj.to} => ${wsObj.msg} ~ ${hitTime(wsObj.time)} }}`)
          }
          
        
        } else if (wsObj.type == 'pic') {

          console.log(`=> ${wsObj.from} shared a pic to this room but we still not handle pic in this cli version. ~ ${hitTime(wsObj.time)}`)
          // then show pic here
        
        } else if ( wsObj.type == 'broadcast') {

          console.log(`** ${wsObj.from} => ${wsObj.msg} ~ ${hitTime(wsObj.time)} **`)

        } else {

          console.log(`=> unknown msg type from ${wsObj.from} ~ ${hitTime(wsObj.time)}`)
        }

        rl.prompt(true)
        //redrawInputLine()
      })



      // listen user or monitor what she sending/typing
      // this func takes care all inputs from user
      listenUser() 



    } else {
      console.log(`Wrong user`);
      main()
    }
  });
}
  

// getPass
async function getPass() {

  const prompt = 'password: '

  const maskInput = (char,key) => {

    if (key.ctrl || key.meta) return

    if (key.name === 'return' || key.name === 'enter') {
      process.stdin.removeListener('keypress', maskInput)
      //rl.output.write('\n')
      rl.pause()
      return
    }

    if (key.name === 'backspace') {}
    readline.cursorTo(rl.output, 0)
    rl.output.write(prompt)
    rl.output.write('*'.repeat(rl.line.length))
  }

  process.stdin.on('keypress', maskInput)

  const pass = await new Promise( resolve => {
    rl.question(prompt, (input) => {
      process.stdin.removeListener('keypress', maskInput)
      rl.resume()
      resolve(input)
    })
  })

  return pass.trim()

}


//////////////////////
//    LISTEN USER   ///////////////////////////////////////////   
//////////////////////
// what she sent from her keyboard?

// listenUser -----------------------------------------------
function listenUser() {
  rl.on('line', (msg) => {

    let isCommand = true
    let outputToHistory = null
    msg = msg.trim()

    if (msg === '') {
      if (rl.terminal) {
        readline.moveCursor(rl.output, 0, -1)
        readline.clearLine(rl.output, 0)
        readline.cursorTo(rl.output, 0)
        rl.prompt()
      }
      return;
    }
console.log( msg)

    switch (true) {

      // new addition to msg type
      case msg.startsWith('/'):
        const msgObj = new WsMsg(
          'command',
          myCurrentMode ? myCurrentMode : DEF_MODE,   // mode
          myCurrentRoom ? myCurrentRoom : DEF_ROOM,   // room
          MY_USER,   // from
          null,   // to
          msg, // msg: The command string
        )

        if (listenServer.readyState === WebSocket.OPEN) {
          listenServer.send( JSON.stringify( msgObj))
        }
        console.log('sent msgPacket to wsServer =', msgObj)
      break;


      case msg == '/who':
        if (listenServer.readyState === WebSocket.OPEN) {
          listenServer.send( JSON.stringify( 
            new WsMsg(
              'chat',
              myCurrentMode ? myCurrentMode : DEF_MODE,   // mode
              myCurrentRoom ? myCurrentRoom : DEF_ROOM,   // room
              MY_USER,   // from
              null,   // to
              msg, // msg: The command string
              null,   // attach
              Date.now()
            )
          ))
        } else {
          console.error('web-sock is not open.', listenServer.readyState)
        }
      break;

      case msg == '/bye':
        rl.close();
        isCommand = false
      break;

      // chat msg in a room
      case !msg.startsWith('/') && !msg.startsWith('@') && !msg.startsWith('-'):

console.log('ws readyState =', listenServer.readyState)
        
        const chatMsg = new WsMsg(
              'chat', myCurrentMode, myCurrentRoom, MY_USER,
              null, msg, null
            )

        if (listenServer.readyState === WebSocket.OPEN) {
          listenServer.send( JSON.stringify(
            chatMsg            
          ))
          console.log('sent chat msg =', chatMsg)

        } else {
          console.log('no listenServer')
        }
      break;


      // dm msg = starts with @user ...... and not ends with /
      case /^@[\w-_]+\s.+/.test(msg) && !msg.trim().endsWith('/'):
        
        let myFriend = msg.match(/^(@[\w-_]+)(.+)$/)[1]
        let myDm = msg.match(/^(@[\w-_]+)(.+)$/)[2].trim()
        
        if (listenServer) {
          listenServer.send( JSON.stringify(
            new WsMsg( 'dm', myCurrentMode, myCurrentRoom,
              MY_USER, myFriend, myDm, null
            )
          ))
        }
      break;

      // broadcast
      case /^\/broadcast .+/.test(msg):
        
        let broadMsg = msg.match(/^\/broadcast (.+)/)[1].trim()

        if (listenServer) {
          listenServer.send( JSON.stringify(
            new WsMsg( 'chat', myCurrentMode, myCurrentRoom,
              MY_USER, null, msg, null
            )
          ))
        }

        // !! should change type to broadcast
      break;

      default:
        outputToHistory = `don't understand your msg.`
        //redrawPrompt()
        //return
      break;
    }

    // Only prompt again if we haven't closed the interface
    if (rl.terminal) {
      readline.moveCursor(rl.output, 0, -1)
      readline.clearLine(rl.output, 0)
      readline.cursorTo(rl.output, 0)

      if (outputToHistory) {
        console.log(outputToHistory)
      }
      rl.prompt();
    }
  });
}


function redrawPrompt() {
    if (rl.terminal) {
        // 1. Move the cursor up one line (to the line that was printed)
        readline.moveCursor(rl.output, 0, -1);
        // 2. Clear that line
        readline.clearLine(rl.output, 0);
        // 3. Move the cursor up one more line (to the line where the command was typed)
        readline.moveCursor(rl.output, 0, -1);
        // 4. Clear that line
        readline.clearLine(rl.output, 0);
        // 5. Restore the prompt
        rl.prompt();
    }
}



// redrawInputLine
function redrawInputLine() {
    if (rl.terminal) {
        // 1. Clear the current line (where the user is typing)
        readline.clearLine(rl.output, 0);
        // 2. Move cursor to the start of the line
        readline.cursorTo(rl.output, 0);
        // 3. Redraw the prompt and any text the user had already typed
        rl.prompt(true); 
    }
}




// on close
rl.on('close', () => {
  process.exit(0);
});



//
// FUNCTIONS
//


// fetchPost
async function fetchPost( myUrl, myData ) {

  if (!myData || !myUrl) {
    console.error('fetchPost: rejected, must have myUrl & myData')
    return
  } 

  myMethod = 'post' 
  myHeaders = { 'content-type': 'application/json' }

  try {
    const resp = await fetch( myUrl, 
      {
        method  : myMethod,
        headers : myHeaders,
        body    : JSON.stringify( myData)
      }
    )
    return await resp.json()
  } catch (error) {
    console.error( error)
  }
  
}


// hitTime
function hitTime( timeStr ) {
  // return like: 20:30
  return new Date( timeStr)
      .toLocaleTimeString('en-US',{ hour12: false })
      .match(/\d{1,2}:\d\d/)[0];
}
 



// 1. getUuid()
function getUuid() {
    // Uses the imported uuidv4 function to generate a cryptographically
    // secure, universally unique identifier (UUID).
    return uuidv4();
}

// 2. getHash(text, algor = 'sha256')
function getHash(text, algor = 'sha256') {
    // Generates a hash using the specified algorithm (defaults to SHA256).
    // The 'md5' algorithm can be passed as the second argument.
    
    // Ensure the input is a string
    const data = String(text); 
    
    // Check if the algorithm is valid for this function
    if (algor !== 'sha256' && algor !== 'md5') {
        console.error(`Invalid hash algorithm: ${algor}. Must be 'sha256' or 'md5'.`);
        return null; 
    }

    try {
        return crypto.createHash(algor).update(data).digest('hex');
    } catch (e) {
        console.error(`Hashing failed for algorithm ${algor}: ${e.message}`);
        return null;
    }
}


function getInt(length = 16) {
    // 1. Validate length: Default to 16 if invalid.
    if (typeof length !== 'number' || length < 1 || !Number.isInteger(length)) {
        length = 16;
    }

    try {
        // 2. Calculate the minimum (10^(length-1)) and maximum (10^length - 1) range 
        //    as BigInts to ensure precision for numbers >= 16 digits.
        const min = 10n ** BigInt(length - 1);
        const max = 10n ** BigInt(length) - 1n; // We want the max value to be 99...9 (length times)

        // 3. Use crypto.randomInt to generate a cryptographically secure random number 
        //    within the range, ensuring it's exactly 'length' digits long.
        const randomBigInt = crypto.randomInt(min, max + 1n, 'bigint'); 
        
        // 4. Return the BigInt as a string.
        return randomBigInt.toString();
        
    } catch (e) {
        console.error(`Error generating secure random integer: ${e.message}. Falling back to insecure random string.`);
        
        // Fallback to a simple, less secure random string generation
        let result = '';
        const chars = '0123456789';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
}


function getRandomWords(length = 10) {
    // 1. Define the pool of characters: a-z, A-Z, 0-9, and underscore.
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';
    const charactersLength = characters.length;
    let result = '';

    // 2. Validate length and default to 10 if invalid.
    if (typeof length !== 'number' || length < 1 || !Number.isInteger(length)) {
        length = 10;
    }

    // 3. Loop 'length' times to build the string.
    for (let i = 0; i < length; i++) {
        // Use Math.random() for speed, as this is for random words, not cryptography.
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    return result;
}


function getRandomPassword(length = 12) {
    // Defines the pool of characters: 
    // - All English letters (a-z, A-Z)
    // - All numbers (0-9)
    // - Common symbols (including underscore, space is generally excluded)
    const characters = 
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
        'abcdefghijklmnopqrstuvwxyz' +
        '0123456789' +
        '!@#$%^&*()_+-=[]{}|;:,./<>?~`"\''; // Added a comprehensive set of common symbols
        
    const charactersLength = characters.length;
    let result = '';

    // 1. Validate length and default to 12 if invalid.
    if (typeof length !== 'number' || length < 1 || !Number.isInteger(length)) {
        length = 12;
    }

    // 2. Loop 'length' times to build the string.
    for (let i = 0; i < length; i++) {
        // Use Math.random() to pick a character from the pool.
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    return result;
}


// makePromptReady
function makePromptReady() {
  if (rl.terminal) {
    readline.moveCursor(rl.output, 0, -1)
    readline.clearLine(rl.output, 0)
    readline.cursorTo(rl.output, 0)
    rl.prompt()
  }
}
      


// makeRoomName
function makeRoomName( roomName ) {
  // we're moving roomName to be always '#room' so this func will ensure we keep this format
  // if invalid name supplied, gets null

  if ( roomName.match(/^#?[\w-_]+$/)) {
    return roomName.startsWith('#')? roomName : '#' + roomName
  } else {
    return null
  }
}