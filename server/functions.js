

import User from './user.js'

import Company from './company.js'

import mysql from 'mysql2/promise';

import { createClient } from "redis";

export default class Functions{

	constructor(jsonConfig) {

		let self = this;

		this.jsonConfig = jsonConfig;

		this.connectionPool = mysql.createPool({
		    host: jsonConfig.database.host,
		    user: jsonConfig.database.user,
		    password: jsonConfig.database.password,
		    database: jsonConfig.database.name
		});

		let f = async () => {

			self.redisClient = await createClient()
			  .on("error", (err) => console.log("Redis Client Error", err))
			  .connect();

		}

		f();


	}

	async appSelect(func, params){

		let ret = null;

		let obj = null


		if(
			params.body.func === "get_countries" ||
			params.body.func === "get_states" ||
			params.body.func === "get_provinces" ||
			params.body.func === "get_cities_by_province" ||
			params.body.func === "get_cities_by_state" ||
			params.body.func === "register" 
		){



			switch(func){


				case "register":

					let company = new Company(this.connectionPool);

					ret = await company.register(params);

					let companyId = ret.result[0].result;


					let user = new User(this.connectionPool);

					ret = await user.register(params);

					let userId = ret.result[0].result;


					ret = await company.insertUpdateUser(companyId, userId);


					break;


				case "get_countries":

					obj = new Company(this.connectionPool);

					ret = await obj.getCountries();

					break;


				case "get_states":

					obj = new Company(this.connectionPool);

					ret = await obj.getStates(params);

					break;


				case "get_provinces":

					obj = new Company(this.connectionPool);

					ret = await obj.getProvinces(params);

					break;

				case "get_cities_by_province":

					obj = new Company(this.connectionPool);

					ret = await obj.getCitiesByProvince(params);

					break;


				case "get_cities_by_state":

					obj = new Company(this.connectionPool);

					ret = await obj.getCitiesByState(params);

					break;


			}


		}else{



		}

		return ret;


	}


}