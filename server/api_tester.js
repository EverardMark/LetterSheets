

async function request(params) {


	 let response = await fetch('http://13.114.51.50:8001/execute',
	    {
	        method:'POST',
	        body:JSON.stringify(params),
	        headers: {
	            'Accept': 'application/json',
	            'Content-Type': 'application/json'
	        }
	    }
	);

	let jsonResponse = await response.json();

	return jsonResponse;


}



//country : d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35
//state : 6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b
//city : d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35



let data = {

	user_id:"",
	firstname:"asdasda",
	lastname:"qweqewq",
	handle:"44444",

	company_id:"",
	name:"asdsads",
	address:"qweqeqwe",
	city:"d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35",
	state:"6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
	province:"",
	zip_code:"asdasdsad",
	country:"d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35"

}

let params1 = {
	func:"register",
	data:data
}

let retPID = await request(params1);



console.log(retPID)
