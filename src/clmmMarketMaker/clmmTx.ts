import BN from 'bn.js';
import Decimal from 'decimal.js';

import {
  Clmm,
  ClmmPoolInfo,
  ClmmPoolPersonalPosition,
  fetchMultipleMintInfos,
  TokenAccount,
  TxVersion,
} from '@raydium-io/raydium-sdk';
import {
  Connection,
  Keypair,
  Signer,
} from '@solana/web3.js';

import { PROGRAMIDS } from '../../config';
import { buildAndSendTx } from './util';

export async function createPositionTx({
  connection,
  poolInfo,
  priceLower,
  priceUpper,
  owner,
  tokenAccounts,
  makeTxVersion = TxVersion.V0,
  amountA,
}: {
  connection: Connection;
  poolInfo: ClmmPoolInfo;
  priceLower: Decimal;
  priceUpper: Decimal;
  owner: Keypair | Signer;
  tokenAccounts: TokenAccount[];
  makeTxVersion?: TxVersion;
  amountA: BN;
}) {
  const { tick: tickLower } = Clmm.getPriceAndTick({
    poolInfo,
    baseIn: true,
    price: priceLower, // will add position start price
  });
  const { tick: tickUpper } = Clmm.getPriceAndTick({
    poolInfo,
    baseIn: true,
    price: priceUpper, // will add position end price
  });

  const { liquidity, amountSlippageA, amountSlippageB } =
    Clmm.getLiquidityAmountOutFromAmountIn({
      poolInfo,
      slippage: 0.666,
      inputA: true,
      tickUpper,
      tickLower,
      amount: amountA, // e.g. new BN(100000),
      add: true, // SDK flag for math round direction

      amountHasFee: true,

      token2022Infos: await fetchMultipleMintInfos({
        connection,
        mints: [poolInfo.mintA.mint, poolInfo.mintB.mint],
      }),
      epochInfo: await connection.getEpochInfo(),
    });
    console.log(liquidity.toNumber(), amountSlippageA.amount.toNumber(), amountSlippageB.amount.toNumber())
const fees = await getPriorityFeeEstimate("High")
  const makeOpenPositionInstruction =
    await Clmm.makeOpenPositionFromLiquidityInstructionSimple({
      connection,
      poolInfo,
      ownerInfo: {
        feePayer: owner.publicKey,
        wallet: owner.publicKey,
        tokenAccounts,
      },
      tickLower,
      withMetadata:'no-create',
      tickUpper,
      liquidity,
      makeTxVersion,
      amountMaxA: amountSlippageA.amount,
      amountMaxB: amountSlippageB.amount,
      computeBudgetConfig: {   microLamports: Math.floor(fees.priorityFeeEstimate)   },
    });

  return {
    txids: await buildAndSendTx({
      connection,
      makeTxVersion,
      owner,
      innerSimpleV0Transaction: makeOpenPositionInstruction.innerTransactions,
    }),
  };
}
const HeliusURL = "https://mainnet.helius-rpc.com/?api-key=baea1964-f797-49e8-8152-6d2292c21241";

async function getPriorityFeeEstimate(priorityLevel: any) {
  const response = await fetch(HeliusURL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method: "getPriorityFeeEstimate",
      params: [
        {        "accountKeys": [PROGRAMIDS.CLMM.toBase58()],
          options: { priorityLevel: priorityLevel },
        },
      ],
    }),
  });
  const data = await response.json();
  console.log(
    "Fee in function for",
    priorityLevel,
    " :",
    data.result.priorityFeeEstimate
  );
  return data.result;
}
export async function closePositionTx({
  connection,
  poolInfo,
  position,
  owner,
  tokenAccounts,
  makeTxVersion = TxVersion.V0,
}: {
  connection: Connection;
  poolInfo: ClmmPoolInfo;
  position: ClmmPoolPersonalPosition;
  owner: Keypair | Signer;
  tokenAccounts: TokenAccount[];
  makeTxVersion?: TxVersion;
}) {
  const fees = await getPriorityFeeEstimate("High")
  const instruction  =
    await Clmm.makeDecreaseLiquidityInstructionSimple({
      connection,
      poolInfo,
      ownerPosition: position,
      ownerInfo: {
        feePayer: owner.publicKey,
        wallet: owner.publicKey,
        tokenAccounts: tokenAccounts,
        closePosition: true, // for close
      },
      liquidity: position.liquidity, //for close position, use 'ammV3Position.liquidity' without dividend
      // slippage: 1, // if encouter slippage check error, try uncomment this line and set a number manually
      makeTxVersion,
      amountMinA: new BN(0),
      amountMinB: new BN(0),
      computeBudgetConfig: {   microLamports: Math.floor(fees.priorityFeeEstimate)   },
    });

  return {
    txids: await buildAndSendTx({
      connection,
      makeTxVersion,
      owner,
      innerSimpleV0Transaction:
        instruction.innerTransactions,
    }),
  };
}
