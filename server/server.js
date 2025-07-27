
import App from './app.js'

import Socket from './socket.js'

import File from './file.js';



export default class Server{

	constructor() {


		this.file = new File();

		this.jsonConfig = this.file.read('./config.json');


		this.app = new App(this.jsonConfig);

		this.socket = new Socket(this.jsonConfig, this.app);
		

	}


	async run(){

		this.app.serve();


	}



}