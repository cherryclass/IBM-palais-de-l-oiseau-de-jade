var express = require('express');
var request = require('request');
var bodyParser = require('body-parser');
var watson = require('watson-developer-cloud');
var mysql  = require('mysql');


//à remplacer **************************************
var myWorkspace = "";
var myFacebookToken ="";


var host = (process.env.VCAP_APP_HOST || 'localhost');
var port = (process.env.VCAP_APP_PORT || 3000);
var myUsername = process.env.CONVERSATION_USERNAME;
var myPassword = process.env.CONVERSATION_PASSWORD;
var myUrl = process.env.CONVERSATION_URL;

var app = express();
var contexid = "";

var conversation = new watson.ConversationV1({
 	version: 'v1',
    username: myUsername,
    password: myPassword,
    url: myUrl,
    version_date:'2018-08-07'
});

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


var services = JSON.parse(process.env.VCAP_SERVICES);
var mysql_creds = services['compose-for-mysql'][0].credentials;
var res = mysql_creds.uri.split(/\@|:|\//);
var db = mysql.createConnection({
    host: res[5],
    port : res[6],
    user: "admin",
    password: res[4],
    database: "compose",
    debug: true
  });


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

//message de l'app nodejs à Watson et inversement
function callWatson(payload, sender) {
	conversation.message(payload, function (err, convResults) {
		 console.log(convResults);

        //message de Watson
		contexid = convResults.context;
		
        if (err) {       	
            sendMessage(sender, "erreur du service");
            return responseToRequest.send("Error.");
        }
		
		if(convResults.context != null)
    	   conversation_id = convResults.context.conversation_id;
        if(convResults != null && convResults.output != null){

            //reservation
            if(convResults.context.confirmation !=null){
                
                var date_reservation= convResults.context.date_reservation;
                var nb_chambres= convResults.context.nb_chambre;
                var room_category= convResults.context.room_category;
                var query='insert into reservation (idC,nbChambres,dateDebut,nbJour,categorie) values(null,'+nb_chambres+',"'+date_reservation+'",null,"'+room_category+'")';
                db.query(query, function (error, results, fields) {
                if (error) {
                  console.log(JSON.stringify(error));
                }
              });

            }
			var i = 0;
			while(i < convResults.output.text.length){
				sendMessage(sender, convResults.output.text[i++]);
			}
		}
            
    });
}

//message de l'app à messenger
function sendMessage(sender, text_) {
	text_ = text_.substring(0, 319);
	messageData = {	text: text_ };

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


var conversation_id = "";
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.get('/webhook/', function (req, res) {
	if (req.query['hub.verify_token'] === myFacebookToken) {
        res.send(req.query['hub.challenge']);
    }
    res.send('Erreur de token');
});


//message de messenger à l'app 
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
			workspace_id: myWorkspace
		};

		if (params) {
			if (params.input) {
				params.input = params.input.replace("\n","");
				payload.input = { "text": params.input };
			}
			if (params.context) {
				payload.context = params.context;
			}
		}
		callWatson(payload, sender);
    }
    res.sendStatus(200);
});


app.listen(port, host);

