import { ethers } from 'ethers';
import axios from 'axios';
import { updateItem } from './db';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL
const YEAR_IN_SECONDS = 365 * 86400

export const Destructure = (idx,info,stake,currentBlock,selected_names, staked_out) => {
    
      const [cropType,amount,interestRate,futureBlock,isConfirmed,acceptedBlock,winner,isFrozen,totalDebt,repaid] = info

      const crops = ["groundnut", "paddy", "wheat", "maize", "sorghum", "millet", "chickpeas", "sugarcane", "potato", "cassava", "sesame"];
      // rice: 0-99, groundnut: 100-199, etc.
      const names = ["groundnut", "paddy", "wheat", "maize", "sorghum", "millet", "chickpeas", "sugarcane", "potato", "cassava", "sesame"];

      console.error('STAKE',stake)
      const res = {
        tab: true, 
        id: idx,
        type: 'staple', 
        crop: crops[cropType.toString()],  // 
        name: names[cropType.toString()], 
        class: 3,
        apr: Number(interestRate), // Rate in Basis Points
        nominator: 'KG', 
        deadline: new Date(Number(futureBlock.toString())),
        timegap: (Number(futureBlock.toString()) - currentBlock.timestamp) + 1251429, // in poly blocks to timestamps + 1 month
        contract: 'Pre Paid', 
        selected: selected_names,
        total_staked: parseFloat(ethers.formatUnits(totalDebt.toString(), 18)),
        staked: parseFloat(ethers.formatUnits(stake.toString(), 18)),
        amount: Number(amount)
      }
      return res
    }

export const Confirmed = async (i,info,address,unionContract,blockNumber) => {  
      /**
       * A winner has been choosen
       * Investors can not stake anymore funds
       * Rewards can be claimed
       * in case investor:
            * calculate reward
        * in case selected
            * total cost (base + interest rate)
            * time till deadline
            * milestones based on remote sensing data
        */
    // demand IS CONFIRMED
     /**
         * 1 = PADDY
         * 2 = WHEAT
         * 3 = MAIZE
         * 4 = SORGHUM
         * 5 = MILLET
         * 6 = CASSAVA
         * 7 = SUGARCASE
         * 8 = POTATO
         * 9 = TAPIOCA
         * 10 = SESAME
         * 11 = GROUNDNUT
         */
    const crops = ["paddy", "wheat", "maize", "sorghum", "millet", "cassava", "sugarcane", "potato", "tapioca", "sesame", "groundnut"];

    const [cropType,amount,interestRate,futureBlock,isConfirmed,acceptedBlock,winner,isFrozen,totalDebt,repaid] = info
    let _rewards = 0
    let _reward_address = ''
    let totalInDebt = 0
    let deadlineDiffDays = 0

    const sel = await unionContract.getSelectedAddresses(i)
    console.log("winner",winner )

    const hasUserBeenSelected = Boolean(winner === address)
    console.log("thisUserSelected",hasUserBeenSelected )

    // output: staked, committed, lastclaim, selectedIdx
    const res = await unionContract.getInvestorStakes(address)
    const staked_in = res[2].reduce((prev, current) => ethers.formatUnits(current.toString(), 18), 0);
    console.log('staked_in', staked_in)

    if (hasUserBeenSelected){
      // cost (base + interest)
      const base = totalDebt
      const timeElapsed = BigInt(blockNumber.timestamp) - acceptedBlock
      const interest = (base * interestRate * timeElapsed) / BigInt(YEAR_IN_SECONDS * 10000)
      totalInDebt = base + interest

      // deadline 
      const futureDate = new Date(Number(futureBlock.toString()))
      console.log("deadline futureDate",futureDate )

      const deadlineDiffinMs = futureDate - new Date()
      deadlineDiffDays = Math.ceil(deadlineDiffinMs / (1000 * 60 * 60 * 24));
      console.log("deadline epock",deadlineDiffDays )
    } 
    else {
      // rewards
      let res = await unionContract.getPendingInterest(address)
      console.log('res', res)
      _rewards = res[2].reduce((prev, current) => ethers.formatUnits(current.toString(), 18), 0);
      console.log('_rewards', _rewards)
      _reward_address = res[1].toString()
    }

    const data = { 
      rewards: _rewards,
      rewards_from_address: _reward_address,
      id: i,
      selected_staked: ethers.formatUnits(totalDebt.toString(), 18),
      cost: 0,
      crop: crops[cropType.toString()],  // 
      total_staked: ethers.formatUnits(totalInDebt.toString(), 18),
      staked: parseFloat(staked_in),
      deadline: deadlineDiffDays > 7 ? Math.floor(deadlineDiffDays/ 7) : deadlineDiffDays, // UPDATE WHEN DEADLINE IS THERE.
      daysWeeks: deadlineDiffDays > 7 ? 'weeks': 'days',
      milestones: {}
    }

    return {
      hasUserBeenSelected,
      data,
    };
  }

export const FetchThumb = async (land_uri) => {
  const outline = JSON.parse(land_uri)
  const url = `${API_BASE_URL}/map_thumb/`;
  const data = {
      coordinates: outline, // Ensure 'outline' is an array of objects with 'lat' and 'lng'
      screen_width: window.screen.width
  };
  try {
      const ThumbResponse = await axios.post(url, data, {
          responseType: "blob", // Ensure we get the data as a Blob
          headers: {
          'Content-Type': 'application/json',
          // Add other headers if required, e.g., Authorization
          }
      });
      console.log('thumb', ThumbResponse.data);
      await updateItem({ id: 'thumb', value: ThumbResponse.data },'FarmData')
      } catch (error) {
      console.error('Error:', error.response ? error.response.data : error.message);
      }   
}

export const UnConfirmed = async (i,info,address,unionContract,titleContract,blockNumber) => {
  /**
   * No selected farmer has accepted the loan
   * Investors can still stake funds
   * Rewards have not been initiated 
   */
  let staked_in = 0
  const sel = await unionContract.getSelectedAddresses(i)
  const hasUserBeenSelected = Boolean(sel.filter(addr => addr === address).toString())
  // output: staked, committed, lastclaim, selectedIdx
  const res = await unionContract.getInvestorStakes(address)
  const id_idx = res[0].map(v => Number(v)).indexOf(i)
  if (id_idx >= 0){
    console.log('id_idx',id_idx)
    // overwrite staked_in
    staked_in = res[2][id_idx]
    console.log('staked amount', res[2])
  }

  /**
   * get stakes returns
   * 0: ids[]
   * 1: addresses[]
   * 2: stakes[]
   * 
   * To calculate stakes by id from this user
      *  match produceId to i
   */
  
  /* 
  ONLY TOTALDEBT from info
  if (hasUserBeenSelected){
    // output: staked Nila
    const res = await unionContract.getTotalOwedByFarmer(0)
    console.log('res in user selected', info)
    staked_out = Number(res) // in NILA
  } 
  */

  // name selected 
  const selected_names = []
  if( sel.length > 0){
    const addresses = sel.toString().split(',')
    for (let j = 0; j < addresses.length; j++) {
      let addr = addresses[j]
      try {
        const tokenId = titleContract.tokenOfOwnerByIndex(addr, 0);
        const name = await titleContract.getTitleName(tokenId);
        selected_names.push({ 'name' : name, 'address' : addr})
      } catch {
        selected_names.push({ 'name' : addr, 'address' : addr})
      }
    }  
  }
  //destructure data
  const data = Destructure(i,info,staked_in,blockNumber,selected_names)

  return {
    hasUserBeenSelected,
    data,
  };
}