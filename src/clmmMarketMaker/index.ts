import { BN } from 'bn.js';
// SOL-USDC pool id 2QdhepnKRTLjjSqPL1PtKNwqrUkoLee5Gqs8bvZhRdMv
import fs from 'fs';
import cron from 'node-cron';

import {
  ApiClmmPoolsItem,
  Clmm,
  ReturnTypeFetchMultiplePoolInfos,
  TokenAccount,
} from '@raydium-io/raydium-sdk';
import {
  Connection,
  Keypair,
} from '@solana/web3.js';

import { PROGRAMIDS } from '../../config';
import { formatClmmKeys } from '../formatClmmKeys';
import {
  closePositionTx,
  createPositionTx,
} from './clmmTx';
import {
  getUserTokenAccounts,
  TokenAccountInfo,
} from './tokenAccount';

const commitment = 'finalized'
const poolId = process.argv[2]
const createDeviation = !isNaN(Number(process.argv[3])) ? Number(process.argv[3]) : 1.333
const closeDeviation = !isNaN(Number(process.argv[4])) ? Number(process.argv[4]) : 0.999
const connection = new Connection(process.env.RPC as string, commitment)

const owner = Keypair.fromSecretKey(
  new Uint8Array(
    JSON.parse(
      fs.readFileSync('/home/stacc/7i.json').toString()

    )
  )
)

let cachedPools: ApiClmmPoolsItem[] = []

let accounts: TokenAccountInfo[] = []
let accountsRawInfo: TokenAccount[] = []
let accountListenerId: number | undefined

async function getPoolInfo(poolId: string): Promise<ReturnTypeFetchMultiplePoolInfos> {
  if (!poolId) return {}
  if (!cachedPools.length) {
    cachedPools = await formatClmmKeys(PROGRAMIDS.CLMM.toString(), true)
  }


  const pool = cachedPools.find((p) => p.id === poolId)
  if (pool) {
    return await Clmm.fetchMultiplePoolInfos({
      poolKeys: [pool],
      connection,
      ownerInfo: { tokenAccounts: accountsRawInfo, wallet: owner.publicKey },
      chainTime: Date.now() / 1000,
      batchRequest: true,
    })
  }

  return {}
}

async function checkPosition() {
  if (!poolId) {
    console.log('please provide pool id')
    return
  }
  if (!accounts.length) {
    const fetchFuc = async () => {
      const accountRes = await getUserTokenAccounts({
        connection,
        commitment,
        owner: owner.publicKey,
      })
      accounts = [...accountRes.accounts]
      accountsRawInfo = [...accountRes.accountsRawInfo]
    }
    await fetchFuc()

    if (accountListenerId) {
      connection.removeAccountChangeListener(accountListenerId)
      accountListenerId = undefined
    }
    accountListenerId = connection.onAccountChange(owner.publicKey, fetchFuc)
  }

  const res = await getPoolInfo(poolId)
  const parsedPool = res[poolId]
  const tokenAccounts = accountsRawInfo
  .map((a) => {
    if (a.accountInfo.mint.equals(parsedPool.state.mintA.mint) || a.accountInfo.mint.equals(parsedPool.state.mintB.mint)) {
      return a
    }
    return undefined
  }
  )
  .filter((a) => a) as TokenAccount[]
  if (parsedPool) {
    console.log(`\nConcentrated pool: ${poolId}`)
    console.log(`\nclose deviation setting: ${closeDeviation}%, create deviation setting: ${createDeviation}%`)
    const currentPrice = parsedPool.state.currentPrice
    // randomize parsedPool.positionAccount
    parsedPool.positionAccount ? parsedPool.positionAccount = parsedPool.positionAccount?.sort(() => Math.random() - 0.5) : null
    parsedPool.positionAccount?.forEach(async (position, idx) => {
      const { priceLower, priceUpper } = position
      console.log(
        `\n===== position ${idx + 1} =====\n`,
        `current price: ${currentPrice}\n`,
        `priceLower: ${priceLower.toString()}\n`,
        `priceUpper: ${priceUpper.toString()}`
      )
      const currentPositionMid = priceLower.add(priceUpper).div(2)
      const [closeLow, closeUp] = [
        currentPrice.mul((100 - closeDeviation) / 100),
        currentPrice.mul((100 + closeDeviation) / 100),
      ]


      if (currentPositionMid < closeLow || currentPositionMid > closeUp) {
        try {
        console.log('\n⛔ close position triggered!')
        console.log(`closeLower:${closeLow}\ncurrentPosition:${currentPositionMid}\ncloseUpper: ${closeUp}`)
        /* close position here */
        await closePositionTx({
          connection,
          poolInfo: parsedPool.state,
          position,
          owner,
          tokenAccounts,
        });

        const [recreateLower, recreateUpper] = [
          currentPrice.mul((100 - createDeviation) / 100),
          currentPrice.mul((100 + createDeviation) / 100),
        ]
        console.log('\n ✅ create new position')
        console.log(`priceLower:${recreateLower}\npriceUpper: ${recreateUpper}`)
        let amountA
        poolId == "GNmprs1Ferqb5pxJevxmz87nyms54wSEvqwaBPzsxzUz" ? amountA =  new BN(66 *  10 ** 7) : amountA =  new BN(333 *  10 ** 6) 
        console.log(amountA.toNumber())


        console.log(amountA.toNumber())
        /* create position here */
        await createPositionTx({
          connection,
          poolInfo: parsedPool.state,
          priceLower: recreateLower,
          priceUpper: recreateUpper,
          owner,
          tokenAccounts,
          amountA
        });
      } catch (err){
        console.log(err)
      }
      }

      console.log('position in range, no action needed')
    })
  }
  const currentPrice = parsedPool.state.currentPrice
      const [recreateLower, recreateUpper] = [
        currentPrice.mul((100 - createDeviation) / 100),
        currentPrice.mul((100 + createDeviation) / 100),
      ]
      console.log('\n ✅ create new position')
      console.log(`priceLower:${recreateLower}\npriceUpper: ${recreateUpper}`)
      let amountA
      poolId == "GNmprs1Ferqb5pxJevxmz87nyms54wSEvqwaBPzsxzUz" ? amountA =  new BN(66 *  10 ** 7) : amountA =  new BN(333 *  10 ** 6) 
      console.log(amountA.toNumber())
      console.log(amountA.toNumber())
      /* create position here */
      await createPositionTx({
        connection,
        poolInfo: parsedPool.state,
        priceLower: recreateLower,
        priceUpper: recreateUpper,
        owner,
        tokenAccounts,
        amountA
      });
}

const job = cron.schedule('*/1 * * * *', checkPosition, {
  scheduled: false,
})

if (poolId) {
  checkPosition()
  job.start()
} else {
  console.log('please provide pool id')
}
