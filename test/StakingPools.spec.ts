import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect, use } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers, upgrades, waffle } from "hardhat";
import { Duration } from "luxon";
import { expandTo18Decimals, uint256Max } from "./utilities";
import { mineBlock, setNextBlockNumber } from "./utilities/timeTravel";

use(waffle.solidity);

describe("StakingPools", function () {
  let deployer: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress,
    charlie: SignerWithAddress,
    david: SignerWithAddress,
    rewardDispatcher: SignerWithAddress,
    mockOptionContract: SignerWithAddress;

  const poolAId: number = 1;
  const poolBId: number = 2;

  let tokenA: Contract,
    tokenB: Contract,
    rewardToken: Contract,
    stakingPools: Contract,
    rewarder: Contract;

  let poolAStartBlock: number, poolAEndBlock: number;
  const assertStakerRewardEqual = async (
    poolId: number | BigNumber,
    staker: string,
    reward: BigNumber
  ) => {
    expect(await stakingPools.getReward(poolId, staker)).to.equal(reward);
  };

  beforeEach(async function () {
    [
      deployer,
      alice,
      bob,
      charlie,
      david,
      rewardDispatcher,
      mockOptionContract,
    ] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory(
      "ERC20Mock",
      this.deployer
    );
    const StakingPools = await ethers.getContractFactory("StakingPools");

    const StakingPoolRewarder = await ethers.getContractFactory(
      "StakingPoolRewarder"
    );

    // Using `ERC20Mock` contract as ERC20 mock
    tokenA = await ERC20Mock.deploy(
      "Sniper",
      "SPR",
      expandTo18Decimals(100000)
    );
    tokenB = await ERC20Mock.deploy(
      "Sniper",
      "SPR",
      expandTo18Decimals(100000)
    );
    rewardToken = await ERC20Mock.deploy(
      "DOB",
      "DOB",
      expandTo18Decimals(100000)
    );
    stakingPools = await upgrades.deployProxy(StakingPools, [], {
      initializer: "__StakingPools_init",
    });
    await stakingPools.deployed();

    rewarder = await upgrades.deployProxy(
      StakingPoolRewarder,
      [
        stakingPools.address,
        rewardToken.address,
        rewardDispatcher.address,
        75,
        Duration.fromObject({ weeks: 26 }).as("seconds"),
        Duration.fromObject({ weeks: 1 }).as("seconds"),
      ],
      { initializer: "__StakingPoolRewarder_init" }
    );
    await rewarder.deployed();
    await rewardToken
      .connect(deployer)
      .transfer(rewardDispatcher.address, expandTo18Decimals(1_000));
    await rewardToken
      .connect(rewardDispatcher)
      .approve(rewarder.address, expandTo18Decimals(600), {
        from: rewardDispatcher.address,
      });

    await stakingPools.connect(deployer).setRewarder(rewarder.address);

    // Everyone gets 1000 of both tokens
    for (const user of [alice, bob, charlie, david]) {
      for (const token of [tokenA, tokenB]) {
        await token.connect(deployer).transfer(
          user.address, // recipient
          expandTo18Decimals(1_000) // amount
        );
        await token.connect(user).approve(
          stakingPools.address, // spender
          uint256Max // amount
        );
      }
    }

    const currentBlockNumber: number = await ethers.provider.getBlockNumber();

    poolAStartBlock = currentBlockNumber + 10;
    poolAEndBlock = currentBlockNumber + 30;

    // Create token A pool: 20 blocks with 100 reward per block
    await stakingPools.connect(deployer).createPool(
      tokenA.address, // token
      mockOptionContract.address,
      poolAStartBlock, // startBlock
      poolAEndBlock, // endBlock
      expandTo18Decimals(100) // rewardPerBlock
    );
  });

  it("pool info should be set correctly", async function () {
    expect((await stakingPools.poolInfos(poolAId)).startBlock).to.equal(
      poolAStartBlock
    );
    expect((await stakingPools.poolInfos(poolAId)).endBlock).to.equal(
      poolAEndBlock
    );
    expect((await stakingPools.poolInfos(poolAId)).optionContract).to.equal(
      mockOptionContract.address
    );
  });

  it("cannot stake before start block", async function () {
    await setNextBlockNumber(ethers.provider, poolAStartBlock - 1);
    await expect(
      stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1))
    ).to.be.revertedWith("StakingPools: pool not active");
  });

  it("can stake after start block", async function () {
    await setNextBlockNumber(ethers.provider, poolAStartBlock);
    await stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1));
  });

  it("cannot stake after end block", async function () {
    await setNextBlockNumber(ethers.provider, poolAEndBlock);
    await expect(
      stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1))
    ).to.be.revertedWith("StakingPools: pool not active");
  });

  it("can unstake after end block", async function () {
    await setNextBlockNumber(ethers.provider, poolAStartBlock);
    await stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1));

    await setNextBlockNumber(ethers.provider, poolAEndBlock);
    await stakingPools.connect(alice).unstake(poolAId, expandTo18Decimals(1));
  });

  it("staking should emit Staked event", async function () {
    await setNextBlockNumber(ethers.provider, poolAStartBlock);
    await expect(
      stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1))
    )
      .to.emit(stakingPools, "Staked")
      .withArgs(
        poolAId, // poolId
        alice.address, // staker
        tokenA.address, // token
        expandTo18Decimals(1) // amount
      );
  });

  it("unstaking should emit Unstaked event", async function () {
    await setNextBlockNumber(ethers.provider, poolAStartBlock);
    await stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1));

    await expect(
      stakingPools.connect(alice).unstake(poolAId, expandTo18Decimals(0.3))
    )
      .to.emit(stakingPools, "Unstaked")
      .withArgs(
        poolAId, // poolId
        alice.address, // staker
        tokenA.address, // token
        expandTo18Decimals(0.3) // amount
      );
  });

  it("cannot unstake when staked amount is zero", async function () {
    // Cannot unstake without staking first
    await setNextBlockNumber(ethers.provider, poolAStartBlock);
    await expect(
      stakingPools.connect(alice).unstake(poolAId, expandTo18Decimals(1))
    ).to.be.revertedWith("0x11");

    // Cannot unstake once all of the staked amount has been unstaked
    await stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1));
    await stakingPools.connect(alice).unstake(poolAId, expandTo18Decimals(1));
    await expect(
      stakingPools.connect(alice).unstake(poolAId, expandTo18Decimals(1))
    ).to.be.revertedWith("0x11");
  });

  it("cannot unstake more than staked amount", async function () {
    await setNextBlockNumber(ethers.provider, poolAStartBlock);
    await stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1));
    await expect(
      stakingPools.connect(alice).unstake(poolAId, expandTo18Decimals(2))
    ).to.be.revertedWith("0x11");
  });

  it("token should be transferred on stake", async function () {
    await setNextBlockNumber(ethers.provider, poolAStartBlock);
    await expect(
      stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1))
    )
      .to.emit(tokenA, "Transfer")
      .withArgs(
        alice.address, // from
        stakingPools.address, // to
        expandTo18Decimals(1) // amount
      );

    expect(await tokenA.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(999)
    );
    expect(await tokenA.balanceOf(stakingPools.address)).to.equal(
      expandTo18Decimals(1)
    );
  });

  it("token should be transferred on unstake", async function () {
    await setNextBlockNumber(ethers.provider, poolAStartBlock);
    await stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1));

    await expect(
      stakingPools.connect(alice).unstake(poolAId, expandTo18Decimals(0.3))
    )
      .to.emit(tokenA, "Transfer")
      .withArgs(
        stakingPools.address, // from
        alice.address, // to
        expandTo18Decimals(0.3) // amount
      );

    expect(await tokenA.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(999.3)
    );
    expect(await tokenA.balanceOf(stakingPools.address)).to.equal(
      expandTo18Decimals(0.7)
    );
  });

  it("PoolData.totalStakeAmount should track total staked amount", async function () {
    expect((await stakingPools.poolData(poolAId)).totalStakeAmount).to.equal(0);

    await setNextBlockNumber(ethers.provider, poolAStartBlock);
    await stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1));
    expect((await stakingPools.poolData(poolAId)).totalStakeAmount).to.equal(
      expandTo18Decimals(1)
    );

    await stakingPools.connect(bob).stake(poolAId, expandTo18Decimals(3));
    expect((await stakingPools.poolData(poolAId)).totalStakeAmount).to.equal(
      expandTo18Decimals(4)
    );

    await stakingPools.connect(alice).unstake(poolAId, expandTo18Decimals(0.1));
    expect((await stakingPools.poolData(poolAId)).totalStakeAmount).to.equal(
      expandTo18Decimals(3.9)
    );
  });

  it("UserData.stakeAmount should track user staked amount", async function () {
    expect(
      (await stakingPools.userData(poolAId, alice.address)).stakeAmount
    ).to.equal(0);
    expect(
      (await stakingPools.userData(poolAId, bob.address)).stakeAmount
    ).to.equal(0);

    await setNextBlockNumber(ethers.provider, poolAStartBlock);
    await stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1));
    expect(
      (await stakingPools.userData(poolAId, alice.address)).stakeAmount
    ).to.equal(expandTo18Decimals(1));
    expect(
      (await stakingPools.userData(poolAId, bob.address)).stakeAmount
    ).to.equal(0);

    await stakingPools.connect(bob).stake(poolAId, expandTo18Decimals(3));
    expect(
      (await stakingPools.userData(poolAId, alice.address)).stakeAmount
    ).to.equal(expandTo18Decimals(1));
    expect(
      (await stakingPools.userData(poolAId, bob.address)).stakeAmount
    ).to.equal(expandTo18Decimals(3));

    await stakingPools.connect(alice).unstake(poolAId, expandTo18Decimals(0.1));
    expect(
      (await stakingPools.userData(poolAId, alice.address)).stakeAmount
    ).to.equal(expandTo18Decimals(0.9));
    expect(
      (await stakingPools.userData(poolAId, bob.address)).stakeAmount
    ).to.equal(expandTo18Decimals(3));
  });

  it("one staker should earn all rewards", async function () {
    // Alice stakes 5 blocks after start
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 5);
    await stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1));

    // The immediate reward amount is zero
    await assertStakerRewardEqual(poolAId, alice.address, BigNumber.from(0));
    // Should earn 5 blocks of reward after 5 blocks
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 10);
    await mineBlock(ethers.provider);
    await assertStakerRewardEqual(
      poolAId,
      alice.address,
      expandTo18Decimals(500)
    );

    // Reward is capped at endBlock
    await setNextBlockNumber(ethers.provider, poolAEndBlock);
    await mineBlock(ethers.provider);
    await assertStakerRewardEqual(
      poolAId,
      alice.address,
      expandTo18Decimals(1500)
    );
  });

  it("proportional reward distribution for multiple stakers", async function () {
    // Alice stakes at start block
    await setNextBlockNumber(ethers.provider, poolAStartBlock);
    await stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1));

    // // Bob stakes 5 blocks after
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 5);
    await stakingPools.connect(bob).stake(poolAId, expandTo18Decimals(9));

    // Bob has accurred any reward just yet
    await assertStakerRewardEqual(
      poolAId,
      alice.address,
      expandTo18Decimals(500)
    );
    await assertStakerRewardEqual(poolAId, bob.address, BigNumber.from(0));

    // After 5 blocks, Bob unstakes such that his share is the same as Alice's
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 10);
    await stakingPools.connect(bob).unstake(poolAId, expandTo18Decimals(8));

    // Bob takes 90% of reward for the past week
    //
    // Alice: 500 + 5 * 100 * 0.1 = 550
    // Bob: 5 * 100 * 0.9 = 450
    await assertStakerRewardEqual(
      poolAId,
      alice.address,
      expandTo18Decimals(550)
    );
    await assertStakerRewardEqual(
      poolAId,
      bob.address,
      expandTo18Decimals(450)
    );

    // After 5 blocks, Bob unstakes everything such that Alice will earn all remaining rewards
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 15);
    await stakingPools.connect(bob).unstake(poolAId, expandTo18Decimals(1));

    // Alice and Bob both take half of the reward from the past week
    //
    // Alice: 550 + 5 * 100 * 0.5 = 800
    // Bob: 450 + 5 * 100 * 0.5 = 700
    await assertStakerRewardEqual(
      poolAId,
      alice.address,
      expandTo18Decimals(800)
    );
    await assertStakerRewardEqual(
      poolAId,
      bob.address,
      expandTo18Decimals(700)
    );

    // Alice takes all reward from the final week
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 20);
    await mineBlock(ethers.provider);
    await assertStakerRewardEqual(
      poolAId,
      alice.address,
      expandTo18Decimals(1300)
    );
    await assertStakerRewardEqual(
      poolAId,
      bob.address,
      expandTo18Decimals(700)
    );

    // No more reward accumulation after endBlock
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 30);
    await mineBlock(ethers.provider);
    await assertStakerRewardEqual(
      poolAId,
      alice.address,
      expandTo18Decimals(1300)
    );
    await assertStakerRewardEqual(
      poolAId,
      bob.address,
      expandTo18Decimals(700)
    );
  });

  it("unable to stake if pool does not exist", async function () {
    await expect(
      stakingPools.connect(alice).stake(poolBId, expandTo18Decimals(1))
    ).to.be.revertedWith("StakingPools: pool not found");
  });

  it("user receives no reward after emergency unstake", async function () {
    // Alice stakes 5 blocks after start
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 5);
    await stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1));

    // The immediate reward amount is zero
    await assertStakerRewardEqual(poolAId, alice.address, BigNumber.from(0));
    // Should earn 5 blocks of reward after 5 blocks
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 10);
    await mineBlock(ethers.provider);
    await assertStakerRewardEqual(
      poolAId,
      alice.address,
      expandTo18Decimals(500)
    );

    // Emergency unstake will unstake all amount
    await expect(stakingPools.connect(alice).emergencyUnstake(poolAId))
      .to.emit(tokenA, "Transfer")
      .withArgs(
        stakingPools.address, // from
        alice.address, // to
        expandTo18Decimals(1) // amount
      );
    // Alice lose all reward if she emergency unstake
    await assertStakerRewardEqual(
      poolAId,
      alice.address,
      expandTo18Decimals(0)
    );
    expect(
      (await stakingPools.userData(poolAId, alice.address)).stakeAmount
    ).to.equal(0);
    expect(await tokenA.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(1000)
    );
  });

  it("no rewards if user has no acc reward", async function () {
    // Alice stakes 5 blocks after start
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 5);
    await stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1));

    // Alice emergency unstake after 1 block
    await mineBlock(ethers.provider);
    await stakingPools.connect(alice).emergencyUnstake(poolAId);

    // The immediate reward amount is zero
    await assertStakerRewardEqual(poolAId, alice.address, BigNumber.from(0));
    // She cannot claim any reward because she does not have any acc reward
    await expect(
      stakingPools.connect(alice).redeemRewards(poolAId)
    ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");
  });

  it("user can redeem reward if user has acc reward", async function () {
    // Alice stakes 5 blocks after start
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 5);
    await stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1));

    // The immediate reward amount is zero
    await assertStakerRewardEqual(poolAId, alice.address, BigNumber.from(0));
    // After 5 block, Alice should have 500 reward
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 10);
    await mineBlock(ethers.provider);
    await assertStakerRewardEqual(
      poolAId,
      alice.address,
      expandTo18Decimals(500)
    );

    // Alice can claim 600 reward bcos an additional block is minned
    await expect(stakingPools.connect(alice).redeemRewards(poolAId))
      .to.emit(stakingPools, "RewardRedeemed")
      .withArgs(
        poolAId, // poolId
        alice.address, // staker
        rewarder.address, // rewarder address
        expandTo18Decimals(150) // amount
      );
    // No acc reward after claiming reward
    await assertStakerRewardEqual(poolAId, alice.address, BigNumber.from(0));
  });

  it("cannot help user redeem reward if user has no acc reward", async function () {
    // Alice stakes 5 blocks after start
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 5);
    await stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1));

    // Alice emergency unstake after 1 block
    await mineBlock(ethers.provider);
    await stakingPools.connect(alice).emergencyUnstake(poolAId);

    // The immediate reward amount is zero
    await assertStakerRewardEqual(poolAId, alice.address, BigNumber.from(0));
    // She cannot claim any reward because she does not have any acc reward
    await expect(
      stakingPools.connect(bob).redeemRewardsByAddress(poolAId, alice.address)
    ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");
  });

  it("help user redeem reward if user has acc reward", async function () {
    // Alice stakes 5 blocks after start
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 5);
    await stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1));

    // The immediate reward amount is zero
    await assertStakerRewardEqual(poolAId, alice.address, BigNumber.from(0));
    // After 5 block, Alice should have 500 reward
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 10);
    await mineBlock(ethers.provider);
    await assertStakerRewardEqual(
      poolAId,
      alice.address,
      expandTo18Decimals(500)
    );

    // Alice can claim 600 reward bcos an additional block is minned
    await expect(
      stakingPools.connect(bob).redeemRewardsByAddress(poolAId, alice.address)
    )
      .to.emit(stakingPools, "RewardRedeemed")
      .withArgs(
        poolAId, // poolId
        alice.address, // staker
        rewarder.address, // rewarder address
        expandTo18Decimals(150) // amount
      );
    // No acc reward after claiming reward
    await assertStakerRewardEqual(poolAId, alice.address, BigNumber.from(0));
  });

  it("owner can update reward rate", async function () {
    // Alice stakes 5 blocks after start
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 5);
    await stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1));

    // Alice should have 100 reward after 1 block
    await mineBlock(ethers.provider);
    await assertStakerRewardEqual(
      poolAId,
      alice.address,
      expandTo18Decimals(100)
    );
    // Owner update reward rate to 30
    await expect(
      stakingPools
        .connect(deployer)
        .setPoolReward(poolAId, expandTo18Decimals(30))
    )
      .to.emit(stakingPools, "PoolRewardRateChanged")
      .withArgs(
        poolAId, // poolId
        expandTo18Decimals(100), // currentRewardPerBlock
        expandTo18Decimals(30) // newRewardPerBlock
      );
    // Alice should have additional 130 reward after next block
    await mineBlock(ethers.provider);
    await assertStakerRewardEqual(
      poolAId,
      alice.address,
      expandTo18Decimals(230)
    );
    // Previous reward is settled
    expect((await stakingPools.poolData(poolAId)).accuRewardPerShare).to.equal(
      expandTo18Decimals(20000)
    );
  });

  it("only owner can update reward rate", async function () {
    await expect(
      stakingPools.connect(alice).setPoolReward(poolAId, expandTo18Decimals(30))
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("owner can update reward rate before pool start", async function () {
    //Set pool reward before start
    await expect(
      stakingPools
        .connect(deployer)
        .setPoolReward(poolAId, expandTo18Decimals(30))
    )
      .to.emit(stakingPools, "PoolRewardRateChanged")
      .withArgs(poolAId, expandTo18Decimals(100), expandTo18Decimals(30));

    // Alice stakes 5 blocks after start
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 5);
    await stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1));

    // Alice should have 30 reward after 1 block
    await mineBlock(ethers.provider);
    await assertStakerRewardEqual(
      poolAId,
      alice.address,
      expandTo18Decimals(30)
    );
    // Owner update reward rate to 100
    await expect(
      stakingPools
        .connect(deployer)
        .setPoolReward(poolAId, expandTo18Decimals(100))
    )
      .to.emit(stakingPools, "PoolRewardRateChanged")
      .withArgs(
        poolAId, // poolId
        expandTo18Decimals(30), // currentRewardPerBlock
        expandTo18Decimals(100) // newRewardPerBlock
      );
    // Alice should have additional 130 reward after next block
    await mineBlock(ethers.provider);
    await assertStakerRewardEqual(
      poolAId,
      alice.address,
      expandTo18Decimals(160)
    );
    // Previous reward is settled
    expect((await stakingPools.poolData(poolAId)).accuRewardPerShare).to.equal(
      expandTo18Decimals(6000)
    );
  });

  it("no more reward after the pool has ended", async function () {
    // Alice stakes 5 blocks after end
    await setNextBlockNumber(ethers.provider, poolAEndBlock - 5);
    await stakingPools.connect(alice).stake(poolAId, expandTo18Decimals(1));

    // The immediate reward amount is zero
    await assertStakerRewardEqual(poolAId, alice.address, BigNumber.from(0));

    // After 5 block, Alice should have 500 reward
    await setNextBlockNumber(ethers.provider, poolAEndBlock);
    await mineBlock(ethers.provider);
    await assertStakerRewardEqual(
      poolAId,
      alice.address,
      expandTo18Decimals(500)
    );

    // No additional rewards even more block is processed
    await setNextBlockNumber(ethers.provider, poolAEndBlock + 5);
    await assertStakerRewardEqual(
      poolAId,
      alice.address,
      expandTo18Decimals(500)
    );

    // Alice can claim 500 reward bcos an additional block is minned
    await expect(stakingPools.connect(alice).redeemRewards(poolAId))
      .to.emit(stakingPools, "RewardRedeemed")
      .withArgs(
        poolAId, // poolId
        alice.address, // staker
        rewarder.address, // rewarder address
        expandTo18Decimals(125) // amount
      );
    // No acc reward after claiming reward
    await assertStakerRewardEqual(poolAId, alice.address, BigNumber.from(0));
  });
});
