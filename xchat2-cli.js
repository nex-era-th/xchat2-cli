#!/usr/bin/env node
// cli-test.js -- how it works.

const readline = require('readline');
const util = require('util')
const WebSocket = require('ws');
const fetch = require('node-fetch');
const json = require('json-bigint');
const CONF = require('./conf')
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { request } = require('http');


let listenServer
//let wsServer = listenServer



// GLOBAL CLASS

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


/////////////


if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
  readline.emitKeypressEvents(process.stdin)
}



// GLOBAL VARS

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true
});



const question = util.promisify(rl.question).bind(rl)
const DEF_ROOM = '#world'
const DEF_MODE = 'room'
let myCurrentRoom = DEF_ROOM
let myCurrentMode = DEF_MODE
let MY_USER
let MY_KEY
let myKey = MY_KEY



console.log('////////// xchat2 cli 1.0 //////////');

const rawCommand = process.argv[2]
const rawCommandData = process.argv[3]

if (rawCommand) {
  rawCommandWork()
} else {
  mainWork()
}


// RAW COMMANDS BEFORE ACCESSING TO THE REAL USE


async function rawCommandWork() {

  if (rawCommand.toLocaleLowerCase() == '-signup') {

    let user, pass, secret

    console.log('NOTE: The userName must always start with @, example @john. The password must be 8+ characters. The Secret Words can not be blank.')

    let userIsNotCorrect = true
    while (userIsNotCorrect) {
      user = await askThis('your desired userName: ')
      if ( user && user.match(/^@[a-z0-9_-]+$/)) {
        userIsNotCorrect = false
      }
    }

    let passIsNotCorrect = true
    while (passIsNotCorrect) {
      pass = await askThis('your new password: ')
      if (pass && pass.length > 7) {
        passIsNotCorrect = false
      }
    }

    let secretNotCorrect = true
    while (secretNotCorrect) {
      secret = await askThis('please put your Secret Words, it is important to recover your user if you lost your password: ')
      if (secret && secret != '') {
        secretNotCorrect = false
      }
    }

    const requestSignUp = await fetchPost(
      `${CONF.httpProtocol}//${CONF.serverDomain}/sign-up`,
      {
        userName  : user,
        password  : pass,
        secretWord: secret, 
      }
    )
    
    if ( requestSignUp.done) {
      console.log( requestSignUp.msg)
    } else {
      console.log( requestSignUp.msg)
    }


  } else if ( rawCommand.toLowerCase() == '-resetpassword') {

    let user, secret, newPass

    let wrongUserName = true
    while (wrongUserName) {
      user = await askThis('your user: ')
      if (user && user.match(/^@[a-z0-9_-]+$/) ) {
        wrongUserName = false
      }
    }

    let wrongSecretWord = true
    while (wrongSecretWord) {
      secret = await askThis('your secretWords: ')
      if (secret != '') wrongSecretWord = false
    } 

    let wrongPassword = true
    while (wrongPassword) {
      newPass = await askThis('your new password: ')
      if (newPass.length > 7) wrongPassword = false
    }

    const requestResetPass = await fetchPost(
      `${CONF.httpProtocol}//${CONF.serverDomain}/reset-password`,
      {
        userName    : user,
        secretWord  : secret,
        newPassword : newPass, 
      }
    )

    console.log( requestResetPass.msg)
  }



  process.exit(0)
}







////////////////
//    MAIN    ///////////////////////////////////////////////
////////////////

function mainWork() {

  // main program, starts here and manages everything

  rl.question('user: ', async (myUser) => {

    myUser = myUser.toLowerCase().trim();

    if (myUser && myUser.match(/^@[a-z0-9_-]+$/)) {
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
              MY_USER + loginCheck.defaultRoom + '> '
            )
            rl.prompt()
            
            // exit loop
            askPass = false

          } else {
            //console.log('main/login rejected, resp =', loginCheck)
            rl.prompt()
          }

          


        } catch (error) {
          //console.log(`main/catch error =`, error)
          mainWork()
        }
      }



      ////////////////////////////
      //    LISTEN SERVER       //
      ////////////////////////////


      // connect web socket
      listenServer = new WebSocket(`${CONF.wsProtocol}//${CONF.serverDomain}/${MY_USER}?key=${MY_KEY}`)
      
      // listen server, for msg, and everything


      listenServer.on('open', () => {
        console.log('connected')
      })

      // on message - take care msg from server
      listenServer.on('message', (wsJson) => {

        const wsObj = JSON.parse( wsJson)
        readline.clearLine(rl.output, 0)
        readline.cursorTo(rl.output, 0)

        //console.log('onMsg, wsObj.msg =', wsObj.msg)

        if ( wsObj.type == 'system') {

          // handle like instruc from sys
          if ( typeof wsObj.msg == 'object') {

            if (wsObj.msg.actionRequired) {
              const sysMsg = wsObj.msg
            
              switch (true) {
                case ('changeModeTo' in sysMsg) && ('changeRoomTo' in sysMsg):
                  // sys orders to change both
                  /* sysMsg must be
                    {
                      actionRequired: true,
                      changeModeTo  : private|room,
                      changeRoomTo  : #<room>
                    }
                  */
                  myCurrentMode = sysMsg.changeModeTo
                  myCurrentRoom = sysMsg.changeRoomTo
                  rl.setPrompt(MY_USER + (sysMsg.changeRoomTo? sysMsg.changeRoomTo : '') + '> ')
                  rl.prompt()
                break;


                case (!('changeModeTo' in sysMsg)) && ('changeRoomTo' in sysMsg):
                  // sys orders to change room, not touch mode
                  myCurrentRoom = sysMsg.changeRoomTo;
                  rl.setPrompt(MY_USER + myCurrentRoom + '> ')
                  rl.prompt()
                break;

                case ('changeModeTo' in sysMsg) && (!('changeRoomTo' in sysMsg)):
                  // order to change mode, not room
                  // if mode changes to private, the prompt must be like @john> _
                  myCurrentMode = sysMsg.changeModeTo
                  rl.setPrompt(MY_USER + '> ')
                  rl.prompt()
                break;

                default:
                  console.log('unknown action from sys, act =', wsObj.msg)
              }
            }
            // other case may be in future  


          } else if (typeof wsObj.msg == 'string') {
            // general str msg
            console.log(`=> ${wsObj.msg} ~ ${hitTime( wsObj.time)}`)
          } else {
            // this is unknown
            console.log('! error = onMsg/ unknown typeof msg')
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



      listenServer.on('close',(code, reason) => {
        console.log('connection close, code =', code)
        process.exit(0)
      })

      listenServer.on('error', (error) => {
        console.error('WebSocket Error =', error)
        process.exit(1)
      })



      // listen user or monitor what she sending/typing
      // this func takes care all inputs from user
      listenUser() 



    } else {
      console.log(`Wrong user`);
      mainWork()
    }
  });
}
  



//////////////////////
//    LISTEN USER   ///////////////////////////////////////////   
//////////////////////
// what she sent from her keyboard?

// listenUser -----------------------------------------------
function listenUser() {
  rl.on('line', async (msg) => {

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
    //console.log( msg)

    switch (true) {

      // new addition to msg type
      case msg.startsWith('/'):
        
      // we have commands for server and for user sides so will handle them in this block

        if (msg.startsWith('/broadcast')) {
          const broadMsg = new WsMsg(
            'broadcast', myCurrentMode, myCurrentRoom, MY_USER,
            null,
            msg.replace('/broadcast ','').trimStart()
          )

          if (listenServer.readyState === WebSocket.OPEN) {
            listenServer.send( JSON.stringify( broadMsg))
          }

        } else if (msg.startsWith('/bye')) {
          listenServer.close( 1000, 'user leaves')


        } else if ( msg == '/changepassword') {

          const curPass = await askThis('current password: ')
          const newPass = await askThis('new password: ')
          
          if (listenServer.readyState === WebSocket.OPEN) {
            listenServer.send( JSON.stringify(
              new WsMsg(
                'command',myCurrentMode,myCurrentRoom,MY_USER,
                null,'/changepassword',
                {
                  password: curPass,
                  newPassword: newPass
                }
              )
            ))
          }


        /*} else if ( msg == '/resetpassword') {

          const secret = await askThis('your secret words: ')
          const newPass = await askThis('new password: ')

          if (listenServer.readyState === WebSocket.OPEN) {
            listenServer.send( JSON.stringify(
              new WsMsg(
                'command',myCurrentMode,myCurrentRoom,MY_USER,
                null,'/resetpassword',
                {
                  secretWord  : secret,
                  newPassword : newPass
                }
              )
            ))
          }

        */

        } else if ( msg == '/resign') {

          // resign = not use this thing anymore, delete all data & everything, clear & clean
          // and then this userName can be reused by others

          let pass
          let wrongPass = true
          while (wrongPass) {
            pass = await askThis('password: ')
            if (pass != '') wrongPass = false
          }
          
          if (listenServer.readyState === WebSocket.OPEN) {
            listenServer.send( JSON.stringify(
              new WsMsg( 
                'command',myCurrentMode,myCurrentRoom,MY_USER,null, 
                '/resign',
                { password: pass }
              )
            ))
          }


        } else { // commands for server
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
        }
        
        //console.log('sent msgPacket to wsServer =', msgObj)
      break;

      


      // chat msg in a room
      case !msg.startsWith('/') && !msg.startsWith('@') && !msg.startsWith('-'):

        //console.log('ws readyState =', listenServer.readyState)
        
        const chatMsg = new WsMsg(
              'chat', myCurrentMode, myCurrentRoom, MY_USER,
              null, msg, null
            )

        if (listenServer.readyState === WebSocket.OPEN) {
          listenServer.send( JSON.stringify(
            chatMsg            
          ))
          //console.log('sent chat msg =', chatMsg)

        } else {
          console.log('connection is closed')
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


      default:
        outputToHistory = `rejected, invalid msg`
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





// on close
rl.on('close', () => {
  process.exit(0);
});



//===============================
// FUNCTIONS
//===============================




// redrawPrompt------------------------------------
/*function redrawPrompt() {
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
*/


// redrawInputLine------------------------------------
/*function redrawInputLine() {
    if (rl.terminal) {
        // 1. Clear the current line (where the user is typing)
        readline.clearLine(rl.output, 0);
        // 2. Move cursor to the start of the line
        readline.cursorTo(rl.output, 0);
        // 3. Redraw the prompt and any text the user had already typed
        rl.prompt(true); 
    }
}
*/







// fetchPost----------------------------------------------
async function fetchPost( myUrl, myData ) {

  // connect http on POST and send data

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


// hitTime-------------------------------------------
function hitTime( timeStr ) {
  // return like: 20:30
  return new Date( timeStr)
      .toLocaleTimeString('en-US',{ hour12: false })
      .match(/\d{1,2}:\d\d/)[0];
}
 



// getUuid---------------------------------------------
function getUuid() {
    // Uses the imported uuidv4 function to generate a cryptographically
    // secure, universally unique identifier (UUID).
    return uuidv4();
}



// getHash------------------------------------------
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


// getInt----------------------------------------------
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


// getRandomWords----------------------------------------
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


// getRandomPassword------------------------------------
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


// makePromptReady-----------------------------------
function makePromptReady() {
  if (rl.terminal) {
    readline.moveCursor(rl.output, 0, -1)
    readline.clearLine(rl.output, 0)
    readline.cursorTo(rl.output, 0)
    rl.prompt()
  }
}
      


// makeRoomName---------------------------------------
function makeRoomName( roomName ) {
  // we're moving roomName to be always '#room' so this func will ensure we keep this format
  // if invalid name supplied, gets null

  if ( roomName.match(/^#?[\w-_]+$/)) {
    return roomName.startsWith('#')? roomName : '#' + roomName
  } else {
    return null
  }
}


// askThis--------------------------------------------
function askThis( question, mask = false) {
  // ask user and return user's input

  if (mask) {
    return getPass()
  } else {
    return new Promise( resolve => {
      rl.question( question, resolve)
    })
  }
}


// getObjFromStr--------------------------------------
function getObjFromStr( strInput ) {
  // strinput => user=asdfasdfasdf,pass=asdfasdfasdfasdf
  // output => { user: asdfasdf, pass: asdfasdfasdf }

  const keyVal = strInput.split(',')
  const output = {}
  keyVal.forEach( kv => {
    const [key, value] = kv.split('=')
    output[ key ] = value
  })
  return output
}





// getPass---------------------------------------------
async function getPass( myPrompt = 'password: ') {
  // get password from user prompt

  const prompt = myPrompt //'password: '

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
