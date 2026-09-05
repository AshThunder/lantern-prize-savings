import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import {
  ConfidentialPrizePool,
  MockConfidentialUSDT,
  MockUSDT,
} from "../types";

type Ctx = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  usdt: MockUSDT;
  cUsdt: MockConfidentialUSDT;
  pool: ConfidentialPrizePool;
  poolAddress: string;
  tokenAddress: string;
};

const DEPOSIT_DATA = "0x01";
const RESERVE_BPS = 1000n;
const BPS = 10_000n;

function afterReserve(amount: bigint): bigint {
  return amount - (amount * RESERVE_BPS) / BPS;
}

function isTierPayout(n: bigint, grand: bigint, daily: bigint): boolean {
  return n === 0n || n === grand || n === daily || n === grand + daily;
}

async function closeDraw(pool: ConfidentialPrizePool): Promise<void> {
  await pool.snapshotPrizeRecipients();
  await pool.finalizeDraw();
}

async function deployFixture(): Promise<Ctx> {
  const [deployer, alice, bob] = await ethers.getSigners();
  const usdt = (await ethers.deployContract("MockUSDT")) as MockUSDT;
  const cUsdt = (await ethers.deployContract("MockConfidentialUSDT", [
    await usdt.getAddress(),
  ])) as MockConfidentialUSDT;
  const pool = (await ethers.deployContract("ConfidentialPrizePool", [
    deployer.address,
    await cUsdt.getAddress(),
    await usdt.getAddress(),
    await cUsdt.getAddress(),
    0,
    ethers.ZeroAddress,
  ])) as ConfidentialPrizePool;

  return {
    deployer,
    alice,
    bob,
    usdt,
    cUsdt,
    pool,
    poolAddress: await pool.getAddress(),
    tokenAddress: await cUsdt.getAddress(),
  };
}

async function mintWrap(
  ctx: Ctx,
  user: HardhatEthersSigner,
  amount: bigint,
): Promise<void> {
  await ctx.usdt.mint(user.address, amount);
  await ctx.usdt.connect(user).approve(ctx.tokenAddress, amount);
  await ctx.cUsdt.connect(user).wrap(user.address, amount);
}

async function confidentialDeposit(
  ctx: Ctx,
  user: HardhatEthersSigner,
  amount: bigint,
): Promise<void> {
  const enc = await fhevm
    .createEncryptedInput(ctx.tokenAddress, user.address)
    .add64(amount)
    .encrypt();
  const tx = await ctx.cUsdt
    .connect(user)
    ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
      ctx.poolAddress,
      enc.handles[0],
      enc.inputProof,
      DEPOSIT_DATA,
    );
  await tx.wait();
}

async function decryptEuint64(
  handle: string,
  contractAddress: string,
  signer: HardhatEthersSigner,
): Promise<bigint> {
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, contractAddress, signer);
}

describe("ConfidentialPrizePool", function () {
  let ctx: Ctx;

  before(async function () {
    if (!fhevm.isMock) {
      console.warn("Skipping: requires FHEVM mock");
      this.skip();
    }
  });

  beforeEach(async function () {
    ctx = await deployFixture();
  });

  it("credits encrypted shares on confidential deposit", async function () {
    const amount = 1_000_000n;
    await mintWrap(ctx, ctx.alice, amount);
    await confidentialDeposit(ctx, ctx.alice, amount);

    expect(await ctx.pool.depositorCount()).to.eq(1n);
    const handle = await ctx.pool.confidentialBalanceOf(ctx.alice.address);
    const shares = await decryptEuint64(handle, ctx.poolAddress, ctx.alice);
    expect(shares).to.eq(amount);
  });

  it("withdraws principal with no loss", async function () {
    const amount = 2_000_000n;
    await mintWrap(ctx, ctx.alice, amount);
    await confidentialDeposit(ctx, ctx.alice, amount);

    const enc = await fhevm
      .createEncryptedInput(ctx.poolAddress, ctx.alice.address)
      .add64(amount)
      .encrypt();
    await ctx.pool
      .connect(ctx.alice)
      .withdraw(enc.handles[0], enc.inputProof, ctx.alice.address);

    const shareHandle = await ctx.pool.confidentialBalanceOf(ctx.alice.address);
    const shares = await decryptEuint64(shareHandle, ctx.poolAddress, ctx.alice);
    expect(shares).to.eq(0n);

    const tokenHandle = await ctx.cUsdt.confidentialBalanceOf(ctx.alice.address);
    const tokenBal = await decryptEuint64(tokenHandle, ctx.tokenAddress, ctx.alice);
    expect(tokenBal).to.eq(amount);
  });

  it("leaves a second depositor unaffected by a full exit", async function () {
    const a = 1_000_000n;
    const b = 3_000_000n;
    await mintWrap(ctx, ctx.alice, a);
    await mintWrap(ctx, ctx.bob, b);
    await confidentialDeposit(ctx, ctx.alice, a);
    await confidentialDeposit(ctx, ctx.bob, b);

    await ctx.pool.connect(ctx.alice).redeemAll(ctx.alice.address);

    const bobHandle = await ctx.pool.confidentialBalanceOf(ctx.bob.address);
    const bobShares = await decryptEuint64(bobHandle, ctx.poolAddress, ctx.bob);
    expect(bobShares).to.eq(b);
    expect(await ctx.pool.depositorCount()).to.eq(1n);
  });

  it("blocks withdraw while a draw is in progress", async function () {
    const amount = 1_000_000n;
    await mintWrap(ctx, ctx.alice, amount);
    await confidentialDeposit(ctx, ctx.alice, amount);

    const prize = 100_000n;
    await ctx.usdt.mint(ctx.deployer.address, prize);
    await ctx.usdt.connect(ctx.deployer).approve(ctx.poolAddress, prize);
    await ctx.pool.connect(ctx.deployer).sponsor(prize);
    await ctx.pool.startDraw();

    const enc = await fhevm
      .createEncryptedInput(ctx.poolAddress, ctx.alice.address)
      .add64(amount)
      .encrypt();
    await expect(
      ctx.pool.connect(ctx.alice).withdraw(enc.handles[0], enc.inputProof, ctx.alice.address),
    ).to.be.revertedWithCustomError(ctx.pool, "DrawInProgress");
  });

  it("blocks startDraw until the draw period elapses", async function () {
    const pool = (await ethers.deployContract("ConfidentialPrizePool", [
      ctx.deployer.address,
      ctx.tokenAddress,
      await ctx.usdt.getAddress(),
      ctx.tokenAddress,
      600,
      ethers.ZeroAddress,
    ])) as ConfidentialPrizePool;
    const poolAddress = await pool.getAddress();

    const amount = 1_000_000n;
    await mintWrap(ctx, ctx.alice, amount);
    const enc = await fhevm
      .createEncryptedInput(ctx.tokenAddress, ctx.alice.address)
      .add64(amount)
      .encrypt();
    await ctx.cUsdt
      .connect(ctx.alice)
      ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
        poolAddress,
        enc.handles[0],
        enc.inputProof,
        DEPOSIT_DATA,
      );

    const prize = 50_000n;
    await ctx.usdt.mint(ctx.deployer.address, prize);
    await ctx.usdt.connect(ctx.deployer).approve(poolAddress, prize);
    await pool.connect(ctx.deployer).sponsor(prize);

    await expect(pool.startDraw()).to.be.revertedWithCustomError(pool, "DrawIntervalNotElapsed");
    await time.increase(600);
    await expect(pool.startDraw()).to.not.be.reverted;
  });

  it("awards encrypted winnings that sum to the public prize and allows claim", async function () {
    const a = 1_000_000n;
    const b = 99_000_000n;
    await mintWrap(ctx, ctx.alice, a);
    await mintWrap(ctx, ctx.bob, b);
    await confidentialDeposit(ctx, ctx.alice, a);
    await confidentialDeposit(ctx, ctx.bob, b);

    const prize = 1_000_000n;
    await ctx.usdt.mint(ctx.deployer.address, prize);
    await ctx.usdt.connect(ctx.deployer).approve(ctx.poolAddress, prize);
    await ctx.pool.connect(ctx.deployer).sponsor(prize);

    await ctx.pool.startDraw();
    await closeDraw(ctx.pool);

    await ctx.pool.accruePrize(ctx.alice.address);
    await ctx.pool.accruePrize(ctx.bob.address);

    const grand = await ctx.pool.lastGrandPrize();
    const daily = await ctx.pool.lastDailyPrize();
    const aliceWinH = await ctx.pool.confidentialWinningsOf(ctx.alice.address);
    const bobWinH = await ctx.pool.confidentialWinningsOf(ctx.bob.address);
    const aliceWin = await decryptEuint64(aliceWinH, ctx.poolAddress, ctx.alice);
    const bobWin = await decryptEuint64(bobWinH, ctx.poolAddress, ctx.bob);
    expect(isTierPayout(aliceWin, grand, daily)).to.eq(true);
    expect(isTierPayout(bobWin, grand, daily)).to.eq(true);
    expect(aliceWin + bobWin).to.be.lte(grand + daily);
    expect(grand + daily).to.eq(afterReserve(prize));
    expect(grand + daily).to.eq(await ctx.pool.lastDrawPrize());

    const before = await decryptEuint64(
      await ctx.cUsdt.confidentialBalanceOf(ctx.alice.address),
      ctx.tokenAddress,
      ctx.alice,
    );
    await ctx.pool.connect(ctx.alice).claim();
    const after = await decryptEuint64(
      await ctx.cUsdt.confidentialBalanceOf(ctx.alice.address),
      ctx.tokenAddress,
      ctx.alice,
    );
    expect(after - before).to.eq(aliceWin);

    const winAfter = await decryptEuint64(
      await ctx.pool.confidentialWinningsOf(ctx.alice.address),
      ctx.poolAddress,
      ctx.alice,
    );
    expect(winAfter).to.eq(0n);
  });

  it("exposes PoolTogether vault helpers at 1:1", async function () {
    expect(await ctx.pool.previewDeposit(123n)).to.eq(123n);
    expect(await ctx.pool.convertToShares(50n)).to.eq(50n);
    expect(await ctx.pool.numberOfTiers()).to.eq(2);
    expect(await ctx.pool.getTierPrizeCount(0)).to.eq(1);
    expect(await ctx.pool.prizeToken()).to.eq(ctx.tokenAddress);
  });

  it("redirects encrypted winnings to a random NFT holder via prize hooks", async function () {
    const nft = await ethers.deployContract("MockDuckNFT", [ethers.ZeroAddress]);
    const hook = await ethers.deployContract("PrizeToNftHolderHook", [
      await nft.getAddress(),
      ctx.poolAddress,
    ]);
    await nft.connect(ctx.bob).mint();

    await ctx.pool.connect(ctx.alice).setHooks({
      useBeforeClaimPrize: true,
      useAfterClaimPrize: false,
      implementation: await hook.getAddress(),
    });

    const amount = 1_000_000n;
    await mintWrap(ctx, ctx.alice, amount);
    await confidentialDeposit(ctx, ctx.alice, amount);

    const prize = 250_000n;
    await ctx.usdt.mint(ctx.deployer.address, prize);
    await ctx.usdt.connect(ctx.deployer).approve(ctx.poolAddress, prize);
    await ctx.pool.connect(ctx.deployer).sponsor(prize);

    const stored = await ctx.pool.getHooks(ctx.alice.address);
    expect(stored.useBeforeClaimPrize).to.eq(true);
    expect(stored.implementation).to.eq(await hook.getAddress());

    await ctx.pool.startDraw();
    expect(await ctx.pool.getWinningRandomNumber()).to.not.eq(0n);
    const [recipient] = await hook.beforeClaimPrize(ctx.alice.address, 0, 0, 0, ethers.ZeroAddress);
    expect(recipient).to.eq(ctx.bob.address);

    await ctx.pool.snapshotPrizeRecipients();
    await ctx.pool.finalizeDraw();
    await expect(ctx.pool.accruePrize(ctx.alice.address))
      .to.emit(ctx.pool, "PrizeAccrued")
      .withArgs(ctx.alice.address, ctx.bob.address);

    await mintWrap(ctx, ctx.bob, 1n);
    const before = await decryptEuint64(
      await ctx.cUsdt.confidentialBalanceOf(ctx.bob.address),
      ctx.tokenAddress,
      ctx.bob,
    );
    await ctx.pool.connect(ctx.bob).claim();
    const after = await decryptEuint64(
      await ctx.cUsdt.confidentialBalanceOf(ctx.bob.address),
      ctx.tokenAddress,
      ctx.bob,
    );
    const grand = await ctx.pool.lastGrandPrize();
    const daily = await ctx.pool.lastDailyPrize();
    expect(isTierPayout(after - before, grand, daily)).to.eq(true);
  });

  it("zeros last-second deposits on permissionless draws via minHold + TWAB", async function () {
    const pool = (await ethers.deployContract("ConfidentialPrizePool", [
      ctx.deployer.address,
      ctx.tokenAddress,
      await ctx.usdt.getAddress(),
      ctx.tokenAddress,
      60,
      ethers.ZeroAddress,
    ])) as ConfidentialPrizePool;
    const poolAddress = await pool.getAddress();
    expect(await pool.minHoldSeconds()).to.eq(60);

    const aliceAmt = 1_000_000n;
    const bobAmt = 99_000_000n;
    await mintWrap(ctx, ctx.alice, aliceAmt);
    await mintWrap(ctx, ctx.bob, bobAmt);

    const aliceEnc = await fhevm
      .createEncryptedInput(ctx.tokenAddress, ctx.alice.address)
      .add64(aliceAmt)
      .encrypt();
    await ctx.cUsdt
      .connect(ctx.alice)
      ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
        poolAddress,
        aliceEnc.handles[0],
        aliceEnc.inputProof,
        DEPOSIT_DATA,
      );

    await time.increase(60);

    const bobEnc = await fhevm
      .createEncryptedInput(ctx.tokenAddress, ctx.bob.address)
      .add64(bobAmt)
      .encrypt();
    await ctx.cUsdt
      .connect(ctx.bob)
      ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
        poolAddress,
        bobEnc.handles[0],
        bobEnc.inputProof,
        DEPOSIT_DATA,
      );

    const prize = 400_000n;
    await ctx.usdt.mint(ctx.deployer.address, prize);
    await ctx.usdt.connect(ctx.deployer).approve(poolAddress, prize);
    await pool.connect(ctx.deployer).sponsor(prize);
    await pool.startDraw();
    await closeDraw(pool);
    await pool.accruePrize(ctx.alice.address);
    await pool.accruePrize(ctx.bob.address);

    const grand = await pool.lastGrandPrize();
    const daily = await pool.lastDailyPrize();
    const aliceWin = await decryptEuint64(
      await pool.confidentialWinningsOf(ctx.alice.address),
      poolAddress,
      ctx.alice,
    );
    const bobWin = await decryptEuint64(
      await pool.confidentialWinningsOf(ctx.bob.address),
      poolAddress,
      ctx.bob,
    );
    expect(bobWin).to.eq(0n);
    expect(isTierPayout(aliceWin, grand, daily)).to.eq(true);
  });

  it("pays TWAB rewards proportional to encrypted share-seconds", async function () {
    const amount = 1_000_000n;
    await mintWrap(ctx, ctx.alice, amount);
    await confidentialDeposit(ctx, ctx.alice, amount);

    const budget = 100_000n;
    const duration = 60;
    const scale = amount * BigInt(duration);
    await ctx.usdt.mint(ctx.deployer.address, budget);
    await ctx.usdt.connect(ctx.deployer).approve(ctx.poolAddress, budget);
    await ctx.pool.connect(ctx.deployer).createTwabCampaign(budget, duration, scale);

    await time.increase(duration);

    const before = await decryptEuint64(
      await ctx.cUsdt.confidentialBalanceOf(ctx.alice.address),
      ctx.tokenAddress,
      ctx.alice,
    );
    await ctx.pool.connect(ctx.alice).claimTwabRewards(1);
    const after = await decryptEuint64(
      await ctx.cUsdt.confidentialBalanceOf(ctx.alice.address),
      ctx.tokenAddress,
      ctx.alice,
    );
    expect(after - before).to.eq(budget);
  });

  it("splits sponsor into prize liquidity and reserve, then pays the startDraw keeper", async function () {
    const amount = 1_000_000n;
    await mintWrap(ctx, ctx.alice, amount);
    await confidentialDeposit(ctx, ctx.alice, amount);

    const prize = 1_000_000n;
    await ctx.usdt.mint(ctx.deployer.address, prize);
    await ctx.usdt.connect(ctx.deployer).approve(ctx.poolAddress, prize);
    await ctx.pool.connect(ctx.deployer).sponsor(prize);

    expect(await ctx.pool.prizeLiquidity()).to.eq(afterReserve(prize));
    expect(await ctx.pool.reserve()).to.eq(prize - afterReserve(prize));
    expect(await ctx.pool.getDrawPhase()).to.eq(0); // Open when drawPeriod is 0

    const before = await ctx.usdt.balanceOf(ctx.bob.address);
    await ctx.pool.connect(ctx.bob).startDraw();
    expect(await ctx.pool.getDrawPhase()).to.eq(2); // Awarded
    expect(await ctx.usdt.balanceOf(ctx.bob.address)).to.eq(before + (prize - afterReserve(prize)));
    expect(await ctx.pool.reserve()).to.eq(0n);
  });

  it("lets anyone claimFor a winner (PoolTogether Prize Claimer)", async function () {
    const amount = 1_000_000n;
    await mintWrap(ctx, ctx.alice, amount);
    await confidentialDeposit(ctx, ctx.alice, amount);

    const prize = 500_000n;
    await ctx.usdt.mint(ctx.deployer.address, prize);
    await ctx.usdt.connect(ctx.deployer).approve(ctx.poolAddress, prize);
    await ctx.pool.connect(ctx.deployer).sponsor(prize);

    await ctx.pool.startDraw();
    await closeDraw(ctx.pool);

    await ctx.pool.accruePrize(ctx.alice.address);
    const awarded = await decryptEuint64(
      await ctx.pool.confidentialWinningsOf(ctx.alice.address),
      ctx.poolAddress,
      ctx.alice,
    );
    const before = await decryptEuint64(
      await ctx.cUsdt.confidentialBalanceOf(ctx.alice.address),
      ctx.tokenAddress,
      ctx.alice,
    );
    await ctx.pool.connect(ctx.bob).claimFor(ctx.alice.address);
    const after = await decryptEuint64(
      await ctx.cUsdt.confidentialBalanceOf(ctx.alice.address),
      ctx.tokenAddress,
      ctx.alice,
    );
    expect(after - before).to.eq(awarded);
  });

  it("reports Closed then Finalized across a timed draw period", async function () {
    const pool = (await ethers.deployContract("ConfidentialPrizePool", [
      ctx.deployer.address,
      ctx.tokenAddress,
      await ctx.usdt.getAddress(),
      ctx.tokenAddress,
      60,
      ethers.ZeroAddress,
    ])) as ConfidentialPrizePool;
    const poolAddress = await pool.getAddress();

    const amount = 1_000_000n;
    await mintWrap(ctx, ctx.alice, amount);
    const enc = await fhevm
      .createEncryptedInput(ctx.tokenAddress, ctx.alice.address)
      .add64(amount)
      .encrypt();
    await ctx.cUsdt
      .connect(ctx.alice)
      ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
        poolAddress,
        enc.handles[0],
        enc.inputProof,
        DEPOSIT_DATA,
      );

    const prize = 200_000n;
    await ctx.usdt.mint(ctx.deployer.address, prize);
    await ctx.usdt.connect(ctx.deployer).approve(poolAddress, prize);
    await pool.connect(ctx.deployer).sponsor(prize);

    expect(await pool.getDrawPhase()).to.eq(0); // Open
    await time.increase(60);
    expect(await pool.getDrawPhase()).to.eq(1); // Closed
    await pool.startDraw();
    expect(await pool.getDrawPhase()).to.eq(2); // Awarded
    await closeDraw(pool);
    expect(await pool.getDrawPhase()).to.eq(0); // next Open
    await time.increase(60);
    expect(await pool.getDrawPhase()).to.eq(3); // Finalized (no remaining prize)
  });

  it("freezes vault TWAB in startDraw so finish does not walk the roster", async function () {
    const amount = 1_000_000n;
    await mintWrap(ctx, ctx.alice, amount);
    await confidentialDeposit(ctx, ctx.alice, amount);
    const prize = 100_000n;
    await ctx.usdt.mint(ctx.deployer.address, prize);
    await ctx.usdt.connect(ctx.deployer).approve(ctx.poolAddress, prize);
    await ctx.pool.connect(ctx.deployer).sponsor(prize);

    await ctx.pool.startDraw();
    expect(await ctx.pool.remainingScan()).to.eq(0n);
    expect(await ctx.pool.canFinishDraw()).to.eq(true);
    await ctx.pool.finalizeDraw();
    expect(await ctx.pool.getLastAwardedDrawId()).to.eq(1n);

    await ctx.pool.accruePrize(ctx.alice.address);
    const win = await decryptEuint64(
      await ctx.pool.confidentialWinningsOf(ctx.alice.address),
      ctx.poolAddress,
      ctx.alice,
    );
    const grand = await ctx.pool.lastGrandPrize();
    const daily = await ctx.pool.lastDailyPrize();
    expect(isTierPayout(win, grand, daily)).to.eq(true);
  });

  it("does not cap how many wallets can deposit", async function () {
    expect(await ctx.pool.maxDeposit(ctx.alice.address)).to.eq((1n << 64n) - 1n);
    const amount = 10_000n;
    const extras = (await ethers.getSigners()).slice(3, 9);
    for (const user of extras) {
      await mintWrap(ctx, user, amount);
      await confidentialDeposit(ctx, user, amount);
    }
    expect(await ctx.pool.depositorCount()).to.eq(6n);
  });
});
