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

// null: Cognito keeps no key for her (deleted after the move to Privy, or a member who never had one; key backup,
// 29 Oct). undefined (from handleGetEncryptedPrivateKey): it could not be read.
const getEncryptedKey = async (token) => {
    const attr = await getUserAttributes(token)
    return attr.UserAttributes.find(item => item.Name === 'custom:encryptedPrivateKey')?.Value ?? null
}

/** A Cognito access token that has not expired (refreshed and stored when it had). */
export const freshAccessToken = async (db) => {
    if (!isTokenExpired(db['jwt_token'])) return db['jwt_token']
    const response = await refreshSession(db['refresh_token'])
    await updateItem({ id: 'jwt_token', value: response.AccessToken },'Init');
    return response.AccessToken
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

    return getEncryptedKey(await freshAccessToken(db))
} catch (e) {
    console.error(e)
}
}