import BN from 'bn.js';
import Decimal from 'decimal.js';

import {
  LiquidityMath,
  PoolInfoLayout,
  PositionInfoLayout,
  PositionUtils,
  SPL_ACCOUNT_LAYOUT,
  SqrtPriceMath,
  Tick,
  TickArrayLayout,
  TickUtils,
} from '@raydium-io/raydium-sdk';
import {
  getAssociatedTokenAddressSync,
  MintLayout,
} from '@solana/spl-token';
import {
  Connection,
  PublicKey,
} from '@solana/web3.js';

import {
  connection,
  PROGRAMIDS,
} from '../config';

const blessed = require('blessed');
const contrib = require('blessed-contrib');
const screen = blessed.screen();
const grid = new contrib.grid({ rows: 2, cols: 1, screen: screen });

function aggregateDataPoints(data: any) {
  // Determine the number of points to display (maximum of 10 or actual data length if less)
  
  // If the data length is less than or equal to maxPoints, no aggregation is needed
    return data.map((point:any, index: any) => ({ x: 't' + index, y: point[1] }));

}

const totalAs: any[] = [];
const totalBs: any[] = [];
// Aggregate data points
const aggregatedTotalAs = aggregateDataPoints(totalAs);
const aggregatedTotalBs = aggregateDataPoints(totalBs);

// Prepare series data
const series1 = {
  title: 'Total A',
  x: aggregatedTotalAs.map((point: any) => point.x),
  y: aggregatedTotalAs.map((point: any) => point.y),
  style: { line: 'red' }
};

const series2 = {
  title: 'Total B',
  x: aggregatedTotalBs.map((point: any) => point.x),
  y: aggregatedTotalBs.map((point: any) => point.y),
  style: { line: 'blue' }
};

// Set up the line charts in the grid
const line1 = grid.set(0, 0, 1, 1, contrib.line, {
  label: 'Chart for Total A',
  showLegend: true,
});

const line2 = grid.set(1, 0, 1, 1, contrib.line, {
  label: 'Chart for Total B',
  showLegend: true,
});

// Set the data for both line charts
line1.setData([series1]);
line2.setData([series2]);

// Keybindings to exit
screen.key(['escape', 'q', 'C-c'], function(ch: any, key: any) {
  return process.exit(0);
});
screen.render();

function updateData() {
  // Update or fetch new data for totalAs and totalBs
  // For example, add new data points to totalAs and totalBs
  // Then update the chart data

  const aggregatedTotalAs = aggregateDataPoints(totalAs);
  const aggregatedTotalBs = aggregateDataPoints(totalBs);
  
  // Prepare series data
  const series1 = {
    title: 'Total A',
    x: aggregatedTotalAs.map((point: any) => point.x),
    y: aggregatedTotalAs.map((point: any) => point.y),
    style: { line: 'red' }
  };
  
  const series2 = {
    title: 'Total B',
    x: aggregatedTotalBs.map((point: any) => point.x),
    y: aggregatedTotalBs.map((point: any) => point.y),
    style: { line: 'blue' }
  };
  
  // Set up the line charts in the grid
  const line1 = grid.set(0, 0, 1, 1, contrib.line, {
    label: 'Chart for Total A',
    showLegend: true,
  });
  
  const line2 = grid.set(1, 0, 1, 1, contrib.line, {
    label: 'Chart for Total B',
    showLegend: true,
  });
  
  // Set the data for both line charts
  line1.setData([series1]);
  line2.setData([series2]);

  screen.render();
}

const poolId = new PublicKey(process.argv[2])
async function checkClmmPosition() {
  while (true) {
  //const poolId = new PublicKey("6HDRX4JhXJSPREqWyqkPWZUSHG2CY7zNxjWu7UxTf1CD")//6HDRX4JhXJSPREqWyqkPWZUSHG2CY7zNxjWu7UxTf1CD 3BVNZ9vzUZ9ohoXbvwZXbmkv76vvbZSBSQjNK38YAFJp

  const poolInfoAccount = await connection.getAccountInfo(poolId)
  if (poolInfoAccount === null) throw Error(' pool id error ')

  const poolInfo = PoolInfoLayout.decode(poolInfoAccount.data)

  const gPA = await connection.getProgramAccounts(PROGRAMIDS.CLMM, {
    commitment: "confirmed",
    filters: [
      { dataSize: PositionInfoLayout.span },
      { memcmp: { bytes: poolId.toBase58(), offset: PositionInfoLayout.offsetOf('poolId') } },
    ]
  });

  const poolRewardMint = poolInfo.rewardInfos.map(i => i.tokenMint)
  const poolRewardMintAccount = await connection.getMultipleAccountsInfo(poolRewardMint)
  const poolRewardMintDecimals = []
  for (let i = 0; i < 3; i++) {
    const mint = poolRewardMint[i].toString()
    const account = poolRewardMintAccount[i]
    if (mint.toString() === PublicKey.default.toString()) {
      poolRewardMintDecimals.push(0)
    } else if (account === null) {
      throw Error('get reward mint info error')
    } else {
      const _mint = MintLayout.decode(account.data)
      poolRewardMintDecimals.push(_mint.decimals)
    }
  }

  let checkSumLiquidity = new BN(0);
  let totalA = new Decimal(0)
  let totalB = new Decimal(0)
  for (const account of gPA) {
    const position = PositionInfoLayout.decode(account.account.data);

    const owner = await findNftOwner(position.nftMint);
    if (owner?.toBase58() != "7ihN8QaTfNoDTRTQGULCzbUT3PHwPDTu5Brcu4iT2paP") continue;

    const status = checkPositionStatus(poolInfo, position);
    if (status === "InRange") checkSumLiquidity = checkSumLiquidity.add(position.liquidity);

    const amounts = LiquidityMath.getAmountsFromLiquidity(
      poolInfo.sqrtPriceX64,
      SqrtPriceMath.getSqrtPriceX64FromTick(position.tickLower),
      SqrtPriceMath.getSqrtPriceX64FromTick(position.tickUpper),
      position.liquidity,
      false
    );
    const amountA = new Decimal(amounts.amountA.toString()).div(10 ** poolInfo.mintDecimalsA)
    const amountB = new Decimal(amounts.amountB.toString()).div(10 ** poolInfo.mintDecimalsB)


    const tickArrayLowerAddress = TickUtils.getTickArrayAddressByTick(
      poolInfoAccount.owner,
      poolId,
      position.tickLower,
      poolInfo.tickSpacing
    )
    const tickArrayUpperAddress = TickUtils.getTickArrayAddressByTick(
      poolInfoAccount.owner,
      poolId,
      position.tickUpper,
      poolInfo.tickSpacing
    )

    const tickLowerState = (await getAndCacheTick(connection, tickArrayLowerAddress)).ticks[TickUtils.getTickOffsetInArray(
      position.tickLower,
      poolInfo.tickSpacing
    )]
    const tickUpperState = (await getAndCacheTick(connection, tickArrayUpperAddress)).ticks[TickUtils.getTickOffsetInArray(
      position.tickUpper,
      poolInfo.tickSpacing
    )]

    // @ts-ignore
    const { tokenFeeAmountA: _pendingFeeA, tokenFeeAmountB: _pendingFeeB } = PositionUtils.GetPositionFees({
      tickCurrent: poolInfo.tickCurrent,
      feeGrowthGlobalX64A: new BN(poolInfo.feeGrowthGlobalX64A),
      feeGrowthGlobalX64B: new BN(poolInfo.feeGrowthGlobalX64B),
    }, {
      feeGrowthInsideLastX64A: new BN(position.feeGrowthInsideLastX64A),
      feeGrowthInsideLastX64B: new BN(position.feeGrowthInsideLastX64B),
      tokenFeesOwedA: new BN(position.tokenFeesOwedA),
      tokenFeesOwedB: new BN(position.tokenFeesOwedB),
      liquidity: new BN(position.liquidity),
    }, tickLowerState, tickUpperState)

    const pendingFeeA = new Decimal(_pendingFeeA.toString()).div(10 ** poolInfo.mintDecimalsA)
    const pendingFeeB = new Decimal(_pendingFeeB.toString()).div(10 ** poolInfo.mintDecimalsB)

    const rewardInfos = PositionUtils.GetPositionRewards({
      tickCurrent: poolInfo.tickCurrent,
      // @ts-ignore
      rewardInfos: poolInfo.rewardInfos.map((i: any) => ({ rewardGrowthGlobalX64: new BN(i.rewardGrowthGlobalX64) }))
    }, {
      liquidity: new BN(position.liquidity),
      rewardInfos: position.rewardInfos.map((i: any) => ({ growthInsideLastX64: new BN(i.growthInsideLastX64), rewardAmountOwed: new BN(i.rewardAmountOwed) }))
    }, tickLowerState, tickUpperState)
/*
    console.log(
      "\taddress:", account.pubkey.toBase58(),
      "\towner:", owner?.toBase58() ?? "NOTFOUND",
      "\tliquidity:", position.liquidity.toString(),
      "\tstatus:", status,
      "\tamountA:", amountA.toString(),
      "\tamountB:", amountB.toString(),
      "\tpendingFeeA:", pendingFeeA.toString(),
      "\tpendingFeeB:", pendingFeeB.toString(),
      "\trewardA:", new Decimal(rewardInfos[0].toString()).div(10 ** poolRewardMintDecimals[0]).toString(),
      "\trewardB:", new Decimal(rewardInfos[1].toString()).div(10 ** poolRewardMintDecimals[1]).toString(),
      "\trewardC:", new Decimal(rewardInfos[2].toString()).div(10 ** poolRewardMintDecimals[2]).toString(),
    );*/
     totalA = totalA.add(amountA).add(pendingFeeA)
     totalB = totalB.add(amountB).add(pendingFeeB)
 
    


  }
  const owner = new PublicKey("7ihN8QaTfNoDTRTQGULCzbUT3PHwPDTu5Brcu4iT2paP")
  const associatedAddressA = getAssociatedTokenAddressSync(poolInfo.mintA, owner);
  const associatedAddressB = getAssociatedTokenAddressSync(poolInfo.mintB, owner);

  const balanceA = new Decimal((await connection.getTokenAccountBalance(associatedAddressA)).value.amount).div(10 ** poolInfo.mintDecimalsA)
  const balanceB = new Decimal((await connection.getTokenAccountBalance(associatedAddressB)).value.amount).div(10 ** poolInfo.mintDecimalsB)
  totalA = totalA.add(balanceA)
  totalB = totalB.add(balanceB)
  const timestamp = new Date().toISOString()
  totalAs.push([timestamp,Number(totalA.toString())])
  totalBs.push([timestamp, Number(totalB.toString())])

  // Set up the interval to update the chart every 2000 milliseconds (2 seconds)
  setInterval(updateData, 2000);
  
  // Keybindings to exit
  screen.key(['escape', 'q', 'C-c'], function(ch: any, key: any) {
    return process.exit(0);
  });
  
  // Initial render of the screen
  screen.render();
}
}

function checkPositionStatus(poolInfo: { tickCurrent: number }, position: { tickLower: number, tickUpper: number }) {
  if (position.tickUpper <= poolInfo.tickCurrent) return "OutOfRange(PriceIsAboveRange)";
  if (position.tickLower > poolInfo.tickCurrent) return "OutOfRange(PriceIsBelowRange)";
  return "InRange";
}

async function findNftOwner(mint: PublicKey): Promise<PublicKey | null> {
  const res = await connection.getTokenLargestAccounts(mint);
  if (!res.value) return null;
  if (res.value.length === 0) return null;
  if (res.value[0].uiAmount !== 1) return null;

  const account = await connection.getAccountInfo(res.value[0].address)
  const info = SPL_ACCOUNT_LAYOUT.decode(account?.data!)

  return info.owner
}

const _tempCache: { [address: string]: { ticks: { [key: number]: Tick } } } = {}
async function getAndCacheTick(connection: Connection, address: PublicKey) {
  if (_tempCache[address.toString()] !== undefined) return _tempCache[address.toString()]
  const account = await connection.getAccountInfo(address)

  if (account === null) throw Error(' get tick error ')

  const _d = TickArrayLayout.decode(account.data)

  _tempCache[address.toString()] = _d

  return _d
}

checkClmmPosition()