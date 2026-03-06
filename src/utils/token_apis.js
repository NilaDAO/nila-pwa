// token_apis.js
import { ethers } from 'ethers';
import { Buffer } from 'buffer';
import { UnConfirmed,Confirmed,FetchThumb } from './token_api_helper';
import nilaTokenAbi from '../components/ABI/NilaToken.json';
import nilaGrantAbi from '../components/ABI/NilaGrant.json';
import nilaUnionAbi from '../components/ABI/NilaUnion.json';
import landTitleAbi from '../components/ABI/NilaLandTitleWithName.json'; //NilaLandTitleWithName
import priceFeedAbi from '../components/ABI/USDCPriceFeed.json';
import { readItem, createItem, updateItem } from './db';

const USDCpriceFeedAddress = '0x1b8739bB4CdF0089d07097A9Ae5Bd274b29C6F16'; 
const landTitleAddress = '0x663DC13009D004aF3654a45f22A215De71633918' //'0xDaA548e6Bfd8D0C46F0bD3509d50801590422a1C'
const nilaTokenContract = '0x10D11eDD572ccb54D6D59f07521eA071Ed1C326E'
const nilaGrantContract = '0x119a09055eDf0E204112948eE580bA2A236c01b0'
const POLYGON_PROVIDER_URL = process.env.REACT_APP_RPC

async function getLatestPrice(provider) {
  const priceFeed = new ethers.Contract(USDCpriceFeedAddress, priceFeedAbi, provider);
  const latestRoundData = await priceFeed.latestRoundData();
  return latestRoundData.answer.toString();
}

function hexToBytes(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return new Uint8Array(bytes);
}

export const mintNFT = async (privateKey,Address,chain,signature_hex,metadata_uri,farmname) => {
  if (chain === '137') {
    try {
      // Provider
      const provider = new ethers.JsonRpcProvider(POLYGON_PROVIDER_URL);
      // decrypted private key to initiate wallet
      const wallet = new ethers.Wallet(privateKey, provider);

      // init contract 
      const contract = new ethers.Contract(landTitleAddress, landTitleAbi, wallet);

      // transform hex signature to bytes
      const signature_bytes = hexToBytes(signature_hex)

      //console.log('Address,metadata_uri,signature_bytes',Address,metadata_uri,signature_bytes)
      const gasEstimate = await contract.mintAndSend.estimateGas(Address,metadata_uri,farmname,signature_bytes);
      const feeData = await provider.getFeeData();
      console.log(ethers.formatUnits(feeData.gasPrice * gasEstimate, "ether"), "MATIC");
      console.log('called estimate gas', gasEstimate.toString());

      // call the mintAndSend function
      console.log('minting NFT for:', farmname)
      console.log('minting NFT for:', Address,metadata_uri,farmname,signature_bytes)
      const tx = await contract.mintAndSend(Address,metadata_uri,farmname,signature_bytes);
      console.log("Transaction sent! Waiting for confirmation...");
      await tx.wait();
      if(tx){
        console.log("Transaction confirmed:", tx);
        return { 'response': 'success' };
      }
    } catch (e) {
      console.error("Error minting NFT:", e);
      alert("Error minting NFT:", e);
      return { 'response': e.code }
  }}}

export const collectGrant = async (privateKey,chain,address) => {
  if (chain === '137') {
    try {
      // Provider      
      console.log('chain', chain)
      console.log('privateKey', privateKey)
      const provider = new ethers.JsonRpcProvider(POLYGON_PROVIDER_URL);

      // decrypted private key to initiate wallet
      const wallet = new ethers.Wallet(privateKey, provider);

      // init contract 
      const contract = new ethers.Contract(nilaGrantContract, nilaGrantAbi, wallet);

      // Filter events by user address
      const month_in_epoch = Math.floor(Date.now() / 1000 / (30.437 * 24 * 60 * 60))

      console.log('month', month_in_epoch, address)
      const filter = contract.filters.GrantClaimed(address, month_in_epoch,null);
      console.log('filter', filter)

      // Query logs
      const eligible = await contract.queryFilter(filter);
      console.log('events', eligible)

      if (eligible.length == 0){
        console.log("User eligible to claim");

        // call the claimGrant function        
        const tx = await contract.claimGrant();
        console.log("Transaction sent! Waiting for confirmation...");
        await tx.wait();
        if(tx){
          console.log("Transaction confirmed:", tx);
          return { 'response':'success'}
        }
      } else {
          return { 'response':'not eligible, did you already claim this month?'}
      }

    } catch (e) {
      console.log('collecting grant error', e)
      return{ 'response': e.action}

  }
}}

export const repay = async (txdetails,privateKey,chain,unionaddress,address) => {
  if (chain === '137') {
    try {
      // Provider
      const provider = new ethers.JsonRpcProvider(POLYGON_PROVIDER_URL);

      // decrypted private key to initiate wallet
      const wallet = new ethers.Wallet(privateKey, provider);

      // init contracts
      const nilaContract = new ethers.Contract(nilaTokenContract, nilaTokenAbi, wallet);
      const unionContract = new ethers.Contract(unionaddress, nilaUnionAbi, wallet);

      // add a bit to the amount to avoid small left-over
      const amount = Number(txdetails.amount) + 0.0001
      console.log('amount',amount)
      // change amount to BigInt
      const amountBig = ethers.parseUnits(amount.toString(), 18)
      console.log('txdetails.demandId,amountBig,address',txdetails.demandId,amountBig,address)
  
      // check allowance to spend NILA
      const currentAllowance = await nilaContract.allowance(wallet.address, unionaddress);
      console.log('currentAllowance',currentAllowance)

      if (currentAllowance < amountBig) {
        console.log("Not enough allowance! Approving entire balance...");
        const allow = await nilaContract.approve(unionaddress, amountBig);
        const approveReceipt = await allow.wait();
        if (approveReceipt.status !== 1) {
          throw new Error(`Approval transaction failed with hash: ${allow.hash}`);
        }
        console.log('Approval Transaction Confirmed:', allow.hash);
      }

      console.log("Current allowance:", currentAllowance.toString())

      const tx = await unionContract.repayDebt(txdetails.demandId,amountBig,address);
      console.log("Transaction sent! Waiting for confirmation...");
      const acceptReceipt = await tx.wait();
      if (acceptReceipt.status !== 1) {
        throw new Error(`Accept transaction failed with hash: ${tx.hash}`);
      } else {
        console.log(`Accept Transaction Confirmed with hash`, tx.hash);
      }

      // Finally, remove the FarmData invest object to be reloaded.
      await updateItem({ id: 'invest', value: undefined },'FarmData') // Invest list

      return { 'response': 'success' };
    } catch (e) {
      console.log('invest error', e)
      return{ 'response': e.code}

  }
}}

export const send = async (privateKey,chain,address_to,amount) => {
  if (chain === '137') {
    try {
      // Provider
      console.log('address_to', address_to)
      console.log('amount', amount)
      const provider = new ethers.JsonRpcProvider(POLYGON_PROVIDER_URL);

      // decrypted private key to initiate wallet
      const wallet = new ethers.Wallet(privateKey, provider);

      // set nila contract for allowance
      const nilaContract = new ethers.Contract(nilaTokenContract, nilaTokenAbi, wallet);

      const currentAllowance = await nilaContract.allowance(wallet.address, address_to);
      const amountBig = ethers.parseUnits(amount.toString(), 18)
      console.log('currentAllowance', currentAllowance, amountBig)

      if (currentAllowance < amountBig) {
        console.log("Not enough allowance! Approving send amount...");
        const allow = await nilaContract.approve(address_to, amountBig);
        const approveReceipt = await allow.wait();
        if (approveReceipt.status !== 1) {
          throw new Error(`Approval transaction failed with hash: ${allow.hash}`);
        }
        console.log('Approval Transaction Confirmed:', allow.hash);
      }

      // send transaction and wait till finished
      const tx = await nilaContract.transfer(address_to,amountBig)
      console.log("Transaction sent:", tx);
      await tx.wait();
      console.log("Transaction mined!");
      return { 'response': 'success' };
    } catch (e) {
      console.log('send error', e)
      return{ 'response': e.code}
    }}
}

export const claimInterest = async (txdetails,privateKey,chain,address,unionaddress) => {
  if (chain === '137') {
    try {
      // Provider
      console.log('chain', chain)
      const provider = new ethers.JsonRpcProvider(POLYGON_PROVIDER_URL);

      // decrypted private key to initiate wallet
      const wallet = new ethers.Wallet(privateKey, provider);

      // init contracts
      const unionContract = new ethers.Contract(unionaddress, nilaUnionAbi, wallet);

      console.log('txdetails',txdetails.rewards)
      
      // inputs: demandId,selectedAddress,amount,commitToWinner
      const commitPromises = txdetails.rewards.ids.map( async (id,index) => {
          const addr = txdetails.rewards.from_addrs[index]
          console.log('id, address',id, addr)

          const tx = await unionContract.claimInterest(id,addr);
          console.log("Transaction sent! Waiting for confirmation...");
          const allocateReceipt = await tx.wait();
          if (allocateReceipt.status !== 1) {
            throw new Error(`Allocation transaction failed for address ${addr} with hash: ${tx.hash}`);
          }
          console.log(`Allocation Transaction Confirmed for ${addr}:`, tx.hash);
       })
      
      // Await all allocation transactions to complete
      await Promise.all(commitPromises);
      console.log('All transactions have been successfully confirmed.');
      await updateItem({ id: 'invest', value: undefined },'FarmData') // Invest list

      return { 'response': 'success' };
    } catch (e) {
      console.log('invest error', e)
      return{ 'response': e.code}
  }
}}

export const debt = async (txdetails,privateKey,chain,unionaddress) => {
  if (chain === '137') {
    try {
      // Provider
      console.log('chain', chain)
      const provider = new ethers.JsonRpcProvider(POLYGON_PROVIDER_URL);

      // decrypted private key to initiate wallet
      const wallet = new ethers.Wallet(privateKey, provider);

      console.log('txdetails',txdetails.demandId, unionaddress)
      // init contracts
      const unionContract = new ethers.Contract(unionaddress, nilaUnionAbi, wallet);

      // inputs: demandId
      const tx = await unionContract.acceptProduce(txdetails.demandId);
      console.log("Transaction sent! Waiting for confirmation...");
      const acceptReceipt = await tx.wait();
      if (acceptReceipt.status !== 1) {
        throw new Error(`Accept transaction failed with hash: ${tx.hash}`);
      } else {
        console.log(`Accept Transaction Confirmed with hash`, tx.hash);
      }

      // Finally, remove the FarmData invest object to be reloaded.
      await updateItem({ id: 'invest', value: undefined },'FarmData') // Invest list

      return { 'response': 'success' };
    } catch (e) {
      console.log('debt error', e)
      return{ 'response': e.code}

  }
}}

export const invest = async (txdetails,privateKey,chain,address,unionaddress) => {
  if (chain === '137') {
    try {
      // Provider
      console.log('txdetails', txdetails)
      const provider = new ethers.JsonRpcProvider(POLYGON_PROVIDER_URL);

      // decrypted private key to initiate wallet
      const wallet = new ethers.Wallet(privateKey, provider);

      const {address,amount,produceId} = txdetails

      // init contracts
      const nilaContract = new ethers.Contract(nilaTokenContract, nilaTokenAbi, wallet);
      const unionContract = new ethers.Contract(unionaddress, nilaUnionAbi, wallet);
      // check allowance to spend NILA
      const currentAllowance = await nilaContract.allowance(wallet.address, unionaddress);

      const sum_amount = amount.reduce((acc,a) => acc + a, 0)
      console.log("Current allowance:", currentAllowance.toString(), sum_amount)

      // amount is now a number, but will be an array of numbers, that have to be summed (is summed on-chain, but not for allowance)
      if (currentAllowance < ethers.parseUnits(sum_amount.toString(), 18)) {
        console.log("Not enough allowance! Approving entire balance...");
        const allow = await nilaContract.approve(unionaddress, ethers.parseUnits(sum_amount.toString(), 18));
        const approveReceipt = await allow.wait();
        if (approveReceipt.status !== 1) {
          throw new Error(`Approval transaction failed with hash: ${allow.hash}`);
        }
        console.log('Approval Transaction Confirmed:', allow.hash);
      }

      // inputs: demandId,selectedAddress,amount,commitToWinner
      const commitPromises = address.map( async (addr,index) => {
        if (amount[index] !== 0){
          console.log('address,amount',addr.address)
          const nonce = await provider.getTransactionCount(wallet.address, 'latest');
          
          // estimate gas
          const gasEstimate = await unionContract.stakeToProduce.estimateGas(produceId, addr.address, ethers.parseUnits(amount[index].toString(), 18));
          const adjustedGasLimit = gasEstimate * 11n / 10n; // BigInt math
          const tx = await unionContract.stakeToProduce(produceId,addr.address,ethers.parseUnits(amount[index].toString(), 18),{ 
            nonce,
            gasLimit: adjustedGasLimit, // add 10% to gas estimate 
          });
          console.log("Transaction sent! Waiting for confirmation...");
          const allocateReceipt = await tx.wait();
          if (allocateReceipt.status !== 1) {
            throw new Error(`Allocation transaction failed for address ${addr} with hash: ${tx.hash}`);
          }
          console.log(`Allocation Transaction Confirmed for ${addr}:`, tx.hash);
        }
       })
      
      // Await all allocation transactions to complete
      await Promise.all(commitPromises);
      console.log('All allocation transactions have been successfully confirmed.');

      // Finally, remove the FarmData invest object to be reloaded.
      await updateItem({ id: 'invest', value: undefined },'FarmData') // Invest list

      return { 'response': 'success' };
    } catch (e) {
      console.log('invest error', e)
      return{ 'response': e.code}

  }
}}

export const loadUnionState = async (chain,address,unionaddress) => {
  try {
    if (!ethers.isAddress(address)) {
      throw new Error('Invalid address');
    }
    let provider;
    if (chain === '137') {
      provider = new ethers.JsonRpcProvider(POLYGON_PROVIDER_URL);
      
    } else if (chain === '44787') {
      provider = new ethers.JsonRpcProvider('https://alfajores-forno.celo-testnet.org');
    } else {
      throw new Error('Unsupported network');
    }

    // initiate contract
    const unionContract = new ethers.Contract(unionaddress, nilaUnionAbi, provider);
    const titleContract = new ethers.Contract(landTitleAddress, landTitleAbi, provider);
    const count = await unionContract.getProductsLength({ blockTag: "latest" })
    console.log('getProductsLength', count)

    // check if count is equal to cached, if not run again
    const now = Date.now();
    const prevDemands = await readItem('invest','FarmData')
    // deny if the demands item is expired
    const deny = prevDemands.value && [
      Boolean(now < prevDemands.exp ? false : true), // true if expired if expiration is less than now
      Boolean(prevDemands.value.data.filter((d) => d.selected).length), // never use cache if address among selected
      Boolean(prevDemands.value.count != BigInt(count)) // true if count is the same
    ]
    
    let list = []
    console.log('deny', deny)
    if (!prevDemands.value || deny.some(cond => cond)){
      const blockNumber = await provider.getBlockNumber();
      const currentBlock = await provider.getBlock(blockNumber);

      console.log('Demands are reloaded.')
      for (let i = 0; i < Number(count); i++) {
        // output: cropType,amount,interestRate,harvestDeadline,location,isConfirmed,winnerisFrozen,isClosed,totalDebt,repaid 
        const info = await unionContract.getProduct(i)
        // destructure data (! totaldebt here is without accumulated interest rate)
        const [cropType,amount,interestRate,harvestDeadline,isConfirmed,acceptedBlock,winner,isFrozen,totalDebt,repaid] = info
        if(!isConfirmed){
          const { hasUserBeenSelected, data } = await UnConfirmed(i,info,address,unionContract,titleContract,{ 'nmb': blockNumber, 'timestamp': currentBlock.timestamp})
          console.log('dat', data)
          list.push({ 'data': data,'reward': 0, 'selected': hasUserBeenSelected, 'confirmed': isConfirmed })
          }
        else {
          const { hasUserBeenSelected, data } = await Confirmed(i,info,address,unionContract,{ 'nmb': blockNumber, 'timestamp': currentBlock.timestamp})
          list.push({ 'data': data,'reward': data['rewards'], 'selected': hasUserBeenSelected, 'confirmed': isConfirmed })
        }
      }
      // add test prop unconfirmed selected to list
      const data1 = { amount: 100, apr: 200, class: 3, contract: 'pre paid', crop: 'sugarcane', deadline: new Date(Number(Date.now().toString())), id: 2, name: 'Sugarcane', nominator: 'KG', staked: '1', tab: true, timegap: 10000000, total_staked: 87, type: 'staple'}
      const data2 = { 
        rewards: 0,
        rewards_from_address: 1,
        id: 3,
        selected_staked: 87.11,
        cost: 0,
        crop: 'sugarcane',  // 
        total_staked: 87,
        staked: 0,
        deadline: '8',
        daysWeeks: 'weeks',
        milestones: {}
      }
      //list.push({ 'data': data2,'reward': 0, 'selected': true, 'confirmed': true })

      // finally update local db with new demands
      const expiration = now + 24 * 60 * 1000; // 24 hours from now
      await updateItem({ id: 'invest', value: { 'count': count, 'data': list}, 'exp': expiration},'FarmData')
    
      console.log("END OF LOOP")
    } else {
      list = prevDemands.value.data
    }
    console.log('list',list)
    if(list.length > 0){
      const highestAPR = list.reduce((prev, current) => prev > current.data.apr ? prev : current.data.apr,0);
      const totalStaked = list.reduce((acc, current) => acc + Number(current.data.staked),0) 
      const reward_amounts = list.map((d) => Number(d.reward))
      const reward_ids = list.map((d) => d.data.id)
      const reward_addrs = list.map((d) => d.data.rewards_from_address)
      const stats = { 'highestAPR': highestAPR, 'totalStaked': totalStaked, 'totalRewards': {'ids': reward_ids, 'amounts': reward_amounts, 'from_addrs': reward_addrs } }
      // return ONLY if selected
      const details = list.filter(d => d.selected)[0]
      console.log('details',details, list)

      return {'demand': list || [],'stats': stats,'selected':list.some(v => v.selected === true)}
    } else {
      const stats = { 'highestAPR': 0, 'totalStaked': 0, 'totalRewards': 0 }
      return {'demand':[],'stats': stats,'selected':list.some(v => v.selected === true)}

    }

  } catch (e) {
    console.error('error', e)
    return false
  }
}

export const loadETHTokens = async (chain,address,setLoadStages) => {
  try {
    if (!ethers.isAddress(address)) {
      throw new Error('Invalid address');
    }
    let provider;
    if (chain === '137') {
      provider = new ethers.JsonRpcProvider(POLYGON_PROVIDER_URL);
    } else if (chain === '44787') {
      provider = new ethers.JsonRpcProvider('https://alfajores-forno.celo-testnet.org');
    } else {
      throw new Error('Unsupported network');
    }
    // Fetch native token balance
    //const nativeBalanceWei = await provider.getBalance(address);
    //const nativeBalanceFormatted = ethers.formatUnits(nativeBalanceWei, 18);
    //console.log('nativeBalanceWei',nativeBalanceFormatted)
    setLoadStages('loading wallet')

    const abis = [
      "function balanceOf(address owner) view returns (uint256)",
      "function symbol() view returns (string)"
    ];

    // List of token contract addresses,abi,bool_nft
    const tokenAddresses = chain === '137' ? [
      [landTitleAddress,landTitleAbi,true,0], // LAND
      ['0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582',abis,false,6], // USDC
      [nilaTokenContract,nilaTokenAbi,false,18], // NILA
    ] : chain === '44787'[
      '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B' // USDC
    ] 

    const NILA_price = Number(process.env.REACT_APP_NILA_PRICE)
    
    //Get Price feeds for each of the tokens in the addresslist and the native token
    const tokenPromises = tokenAddresses.map(async (token,index) => {
      const tokenContract = new ethers.Contract(token[0], token[1], provider);
      const balance = await tokenContract.balanceOf(address);
      const symbol = await tokenContract.symbol();
      console.info('loading:', symbol)
      console.info('balance:', balance)
      // specific flow for USDC token
      if (index === 1){
        const price_USDC = await getLatestPrice(provider);
        const formatType = token[3]
        return { symbol,balance: ethers.formatUnits(balance, formatType), price: (price_USDC / 1e8) * 86.78, nft: false, tab: true }; // unit format FT
      }
      // flow for NILA token
      if (index === 2){
        // Fetch all logs matching the filter
        const grantContract = new ethers.Contract(nilaGrantContract, nilaGrantAbi, provider);
        let claimed_by_epoch_months = 0
        try {
          /**
           * FIX, RPC IS NOT RETURNING THE FILTERED EVENTS AS EXPECTED
           * Error: could not coalesce error (error={ "code": -32000, "message": "Block 20176590 not processed yet. Please try again." }, payload={ "id": 13, "jsonrpc": "2.0", "method": "eth_getLogs", "params": [ { "address": "0x119a09055edf0e204112948ee580ba2a236c01b0", "fromBlock": "0x0", "toBlock": "latest", "topics": [ "0x9e51079e6127c518bb0ff506bad3c402e184f363f50a0cac61d05e186738f13a" ] } ] }, code=UNKNOWN_ERROR, version=6.13.5)
           */
          const filter = grantContract.filters.GrantClaimed(address);
          console.log('filter', filter, address)
          const latestBlock = await provider.getBlockNumber();
  
          console.log('latestBlock', latestBlock)
          const events = await grantContract.queryFilter("GrantClaimed");
          console.log('events', events)
          // Extract the months from the events
          claimed_by_epoch_months = events.map((event) => [Number(event.args.month),Number(event.args.reward) / 10 ** 18]);
          console.log('claimed_by_epoch_months',claimed_by_epoch_months)
        }
        catch (e) {
          console.error('error fetching claimed_by_epoch_months', e)
        }
        const formatType = token[3]
        return { symbol, events: claimed_by_epoch_months, balance: ethers.formatUnits(balance, formatType), price: NILA_price, nft: false, tab: true }; // unit format FT
      }
      // specific flow for LAND token
      if (token[2]){
        const loaduri = balance > 0 && await readItem(`${symbol}_uri`,'FarmData') // check if uri in local cache
        if (!loaduri && balance > 0 || !loaduri.value && balance > 0){
            // get token id of ERC721Enumerable
            const tokenId = await tokenContract.tokenOfOwnerByIndex(address, 0);

            // false so fetch metadata and store locally
            const id = tokenId.toString() // assuming there can be only 1 LAND
            const uri = await tokenContract.tokenURI(id); // assume if tokenURI then NFT
            // remove prepathed data:application/json;base64,
            const metadatabase64 = uri.split(',')[1]
            const metadataJsonString = Buffer.from(metadatabase64, 'base64').toString('utf-8');
            console.log('metadataJsonString',metadataJsonString)

            // set farmname from landTitle
            const name = await tokenContract.getTitleName(tokenId);
            await updateItem({ id: 'farmname', value: name },'Init'); // farm name
            console.log('name',name)

            // resetting the thumbnail image of the property
            await FetchThumb(metadataJsonString)

            if (loaduri){
              await updateItem({ id: `${symbol}_uri`, value: metadataJsonString },'FarmData'); // LAND polygon
            } else {
              await createItem({ id: `${symbol}_uri`, value: metadataJsonString },'FarmData'); // LAND polygon
            }
            return { symbol, balance: ethers.formatUnits(balance, 0), price: (NILA_price * 0.01 * 5 * 12 * 6), nft: true, tab: true, metadata: metadataJsonString }; // unit format NFT 
        } else {
            return { symbol, balance: ethers.formatUnits(balance, 0), price: (NILA_price * 0.01 * 5 * 12 * 6), nft: true, tab: true, metadata: loaduri ? JSON.parse(loaduri.value) : '' }; // unit format NFT 
        }
      } 
      const formatType = token[3]
      return { symbol,balance: ethers.formatUnits(balance, formatType), price: (NILA_price * 5 * 12 * 6), nft: true, tab: true }; // unit format FT
    });

    const tokenData = await Promise.all(tokenPromises);

    // cache tokendata in FarmDataDB
    updateItem({ id: 'balance', value: JSON.stringify(tokenData) },'FarmData')

    return tokenData
  } catch (err) {
    console.log(err);
    return []
  }
};