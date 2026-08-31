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
    await ctx.pool.stepDraw(8);
    await ctx.pool.finalizeDraw();

    const aliceWinH = await ctx.pool.confidentialWinningsOf(ctx.alice.address);
    const bobWinH = await ctx.pool.confidentialWinningsOf(ctx.bob.address);
    const aliceWin = await decryptEuint64(aliceWinH, ctx.poolAddress, ctx.alice);
    const bobWin = await decryptEuint64(bobWinH, ctx.poolAddress, ctx.bob);
    expect(aliceWin + bobWin).to.eq(prize);

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
});
