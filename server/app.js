import express from 'express';

import { Server } from "socket.io";

import * as fs from 'node:fs'

import path  from 'path'

import http from 'http'

import multer from 'multer'

import bodyParser from 'body-parser'


import Functions from './functions.js'




export default class App{


	constructor(jsonConfig, app) {

		this.jsonConfig = jsonConfig;

		const storage = multer.diskStorage({
	        destination: function (req, file, cb) {
	            cb(null, 'temp/')
	        },
	        filename: function (req, file, cb) {
	            cb(null, file.originalname)
	        }
    	});


		this.app = express();


		this.app.use(bodyParser.json());
		this.app.use(bodyParser.urlencoded({ extended: true }));

		this.upload = multer({ storage: storage });

		this.functions = new Functions(jsonConfig);


	}

	serve(){

		let self = this;

		this.app.use('/media', express.static('./files'))


		this.app.post('/execute', async function(req, res) {


			let ret = await self.functions.appSelect(req.body.func, req);

			if(ret.error){


				res.send(500).end();

			}else{

				res.send(ret.result)


			}



		});



		/*const options = {
		  key: fs.readFileSync('/home/ubuntu/app_rev/ssl/pxl_mobile_server.key', 'ascii'),
		  cert: fs.readFileSync('/home/ubuntu/app_rev/ssl/fa105bd0bd15f4be.crt', 'ascii'),
		  ca: fs.readFileSync('/home/ubuntu/app_rev/ssl/gd_bundle-g2.crt', 'ascii'),
		};*/

		const httpServer = http.createServer(this.app);


		httpServer.listen(this.jsonConfig.app_port, function(){

			console.log('Listening on port ' + self.jsonConfig.app_port);

		});


	}

}
