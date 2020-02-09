var express = require('express');
var request = require('request');
var bodyParser = require('body-parser');
var watson = require('watson-developer-cloud');
var mysql  = require('mysql');



//à remplacer **************************************
var watsonSkillId = "42e1a173-5cb4-4a7a-896f";
var watsonApiKey = "";
// s'arreter avant /v1
var watsonLegacyv1WorkspaceURL ="https://api.eu-gb.assistant.watson.cloud.ibm.com/instances/ba3e7f27-4e83-4906-86eb";

var myRDSHost ="database-2.ctdswicaffyc.eu-west-3.rds.amazonaws.com";
var myRDSLogin ="admin";
var myRDSPassword ="youhou";

var myFacebookToken ="";


var host = (process.env.VCAP_APP_HOST || 'localhost');
var port = (process.env.VCAP_APP_PORT || 3000);
/*var myUsername = process.env.CONVERSATION_USERNAME;
var myPassword = process.env.CONVERSATION_PASSWORD;
var myUrl = process.env.CONVERSATION_URL;*/
var app = express();

// Assistant Watson V1
var conversation = new watson.AssistantV1({
    version :"2018-10-12",
    username: "apikey",
    password: watsonApiKey,
    url: watsonLegacyv1WorkspaceURL,
    
});

var contexid = "";


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
    debug: true
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
    conversation.message(payload, function(err, data) {
        console.log(data)
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
    console.log(payload);
    conversation.message(payload, function(err, data) {
        console.log(data)
        if (err)
            return console.log('error:', err);
        
        if(data.context != null){
            contexid = data.context;
        }
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
        res.send(data);
        //res.json("{'message':"+data.output.text+"},{'context':"+data.context+"}");
       }); 
}

app.post('/message', function (req, res) {
       
     var payload = {
       workspace_id: watsonSkillId, 
       input: req.body.input,
       context: req.body.context || {}
     }

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
    callWatsonClient(payload,res);
    

});
app.get('/message', function (req, res) {
       
     console.log("youhou");
    

});
var path = require('path');
app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname + '/index.html'));
});
/* CLIENT HTML END **************************************************************************************/


console.log("ok");
app.listen(port, host);



//Pour tester un appel simple de Watson Assistant
/*conversation.message({
  workspace_id: myWorkspace,
  input: {'text': 'reservation'}
},  function(err, response) {
  if (err)
    console.log('error:', err);
  else
    console.log(JSON.stringify(response, null, 2));
});
*/
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
