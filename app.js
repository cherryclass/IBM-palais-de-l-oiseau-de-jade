var express = require('express');
var request = require('request');
var bodyParser = require('body-parser');
var mysql  = require('mysql');
const AssistantV2 = require('ibm-watson/assistant/v2');
const { IamAuthenticator } = require('ibm-watson/auth');


//à remplacer **************************************
var watsonApiKey = "";
var watsonURL ="https://api.eu-gb.assistant.watson.cloud.ibm.com/instances/ba3e7f27-4e83-4906-86eb-2e206f355592";
var watsonID='1541c493-2a0e-4014-9c08-c27744e4aa08';

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


//assistant v2
const assistant = new AssistantV2({
  version: '2019-02-28',
  authenticator: new IamAuthenticator({
    apikey: watsonApiKey,
  }),
  url: watsonURL,
});


var sessionId="";
assistant.createSession({
  assistantId: '1541c493-2a0e-4014-9c08-c27744e4aa08' })  .then(res => {
    
    sessionId=res.result.session_id;
    console.log("session id :"+ sessionId);
  });


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




/* MESSENGER **************************************************************************************/
//appel de Watson Assistant et insertion de la reservation dans Mysql. Puis appel de sendMessage pour envoie vers Messenger
function callWatson(payload, sender) {
    assistant.message(payload, function(err, data) {
        console.log(JSON.stringify(data.result.output))
        if (err)
            return console.log('error:', err);
        
        if(data.context != null){
            contexid = data.context;
           
        }

        if(data != null && data.output != null){

            //reservation
            if(data.context.confirmation !=null){
                
        //variables de context du chatbot
                var date_reservation= data.context.date_reservation;
                var nb_chambres= data.context.nb_chambre;
                var room_category= data.context.room_category;
        //requete d'insertion
               var query='insert into reservation (idC,nbChambres,dateDebut,nbJour,categorie) values(null,'+nb_chambres+',"'+date_reservation+'",'+"null"+',"'+room_category+'")';
                db.query(query, function (error, results, fields) {
                if (error) {
                  console.log(JSON.stringify(error));
                }
              });

            }
            var i = 0;
            while(i < data.output.text.length){
                sendMessage(sender, data.output.text[i++]);
            }
        }

            
    });
}

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
        var params = {
            input: text,
            context:contexid
        }
        var payload = {
            workspace_id: watsonSkillId,            
            input: req.body.input || {}
          };
        if (params) {
            if (params.input) {
                params.input = params.input.replace("\n","");
                payload.input = { "text": params.input };
            }
            if (params.context) {
                payload.context = params.context;
         
        if(payload.context.option !=null){
          //recherche dans la base le prix de l'option
                 var query='select prix from option where libelle="'+payload.context.option+'")';
                 db.query(query, function (error, results, fields) {
                 if (error) {
                  console.log(JSON.stringify(error));
                 }
        payload.context.prixoption = results;
                });
        }   
            
        //nombre de chambre défini 
        if(payload.context.nb_chambre !=null){
                    //montant de la chambre envoyé au chatbot
                    payload.context.total=100;
                }

            }
        }
        callWatson(payload, sender);
    }
    res.sendStatus(200);
});
/* MESSENGER END **************************************************************************************/



/* CLIENT HTML **************************************************************************************/
function callWatsonClient(payload,res) {
    console.log("\x1b[32m%s\x1b[0m",JSON.stringify(payload));
    assistant.message(payload, function(err, data) {
        console.log("\x1b[44m%s\x1b[0m" ,JSON.stringify(data.result.output));
        if (err)
            return console.log('error:', err);
        

        mesVariables=data.result.context.skills['main skill'].user_defined;


        /*if(data.context != null){
            contexid = data.context;
        }*/
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

            }
        res.send(data);
        //res.json("{'message':"+data.output.text+"},{'context':"+data.context+"}");
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
    callWatsonClient(payload,res);
    

});
app.get('/message', function (req, res) {       
     console.log("Il faut une methode POST");   

});
var path = require('path');
app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname + '/index.html'));
});
/* CLIENT HTML END **************************************************************************************/


console.log("host: "+host+ "port: "+port);
app.listen(port, host);



//Pour tester Mysql
/*
db.query('SELECT * from reservation', function (error, results, fields) {
    if (error) {
      console.log(JSON.stringify(error));
    } else {
      console.log(JSON.stringify(results));
    }
  });
*/
