


import { initCrypto, VirgilCrypto } from 'virgil-crypto';

export default class Crypto{


    constructor() {




        

    }


    async verifySingature(publicKey, hash, signature){

        let verified = false;

        return new Promise(async(resolve, reject) => {

            initCrypto().then(() => {

                const virgilCrypto = new VirgilCrypto();

                let pk = virgilCrypto.importPublicKey(publicKey);

                verified = virgilCrypto.verifySignature(hash, signature, pk);

                resolve();

            
            });

        }).then(() => {


            return verified;

        })


    }

    

}




