const { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } = require("@aws-sdk/client-cognito-identity-provider")
const { ethers } = require("ethers")
const algosdk = require('algosdk');
const { AES } = require('crypto-js')
const Utf8 = require("crypto-js/enc-utf8");
const { mnemonic } = require('@vechain/sdk-core');
require("dotenv").config();

const client = new CognitoIdentityProviderClient({ region: 'ap-south-1' });


const subsidize = async (chain,address) => {
  console.log('chain',chain )
  console.log('address',address )
  console.log('subsidy key', process.env.PUBLIC_KEY)
  const MIN_BAL = ethers.parseEther('0.2');  // skip if wallet already has this much POL
  const TOP_UP  = ethers.parseEther('0.8');  // amount to send when subsidizing

  if (chain === '416002'){
  } 
  else if (chain === '100010'){
  } 
  else {
      if(chain === '137' ){
        const provider = new ethers.JsonRpcProvider(process.env.RPC);
        console.log('provider', provider)
        const network = await provider.getNetwork();
        // Optional: Test the connection
        const blockNumber = await provider.getBlockNumber();
        // continue

        console.log('blockNumber', blockNumber)

        const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        console.log('Signer Address:', signer.address);
        const bal = await provider.getBalance(address);
        console.log('current POL balance', bal.toString());
        if (bal >= MIN_BAL) {
          console.log('Skipping subsidy: balance above threshold');
          return;
        }
          try {
            await signer.sendTransaction({
              to: address,
              value: TOP_UP,
            }).then( async (tx) => {
              console.log(`Transaction sent: ${tx.hash}`);
            })
          }
          catch (error){

            console.log('something went wrong', error);

          }
      } else {
        console.log('no rpc set OR chain unknown.');
      }
  }; 
}

const encryptPrivateKey = async (chain,salt) => {
  if (chain === '416002'){
    // generate algo account
    const account = algosdk.generateAccount()
    const secretKey =  Buffer.from(account.sk).toString('hex')
    const encryptedPrivateKey = AES.encrypt(secretKey, salt).toString()
    const address = account.addr
    return {
      encryptedPrivateKey: encryptedPrivateKey,
      address: address,
  }  } else if (chain === '100010'){
    // generate ve account
    const randomMnemonic = mnemonic.generate();
    const privateKey = mnemonic.derivePrivateKey(randomMnemonic)
    const address = mnemonic.deriveAddress(randomMnemonic)
    const secretKey = Buffer.from(privateKey).toString('hex');
    const encryptedPrivateKey = AES.encrypt(secretKey, salt).toString()
    return {
      encryptedPrivateKey: encryptedPrivateKey,
      address: address,
  }  } else {
    // generate eth account
    const account = ethers.Wallet.createRandom()
    const secretKey = account.privateKey
    console.log('original private key', secretKey)
    console.log('original salt', secretKey)
    const encryptedPrivateKey = AES.encrypt(secretKey, salt).toString()
    console.log('ENCRYPTED ORIGINAL', encryptedPrivateKey)
    const address = account.address
    return {
      encryptedPrivateKey: encryptedPrivateKey,
      address: address,
  }
  }
}

const re_encryptPrivateKey = async (ePK,salt,prevsalt) => {
  // decrypt the private key with the old salt
  console.log('ENCRYPTED ORIGINAL', ePK, 'prevsalt', prevsalt)
  const decryptedBytes = AES.decrypt(ePK, prevsalt);
  const decryptedKey = decryptedBytes.toString(Utf8);
  console.log('decryptedKey', decryptedKey)
  // encryp the pk with the new salt
  return AES.encrypt(decryptedKey, salt).toString()
}

const updateUserAttributes = async (encryptedPrivateKey,address,salt,userPoolId, userName) => {
  // Set custom attributes pk and enc_pk    
  console.log('encryptedPrivateKey',encryptedPrivateKey);
  console.log('address',address);
  console.log('salt',salt);
  console.log('userPoolId, userName', userPoolId, userName)

  try {
      const command = new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: userName,
        UserAttributes: [
        {
            Name: 'custom:encryptedPrivateKey',
            Value: encryptedPrivateKey
        },
        {
            Name: 'custom:address',
            Value: address
        },
        {
            Name: 'custom:prevsalt',
            Value: salt
        },
        {
            Name: 'custom:salt_',
            Value: ''
        },
        ]
      });
      await client.send(command);
      console.log('Custom attributes set successfully');
  } catch (error) {
      console.error('Error setting custom attributes:', error);
  }  
}

exports.handler = async (event) => {
  console.log('event', event);
  console.log('Verify Auth Challenge Response event:', JSON.stringify(event));
  // confirms the OTP code
  // if SALTS are unequal, replace decryption code

  // method creates new wallet based on the selected chain
  // the PK is stored as an attribute
  // it uses Salt to encrypt PK and send the PK to the user
  // subsidizes the account

  const address = event.request.userAttributes['custom:address']
  const chain = event.request.userAttributes['custom:chain']
  console.log('chain', chain)
  //const salt = event.request.userAttributes['custom:salt_']
  const salt = event.request.clientMetadata.salt;
  const prev_salt = event.request.userAttributes['custom:prevsalt']
  const ePK = event.request.userAttributes['custom:encryptedPrivateKey']
  const expectedAnswer = event.request.privateChallengeParameters['otp'];
  const userAnswer = event.request.challengeAnswer;

  const { userPoolId, userName } = event;

  console.log('SaLTS',salt,'old:',prev_salt);
  console.log('ePK at start',ePK);

  if (userAnswer === expectedAnswer) {
      event.response.answerCorrect = true;
  } else {
      event.response.answerCorrect = false;
  }
  
  // subsidize if POL balance is below threshold
  await subsidize(chain,address)

  // this account is new
  if(!prev_salt){
    console.log('new account');
    // generate private key from chain and encrypt with salt
    const { encryptedPrivateKey, address } = await encryptPrivateKey(chain,salt)
    // subsidize new wallet for NFT mint
    await subsidize(chain,address)
    // update new keys and account in user attributes
    await updateUserAttributes(encryptedPrivateKey,address,salt,userPoolId, userName)
  } else if (salt !== prev_salt){
      console.log('ACCOUNT RECOVERY')
      const encryptedPrivateKey = await re_encryptPrivateKey(ePK,salt,prev_salt)
      console.log('re-encrypted key', encryptedPrivateKey)
      // update new keys and account in user attributes
      await updateUserAttributes(encryptedPrivateKey,address,salt,userPoolId, userName)
  }
  return event;

}
