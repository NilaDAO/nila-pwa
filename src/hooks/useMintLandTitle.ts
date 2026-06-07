// hooks/useMintLandTitle.ts
// Land title minting is now handled by the backend (gas-optimized).
// This hook retains burnLandTitle for client-side NFT burning.
import { Contract } from "ethers";
import { useWallet, useContract } from "./useWallet.ts";
import { useTx } from "./useTx.ts";
import landTitleArtifact from '../components/ABI/NilaLandTitleWithName.json';
const landTitleAbi = (landTitleArtifact as any).abi ?? landTitleArtifact;
import foodTokenArtifact from '../components/ABI/FoodTokens.json';
const foodTokenAbi = (foodTokenArtifact as any).abi ?? foodTokenArtifact;
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

    const burnFoodToken = (tokenId: bigint | number | string) =>
      runTx(
        async () => {
          // move to forms to remove maps background
          handleToggleView({ ix: 0, i: 0  }) // WE are not directing to the specific debt card, debts.length - 1 ??? (just assume only 1 loan)
          if (!foodTokenContract || !wallet) throw new Error('Wallet or contracts not ready')

          const id = BigInt(tokenId)
          console.log('tokenId', id)

          // Real on-chain burn: clears the token's field bit so the same field can be
          // re-minted in the same season. A plain transfer to a sink leaves the field
          // claimed forever (→ FieldAlreadyClaimed on re-mint). burnOwnToken is
          // permissionless for the land-title owner, restricted to status==1 tokens.
          return foodTokenContract.burnOwnToken(id)
        },
        {
          onSuccess: async () => {
            // reset the card data and remove the reload item
            deleteItem('reload','Init')
            // Drop the cached land record on burn. The backend regenerates the
            // record JSON, re-pins it to IPFS and writes the new hash on-chain,
            // so the next load must re-fetch the fresh record from IPFS instead
            // of serving the stale cached copy (which still carried the burned
            // token's food-token fill).
            try {
              const landTitleId = Number(BigInt(tokenId) >> 224n)
              await deleteItem(`recordHash_${landTitleId}`, 'FarmData')
            } catch (e) {
              console.warn('[burn] record cache clear failed', e)
            }
            // refresh balances/fund data
            qc.invalidateQueries({ queryKey: ["balances", wallet?.address] })
            qc.invalidateQueries({ queryKey: ["land", chainId, wallet?.address] })
            // perform a hard reload after burn — re-fetches the record from IPFS
            window.location.reload();
          }
        }
      )

  
    return { mintFoodToken, burnFoodToken }
  }

  
