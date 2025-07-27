
import DB from './db.js'

import Time from './time.js'

import Crypto from './crypto.js'


export default class Company{


	constructor(connectionPool) {


		this.db = new DB(connectionPool);

	}

	async insertUpdateUser(company, user){


		let p = [
			company,
			user
		]

		let ret = await this.db.execute("spInsertUpdateCompanyUser", p)


		return ret;


	}


	async register(params){


		let p = [
			params.body.data.company_id,
			params.body.data.name,
			params.body.data.address,
			params.body.data.city,
			params.body.data.state,
			params.body.data.province,
			params.body.data.zip_code,
			params.body.data.country
		]

		let ret = await this.db.execute("spInsertUpdateCompany", p)


		return ret;


	}


	async getCountries(){


		let ret = await this.db.execute("spGetCountries", [])


		return ret;

	}

	async getStates(params){


		let ret = await this.db.execute("spGetStates", [params.body.data.country])


		return ret;

	}

	async getProvinces(params){


		let ret = await this.db.execute("spGetProvinces", [params.body.data.country])


		return ret;


	}

	async getCitiesByProvince(params){


		let ret = await this.db.execute("spGetCitiesByProvince", [params.body.data.province])


		return ret;

	}

	async getCitiesByState(params){


		let ret = await this.db.execute("spGetCitiesByState", [params.body.data.province])


		return ret;

	}



}