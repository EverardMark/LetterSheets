
import DB from './db.js'

import Time from './time.js'

import Crypto from './crypto.js'


export default class User{


	constructor(connectionPool) {


		this.db = new DB(connectionPool);

	}


	async register(params){


		let p = [
			params.body.data.user_id,
			params.body.data.firstname,
			params.body.data.lastname,
			params.body.data.handle
		]

		let ret = await this.db.execute("spInsertUpdateUser", p)


		return ret;


	}


}