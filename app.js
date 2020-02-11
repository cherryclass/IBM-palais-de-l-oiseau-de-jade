var express = require('express');
var request = require('request');
var bodyParser = require('body-parser');
var mysql  = require('mysql');
const AssistantV2 = require('ibm-watson/assistant/v2');
const { IamAuthenticator } = require('ibm-watson/auth');


//à remplacer **************************************
var watsonApiKey = "";
var watsonURL ="https://api.eu-gb.assistant.watson.cloud.ibm.com/instances/ba3e7f27-4e83-4906-86eb-2e206f355592";
var watsonID='1541c493-2a0e-4014-9c08-';

var myRDSHost ="database-2.ctdswicaffyc.eu-west-3.rds.amazonaws.com";
var myRDSLogin ="admin";
var myRDSPassword ="";

var myFacebookToken ="";


var host = (process.env.VCAP_APP_HOST || 'localhost');
var port = (process.env.VCAP_APP_PORT || 3000);
/*var myUsername = process.env.assistant_USERNAME;
var myPassword = process.env.assistant_PASSWORD;
var myUrl = process.env.assistant_URL;*/
var app = express();

console.log("demarrage");
//assistant v2
const assistant = new AssistantV2({
version: '2019-02-28',
authenticator: new IamAuthenticator({
apikey: watsonApiKey,
}),
url: watsonURL,
});



 function  createSession(first) {
assistant.createSession({
assistantId: watsonID }).then(res => {
  sessionId=res.result.session_id;
  
  if(first){
   console.log("\x1b[32m%s\x1b[0m","new session "+sessionId);
  }else{
	console.log("session id :"+ sessionId);
	console.log("http://"+host+":"+port);
  }
  
});

}
createSession();


// Mysql - MariaDB
//var services = JSON.parse(process.env.VCAP_SERVICES);
//var mysql_creds = services['compose-for-mysql'][0].credentials;
//var res = mysql_creds.uri.split(/\@|:|\//);
var db = mysql.createConnection({
host: myRDSHost,
port : 3306,
user: myRDSLogin,
password: myRDSPassword,
database: "poj",
debug: false
});


app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.get('/webhook/', function (req, res) {
if (req.query['hub.verify_token'] === myFacebookToken) {
  res.send(req.query['hub.challenge']);
}
res.send('Erreur de token');
});




//message de l'app à Messenger
function sendMessage(sender, text_) {
text_ = text_.substring(0, 319);
messageData = { text: text_ };

request({
  url: 'https://graph.facebook.com/v3.1/me/messages',
  qs: { access_token: myFacebookToken },
  method: 'POST',
  json: {
      recipient: { id: sender },
      message: messageData,
  }
}, function (error, response, body) {
  if (error) {
      console.log('Error sending message: ', error);
  } else if (response.body.error) {
      console.log('Error: ', response.body.error);
  }
});
}


//Reception de Messenger et appel de callWatson
app.post('/webhook/', function (req, res) {
var text = null;
messaging_events = req.body.entry[0].messaging;
for (i = 0; i < messaging_events.length; i++) { 
  event = req.body.entry[0].messaging[i];
  sender = event.sender.id;

  if (event.message && event.message.text) {
      text = event.message.text;
  }else if (event.postback && !text) {
      text = event.postback.payload;
  }else{
      break;
  }     


var payload ={
assistantId: watsonID,
sessionId: sessionId,
input: {
message_type: 'text',
text: text,
options: {
  'return_context': true
}
},
context:  {
'global': {
  'system': {
    'user_id': 'my_user_id'
      }
},
  'skills': {
  'main skill': {
    'user_defined': {
      'option': null
       }
  }
}
}
};

if(req.body.context !="")
payload.context=req.body.context;

mesVariables=payload.context.skills['main skill'].user_defined;

  if(mesVariables.option !=null){
    //recherche dans la base le prix de l'option
           var query='select prix from option where libelle="'+mesVariables.option+'")';
           db.query(query, function (error, results, fields) {
           if (error) {
            console.log(JSON.stringify(error));
           }
          mesVariables.prixoption = results;
          });
  }   
      
  //nombre de chambre défini 
  if(mesVariables.nb_chambre !=null){
              //montant de la chambre envoyé au chatbot
              mesVariables.total=100;
  }


  callWatsonClient(payload,sender,true);
 
}
res.sendStatus(200);
});
/* MESSENGER END **************************************************************************************/


/* CLIENT HTML **************************************************************************************/
function callWatsonClient(payload,res,messenger) {
console.log("\x1b[32m%s\x1b[0m",JSON.stringify(payload));
assistant.message(payload,function(err, data) {
	   if(data == null){         
			createSession(true);
			var data ={result:{context:"",output:{generic:[{text:"session expirée, renvoyez le message"}]}}};
				//payload.sessionId=sessionId;			
			res.send(data);
  		
	}else{


  console.log("\x1b[33m%s\x1b[0m" ,JSON.stringify(data.result.output));
  if (err)
      return console.log('error:', err);
  

  mesVariables=data.result.context.skills['main skill'].user_defined;

  //reservation
  if(mesVariables.confirmation !=null){
          
  //variables de context du chatbot
          var date_reservation= mesVariables.date_reservation;
          var nb_chambres= mesVariables.nb_chambre;
          var room_category= mesVariables.room_category;
  //requete d'insertion
         var query='insert into reservation (idC,nbChambres,dateDebut,nbJour,categorie) values(null,'+nb_chambres+',"'+date_reservation+'",'+"null"+',"'+room_category+'")';
          db.query(query, function (error, results, fields) {
          if (error) {
            console.log(JSON.stringify(error));
          }
        });
		        data.result.context="";
      }


    if(messenger){
                var i = 0;
                while(i < data.result.output.text.length){
                    sendMessage(sender, data.result.output.text[i++]);
                }    
    }else{
            res.send(data);
      }

     }
 });


}

app.post('/message', function (req, res) {

var payload ={
assistantId: watsonID,
sessionId: sessionId,
input: {
message_type: 'text',
text: req.body.input.text,
options: {
  'return_context': true
}
},
context:  {
'global': {
  'system': {
    'user_id': 'my_user_id'
      }
},
  'skills': {
  'main skill': {
    'user_defined': {
      'option': null
       }
  }
}
}
};

if(req.body.context !="")
payload.context=req.body.context;

mesVariables=payload.context.skills['main skill'].user_defined;

  if(mesVariables.option !=null){
    //recherche dans la base le prix de l'option
           var query='select prix from option where libelle="'+mesVariables.option+'")';
           db.query(query, function (error, results, fields) {
           if (error) {
            console.log(JSON.stringify(error));
           }
          mesVariables.prixoption = results;
          });
  }   
      
  //nombre de chambre défini 
  if(mesVariables.nb_chambre !=null){
              //montant de la chambre envoyé au chatbot
              mesVariables.total=100;
  }
callWatsonClient(payload,res,false);


});
app.get('/message', function (req, res) {       
console.log("Il faut une methode POST");   

});
var path = require('path');
app.get('/', function (req, res) {
res.sendFile(path.join(__dirname + '/index.html'));
});
/* CLIENT HTML END **************************************************************************************/

app.listen(port, host);
