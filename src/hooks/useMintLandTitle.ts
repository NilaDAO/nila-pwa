// hooks/useMintLandTitle.ts
// Land title minting is now handled by the backend (gas-optimized).
// This hook retains burnLandTitle for client-side NFT burning.
import { Contract } from "ethers";
import { useWallet, useContract } from "./useWallet.ts";
import { useTx } from "./useTx.ts";
import landTitleArtifact from '../components/ABI/NilaLandTitleWithName.json';
const landTitleAbi = (landTitleArtifact as any).abi ?? landTitleArtifact;
import foodTokenAbi from '../components/ABI/FoodTokens.json';
import { useQueryClient } from "@tanstack/react-query";
import { deleteItem } from '../utils/db.js';
import useTouch from '../hooks/useTouch';

const LANDTITLE_ADDR = String(process.env.REACT_APP_LAND_TITLE_MAIN);
const FOODTOKEN_ADDR = process.env.REACT_APP_FOODTOKEN_ADDRESS

export type AssetVoucher = {
  to:           string;
  cropCode:     string;
  varietyCode:  string;
  landTitleId:  number;
  nonce:        number;
};

export function useBurnLandTitle(
    chainId:  string
  ) {
    const runTx = useTx()
    const { wallet } = useWallet()
    const landtitle = useContract(LANDTITLE_ADDR, landTitleAbi, wallet) as Contract;
    const qc        = useQueryClient()

    const burnLandTitle = (tokenId: number) =>
      runTx(
        async () => {
          if (!landtitle || !wallet) throw new Error('Wallet or contracts not ready')

          const burnAddress = '0x000000000000000000000000000000000000dEaD'
          return landtitle.safeTransferFrom(
            wallet.address,
            burnAddress,
            tokenId
          )
        },
        {
          onSuccess: () => {
            deleteItem('reload','Init')
            deleteItem('thumb','FarmData')
            qc.invalidateQueries({ queryKey: ["balances", wallet?.address] })
            qc.invalidateQueries({ queryKey: ["land", chainId, wallet?.address] })
            window.location.reload();
          }
        }
      )

    return { burnLandTitle }
  }

export function useMintFoodToken(
    chainId:  string
  ) {
    const runTx = useTx()
    const { wallet } = useWallet()
    const { handleToggleView } = useTouch() 
    const qc    = useQueryClient()

    const foodTokenContract   = useContract(FOODTOKEN_ADDR, foodTokenAbi, wallet);

    const mintFoodToken = (voucher: AssetVoucher, signature: string, harvestDate: number,quantity: number) =>
      runTx(
        async () => {
          
          if (!foodTokenContract || !wallet) throw new Error('Wallet or contracts not ready')
          
          console.log(voucher,signature,harvestDate,quantity)
          // 2) do the token claim
          return foodTokenContract.mintWithVoucher(voucher,signature,harvestDate,quantity);
        },
        {
          onError: (err: any) => {
            console.error("minting food token failed:", err);
          },    
          onSuccess: (res : any) => {
            console.log('SUCCESS')
            console.log('res', res)
            console.log('voucher', voucher)
            /* setDebt and create or update item
            const debtItem = { 
              fund: fundAddress,
              fundName: fundName, 
              type: 'INPUT', // only INPUT for now
              loanID: String(voucher.loanID), 
              token: '0x10D11eDD572ccb54D6D59f07521eA071Ed1C326E',  // only NILA for now
              principal: Number(ethers.formatUnits(voucher.amount, 18)), 
              outstanding: Number(ethers.formatUnits(voucher.amount, 18)) + voucher.interestBP / 100, 
              interest: voucher.interestBP,  // bigInt from res
              repaid: 0,  // bigInt from res
              dueDate: 'unknown (no harvest detected)', 
              isFrozen: false, 
            }
            console.log('debtItem', debtItem)
            console.log('debtx', debts)

            setDBitem('debts',[...debts,debtItem],'Init') // tiny helper to create|update db
            setDebts((prev: any) => [...prev, debtItem])
            handleToggleView({ ix: 3, i: 0  }) // WE are not directing to the specific debt card, debts.length - 1 ??? (just assume only 1 loan)
            // refresh balances/fund data
            qc.invalidateQueries({ queryKey: ['balances', wallet?.address] })
            qc.invalidateQueries({ queryKey: ['fundsData'] })
            qc.invalidateQueries({ queryKey: ['unionFunds']})
            */
          }
        }
      )

    const burnFoodToken = (tokenId: number) => 
      runTx(
        async () => {
          // move to forms to remove maps background
          handleToggleView({ ix: 0, i: 0  }) // WE are not directing to the specific debt card, debts.length - 1 ??? (just assume only 1 loan)
          if (!foodTokenContract || !wallet) throw new Error('Wallet or contracts not ready')

          const burnAddress = '0x7857abD70878cE660f4eC3E7a2EBEd975193Ed8A' //'0x000000000000000000000000000000000000dEaD'
          console.log('wallet.address', wallet.address)
          console.log('tokenId', tokenId)

          // ─── 1. find how many of each id the wallet owns ────────────────────────────
          const amounts = await foodTokenContract.balanceOfBatch.staticCall(
            [wallet.address],
            [tokenId],
          )                                          // → bigint[]

          console.log('amounts', BigInt(amounts))
          // nothing to burn? bail early
          if (amounts.every((a : any) => a === 0n)) throw new Error('Zero balance for all ids')

          // ─── 2. torch them in one tx ────────────────────────────────────────────────
          return foodTokenContract.safeBatchTransferFrom(
            wallet.address,
            burnAddress,
            [BigInt(tokenId)],
            [BigInt(amounts)],
            '0x' as `0x${string}`,                  // data
          )
        },
        {
          onSuccess: () => {
            // reset the card data and remove the reload item
            deleteItem('reload','Init')
            // do a hard reload, or expire reload cache. 
            // refresh balances/fund data
            qc.invalidateQueries({ queryKey: ["balances", wallet?.address] })
            qc.invalidateQueries({ queryKey: ["land", chainId, wallet?.address] }) 
            // perform a hard reload after burn
            window.location.reload();
          }
        }
      )

  
    return { mintFoodToken, burnFoodToken }
  }

  
