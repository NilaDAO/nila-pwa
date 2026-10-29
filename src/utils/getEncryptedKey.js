import { jwtDecode } from "jwt-decode";
import { getUserAttributes,refreshSession} from './cognito_helpers'
import { updateItem } from './db';

const AES = require("crypto-js/aes");
const Utf8 = require("crypto-js/enc-utf8");

// Decode JWT and check expiry
const isTokenExpired = (token) => {
    const { exp } = jwtDecode(token);
    return Date.now() >= exp * 1000;
    };

const getEncryptedKey = async (token) => {
    const attr = await getUserAttributes(token)
    return attr.UserAttributes.filter(item => item.Name === 'custom:encryptedPrivateKey')[0]['Value']
}

// Decrypt the private key
export const decryptPrivateKey = async (encryptedKey, salt) => {
    try {
        const decryptedBytes = AES.decrypt(encryptedKey, salt);
        const decryptedKey = decryptedBytes.toString(Utf8);
        return decryptedKey;
    } catch (e){        
        // the salt is probably wrong because of a signup on another device. Show mismatchdevice screen
        console.error(e)
    }
    };

export const handleGetEncryptedPrivateKey = async (db) => {
try {
    // Local dev override: if a local_pk was injected (by nila local inject-wallet),
    // skip Cognito entirely and return it directly.
    if (db['local_pk']) {
        return db['local_pk'];
    }

    const refresh_token = db['refresh_token']
    const jwt_token = db['jwt_token']

    if (isTokenExpired(jwt_token)) {
        // refresh token
        const response = await refreshSession(refresh_token)
        // set new jwt
        await updateItem({ id: 'jwt_token', value: response.AccessToken },'Init'); // temporary jwt token
        // use new jwt to fetch EPK
        return getEncryptedKey(response.AccessToken)
    } else {
        return getEncryptedKey(db['jwt_token'])
    }
} catch (e) {
    console.error(e)
}
}