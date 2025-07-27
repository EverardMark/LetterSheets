

import { readFileSync, appendFileSync } from 'fs';

import moment from 'moment';

export default class File{


    constructor() {


    }

    writeLog(value){

        const dateTimeNow = moment().format('YYYY-MM-DD HH:mm:ss');

        appendFileSync('error.log', dateTimeNow + ' ' + value + '\n');
    }


    read(filename){

        const config = readFileSync(filename, { encoding: 'utf8', flag: 'r' });

        let jsonConfig = null;

        try {

            jsonConfig = JSON.parse(config);

        }catch(ex){

            this.writeLog(ex.toString())
        }

        return jsonConfig;

    }



}




