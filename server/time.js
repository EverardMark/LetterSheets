
import moment from "moment"


export default class Time{





	static async get(params){



		let ipAddress = params.ip.replace("::ffff:", "");

		let response = await fetch('https://api.ipgeolocation.io/v2/timezone?apiKey=375ffc4cc8c44f4ea5d21f0b1ab973cf&ip=' + ipAddress);

		const data = await response.json();

		//2025-05-09 23:38:12

		let dateTime = data.year + '-' + data.month + '-' + data.day + ' ' + data.hour + ':' + data.minute + ':' + data.seconds;

		let dateTimeFormatted = moment(data.time_zone.date_time, "YYYY-MM-DD HH:mm:ss").format("YYYY-MM-DD HH:mm:ss");

		let ret = {datetime:dateTimeFormatted, tz:data.time_zone.name};

		return ret;

	}


	static getTimeStamp(){


		return moment().format();

	}




}