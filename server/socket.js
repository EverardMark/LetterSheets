import express from 'express';

import DB from './db.js'

import { Server } from "socket.io";

import https from 'https'

import * as fs from 'node:fs'

import Functions from './functions.js'


export default class Socket{

	constructor(jsonConfig) {


		this.jsonConfig = jsonConfig;

		this.app = express();

		this.io = null;

		this.functions = new Functions(jsonConfig);


	}


}