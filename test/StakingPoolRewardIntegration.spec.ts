import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers, upgrades } from "hardhat";
import { Duration } from "luxon";
import {
  duration,
  expandTo18Decimals,
  increase,
  uint256Max,
} from "./utilities";
import { mineBlock, setNextBlockNumber } from "./utilities/timeTravel";

describe("StakingPoolRewardIntegration", function () {
  let deployer: SignerWithAddress,
    bob: SignerWithAddress,
    charlie: SignerWithAddress,
    rewardDispatcher: SignerWithAddress,
    optionContract: SignerWithAddress;

  let stakingPools: Contract,
    stakeToken: Contract,
    rewarder: Contract,
    rewardToken: Contract;

  const poolId: number = 1;
  let poolAStartBlock: number,
    poolAEndBlock: number,
    poolAMigrationBlock: number;

  beforeEach(async function () {
    [deployer, bob, charlie, rewardDispatcher, optionContract] =
      await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock", deployer);
    const StakingPoolRewarder = await ethers.getContractFactory(
      "StakingPoolRewarder"
    );
    const StakingPools = await ethers.getContractFactory("StakingPools");

    rewardToken = await ERC20Mock.deploy(
      "Reward Token",
      "RT",
      expandTo18Decimals(100000)
    );
    await rewardToken.deployed();

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

    await stakingPools.connect(deployer).setRewarder(rewarder.address);

    stakeToken = await ERC20Mock.deploy(
      "Stake Token",
      "LP",
      expandTo18Decimals(100000)
    );
    await stakeToken.deployed();

    // Everyone gets 1000 of both tokens
    for (const user of [bob, charlie]) {
      await stakeToken.connect(deployer).transfer(
        user.address, // recipient
        expandTo18Decimals(10_000) // amount
      );
      await stakeToken.connect(user).approve(
        stakingPools.address, // spender
        uint256Max // amount
      );
    }

    const currentBlockNumber: number = await ethers.provider.getBlockNumber();
    poolAStartBlock = currentBlockNumber + 10;
    poolAEndBlock = currentBlockNumber + 30;
    poolAMigrationBlock = currentBlockNumber + 20;

    // Create pool: 20 blocks with 100 reward per block
    await stakingPools.connect(deployer).createPool(
      stakeToken.address, // token
      optionContract.address,
      poolAStartBlock, // startBlock
      poolAEndBlock, // endBlock
      expandTo18Decimals(100) // rewardPerBlock
    );
  });

  it("user is able to claim vested reward after unstake all", async function () {
    // Alice stakes 5 blocks after start
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 5);
    await stakingPools.connect(bob).stake(poolId, expandTo18Decimals(1));
    // Should earn 5 blocks of reward after 5 blocks
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 10);
    await stakingPools.connect(bob).unstake(poolId, expandTo18Decimals(1));
    await mineBlock(ethers.provider);
    expect(await stakingPools.getReward(poolId, bob.address)).to.equal(
      expandTo18Decimals(500)
    );
    await rewardToken
      .connect(deployer)
      .transfer(rewardDispatcher.address, expandTo18Decimals(500), {
        from: deployer.address,
      });
    await rewardToken
      .connect(rewardDispatcher)
      .approve(rewarder.address, expandTo18Decimals(500), {
        from: rewardDispatcher.address,
      });
    await expect(stakingPools.connect(bob).redeemRewards(poolId))
      .to.emit(stakingPools, "RewardRedeemed")
      .withArgs(
        poolId, // poolId
        bob.address, // staker
        rewarder.address, // rewarder address
        expandTo18Decimals(125) // amount
      )
      .to.emit(rewarder, "TokenVested")
      .withArgs(
        bob.address,
        poolId, // poolId
        expandTo18Decimals(125) // vested amount (500 * 25%)
      );
    expect(await rewardToken.balanceOf(bob.address)).to.equal(
      expandTo18Decimals(125)
    );
    expect(await rewarder.calculateWithdrawableReward(bob.address, 1)).to.equal(
      "0"
    );
    await expect(stakingPools.connect(bob).redeemRewards(1)).to.be.revertedWith(
      "StakingPoolRewarder: claimable amount is 0"
    );
    const bobRewardPerWeek = "14423076923076923076";
    for (let i = 0; i < 25; i++) {
      await increase(duration.days(7));
      await stakingPools.connect(bob).redeemRewards(1);
      expect(await rewardToken.balanceOf(bob.address)).to.equal(
        expandTo18Decimals(125).add(BigNumber.from(bobRewardPerWeek).mul(i + 1))
      );
      await expect(
        stakingPools.connect(bob).redeemRewards(1)
      ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");
    }
    // final week
    await increase(duration.days(7));
    await stakingPools.connect(bob).redeemRewards(1);
    await expect(stakingPools.connect(bob).redeemRewards(1)).to.be.revertedWith(
      "StakingPoolRewarder: claimable amount is 0"
    );
    await increase(duration.days(7));
    expect(await rewardToken.balanceOf(bob.address)).to.equal(
      expandTo18Decimals(500)
    );
  });

  it("user stake and reward integration test (stake -> unstake -> redeem)", async function () {
    // Bob stake at pool start block
    await setNextBlockNumber(ethers.provider, poolAStartBlock);
    await stakingPools.connect(bob).stake(poolId, expandTo18Decimals(1));

    // Bob unstake after 5 blocks
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 5);
    await increase(duration.days(14));
    await stakingPools.connect(bob).unstake(poolId, expandTo18Decimals(1));
    expect(await stakingPools.getReward(poolId, bob.address)).to.equal(
      expandTo18Decimals(600)
    );

    await rewardToken
      .connect(deployer)
      .transfer(rewardDispatcher.address, expandTo18Decimals(600), {
        from: deployer.address,
      });
    await rewardToken
      .connect(rewardDispatcher)
      .approve(rewarder.address, expandTo18Decimals(600), {
        from: rewardDispatcher.address,
      });

    // Vest amount: 600 x 75% = 450
    // Each step: 450 / 26 = ~17.31
    // Redeem amount: 600 x 25% + 17.31 + 17.31 = ~184.62

    await expect(stakingPools.connect(bob).redeemRewards(poolId))
      .to.emit(stakingPools, "RewardRedeemed")
      .withArgs(
        poolId, // poolId
        bob.address, // staker
        rewarder.address, // rewarder address
        "184615384615384615384" // amount
      )
      .to.emit(rewarder, "TokenVested")
      .withArgs(
        bob.address,
        poolId, // poolId
        "184615384615384615384"
      );

    expect(await rewardToken.balanceOf(bob.address)).to.equal(
      "184615384615384615384"
    );
    expect(await rewarder.calculateWithdrawableReward(bob.address, 1)).to.equal(
      "0"
    );

    const bobRewardPerWeek = "17307692307692307692";

    for (let i = 2; i < 25; i++) {
      await increase(duration.days(7));
      await stakingPools.connect(bob).redeemRewards(1);

      expect(await rewardToken.balanceOf(bob.address)).to.equal(
        expandTo18Decimals(150).add(BigNumber.from(bobRewardPerWeek).mul(i + 1))
      );

      await expect(
        stakingPools.connect(bob).redeemRewards(1)
      ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");
    }

    // final week
    await increase(duration.days(7));
    await stakingPools.connect(bob).redeemRewards(1);

    await expect(stakingPools.connect(bob).redeemRewards(1)).to.be.revertedWith(
      "StakingPoolRewarder: claimable amount is 0"
    );

    await increase(duration.days(7));
    expect(await rewardToken.balanceOf(bob.address)).to.equal(
      expandTo18Decimals(600)
    );
  });

  it("user stake and reward integration test (stake -> stake -> unstake -> redeem)", async function () {
    // Bob and Charlie stake at pool start block, so both of them will share the reward
    await setNextBlockNumber(ethers.provider, poolAStartBlock);
    await stakingPools.connect(charlie).stake(poolId, expandTo18Decimals(1));
    const bobFirstStakeTxn = await stakingPools
      .connect(bob)
      .stake(poolId, expandTo18Decimals(1));
    const bobFirstStakeBlock = bobFirstStakeTxn.blockNumber;

    // Bob stake again after 5 blocks
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 5);
    await increase(duration.days(14));
    const bobSecondStakeTxn = await stakingPools
      .connect(bob)
      .stake(poolId, expandTo18Decimals(2));
    const bobSecondStakeBlock = bobSecondStakeTxn.blockNumber;
    const rewardUptoBobSecondStakeBlock: BigNumber = expandTo18Decimals(
      bobSecondStakeBlock - bobFirstStakeBlock
    ).mul(BigNumber.from(50));
    const weeklyUnvestForFirstStakeReward: BigNumber =
      rewardUptoBobSecondStakeBlock
        .mul(BigNumber.from(75))
        .div(BigNumber.from(100))
        .div(BigNumber.from(26));

    await setNextBlockNumber(ethers.provider, poolAStartBlock + 10);
    await increase(duration.days(14));
    const bobUnstakeTxn = await stakingPools
      .connect(bob)
      .unstake(poolId, expandTo18Decimals(3));
    const bobUnstakeBlock = bobUnstakeTxn.blockNumber;
    const rewardUptoBobUnstakeBlock: BigNumber = expandTo18Decimals(
      bobUnstakeBlock - bobSecondStakeBlock
    ).mul(BigNumber.from(75));
    const weeklyUnvestForSecondStakeReward = rewardUptoBobUnstakeBlock
      .mul(BigNumber.from(75))
      .div(BigNumber.from(100))
      .sub(weeklyUnvestForFirstStakeReward.mul(BigNumber.from(2)))
      .add(
        rewardUptoBobSecondStakeBlock
          .mul(BigNumber.from(75))
          .div(BigNumber.from(100))
      )
      .div(BigNumber.from(26));

    expect(await stakingPools.getReward(poolId, bob.address)).to.equal(
      rewardUptoBobUnstakeBlock
    );
    const totalReward = rewardUptoBobSecondStakeBlock.add(
      rewardUptoBobUnstakeBlock
    );

    await rewardToken
      .connect(deployer)
      .transfer(rewardDispatcher.address, totalReward, {
        from: deployer.address,
      });
    await rewardToken
      .connect(rewardDispatcher)
      .approve(rewarder.address, totalReward, {
        from: rewardDispatcher.address,
      });

    await stakingPools.connect(bob).redeemRewards(1);

    let redeemableReward = rewardUptoBobSecondStakeBlock
      .mul(BigNumber.from(25))
      .div(BigNumber.from(100))
      .add(weeklyUnvestForFirstStakeReward.mul(BigNumber.from(2)))
      .add(
        rewardUptoBobUnstakeBlock
          .mul(BigNumber.from(25))
          .div(BigNumber.from(100))
      )
      .add(weeklyUnvestForSecondStakeReward.mul(BigNumber.from(2)));
    expect(await rewardToken.balanceOf(bob.address)).to.equal(redeemableReward);

    for (let i = 0; i < 23; i++) {
      await increase(duration.days(7));
      await stakingPools.connect(bob).redeemRewards(1);

      expect(await rewardToken.balanceOf(bob.address)).to.equal(
        redeemableReward.add(weeklyUnvestForSecondStakeReward.mul(i + 1))
      );

      await expect(
        stakingPools.connect(bob).redeemRewards(1)
      ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");
    }

    // final week
    await increase(duration.days(7));
    await stakingPools.connect(bob).redeemRewards(1);

    await expect(stakingPools.connect(bob).redeemRewards(1)).to.be.revertedWith(
      "StakingPoolRewarder: claimable amount is 0"
    );

    await increase(duration.days(7));
    expect(await rewardToken.balanceOf(bob.address)).to.equal(totalReward);
  });

  it("user can stake after admin has updated the vesting setting", async function () {
    // Bob stakes 5 blocks after start
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 5);
    await stakingPools.connect(bob).stake(poolId, expandTo18Decimals(1));
    await mineBlock(ethers.provider);

    // Bob further stake after 4 blocks
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 10);
    await stakingPools.connect(bob).stake(poolId, expandTo18Decimals(1));
    await mineBlock(ethers.provider);

    // Immediate unlock amount: 125
    // Locked amount: 375
    // Claimable amount per week: ~14.42
    expect(await rewarder.claimableAmounts(bob.address, poolId)).to.equal(
      expandTo18Decimals(125)
    );

    expect(
      await rewarder
        .connect(deployer)
        .updateVestingSetting(
          96,
          Duration.fromObject({ days: 28 }).as("seconds"),
          Duration.fromObject({ days: 1 }).as("seconds")
        )
    )
      .to.emit(rewarder, "VestingSettingChanged")
      .withArgs(
        96,
        Duration.fromObject({ days: 28 }).as("seconds"),
        Duration.fromObject({ days: 1 }).as("seconds")
      );

    // Bob further stake after 4 blocks, new vesting schedule shall follow the new settings
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 15);
    await stakingPools.connect(bob).stake(poolId, expandTo18Decimals(1));
    await mineBlock(ethers.provider);

    expect(await rewarder.claimableAmounts(bob.address, poolId)).to.equal(
      expandTo18Decimals(145)
    );

    // Bob unstake all after 4 blocks
    await setNextBlockNumber(ethers.provider, poolAStartBlock + 20);
    await stakingPools.connect(bob).unstake(poolId, expandTo18Decimals(3));
    await mineBlock(ethers.provider);

    await rewardToken
      .connect(deployer)
      .transfer(rewardDispatcher.address, "1499999999999999999999", {
        from: deployer.address,
      });
    await rewardToken
      .connect(rewardDispatcher)
      .approve(rewarder.address, "1499999999999999999999", {
        from: rewardDispatcher.address,
      });

    // Immediate unlock amount: 125 + 20 + 20 = 165
    // Locked amount: 375 + 480 + 480 = 1335
    // Claimable amount per day: ~47.68
    await expect(stakingPools.connect(bob).redeemRewards(poolId))
      .to.emit(stakingPools, "RewardRedeemed")
      .withArgs(
        poolId, // poolId
        bob.address, // staker
        rewarder.address, // rewarder address
        "165000000000000000095" // amount
      )
      .to.emit(rewarder, "TokenVested")
      .withArgs(
        bob.address,
        poolId, // poolId
        "20000000000000000095"
      );

    expect(await rewardToken.balanceOf(bob.address)).to.equal(
      "165000000000000000095"
    );

    expect(await rewarder.calculateWithdrawableReward(bob.address, 1)).to.equal(
      "0"
    );
    await expect(stakingPools.connect(bob).redeemRewards(1)).to.be.revertedWith(
      "StakingPoolRewarder: claimable amount is 0"
    );

    const bobRewardPerWeek = "47678571428571428568";

    for (let i = 0; i < 27; i++) {
      await increase(duration.days(1));
      await stakingPools.connect(bob).redeemRewards(1);

      expect(await rewardToken.balanceOf(bob.address)).to.equal(
        BigNumber.from("165000000000000000095").add(
          BigNumber.from(bobRewardPerWeek).mul(i + 1)
        )
      );

      await expect(
        stakingPools.connect(bob).redeemRewards(1)
      ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");
    }

    // final week
    await increase(duration.days(1));
    await stakingPools.connect(bob).redeemRewards(1);

    await expect(stakingPools.connect(bob).redeemRewards(1)).to.be.revertedWith(
      "StakingPoolRewarder: claimable amount is 0"
    );

    await increase(duration.days(1));
    expect(await rewardToken.balanceOf(bob.address)).to.equal(
      "1499999999999999999999"
    );
  });
});
