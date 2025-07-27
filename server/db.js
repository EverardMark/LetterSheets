import File from './file.js';



export default class DB{

	constructor(connectionPool) {

		this.connectionPool = connectionPool;

		this.file = new File();

	}

	async execute(sp, params){


		let self = this;

		let ret = {'error':null,'result':null};

		return new Promise(async(resolve, reject) => {

			var query = 'CALL ' + sp + '(';

			for(var i = 0; i < params.length; i++){

				query = query + '?' + ','

			}

			query = query.replace(/,\s*$/, "");

			query = query + ')';

			try{


				let q = await self.connectionPool.query(query, params);

				ret = {'error':null, 'result':q[0][0]}

				resolve();

			}catch(ex){

				ret = {'error':ex, 'result':null}

				self.file.writeLog(ex)

			}

		}).then(() => {

			return ret;

		})


	}


}