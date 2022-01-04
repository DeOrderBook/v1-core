import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers, upgrades } from "hardhat";
import { Duration } from "luxon";
import { duration, expandTo18Decimals, increase, latest } from "./utilities";

describe("StakingPoolRewarder", function () {
  before(async function () {
    const signers = await ethers.getSigners();
    this.deployer = signers[0];
    this.bob = signers[1];
    this.charlie = signers[2];
    this.minter = signers[3];
    this.stakingPools = signers[4];
    this.rewardDispatcher = signers[5];
    this.rewardDispatcher2 = signers[6];
    this.StakingPoolRewarder = await ethers.getContractFactory(
      "StakingPoolRewarder"
    );
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter);
  });

  beforeEach(async function () {
    this.rewardToken = await this.ERC20Mock.deploy(
      "Reward Token",
      "RT",
      expandTo18Decimals(100000)
    );
    await this.rewardToken.deployed();

    this.rewarder = await upgrades.deployProxy(
      this.StakingPoolRewarder,
      [
        this.stakingPools.address,
        this.rewardToken.address,
        this.rewardDispatcher.address,
        75,
        Duration.fromObject({ weeks: 26 }).as("seconds"),
        Duration.fromObject({ weeks: 1 }).as("seconds"),
      ],
      { initializer: "__StakingPoolRewarder_init" }
    );
    await this.rewarder.deployed();
  });

  it("Rewarder only can call by stakingPool", async function () {
    await expect(
      this.rewarder.connect(this.bob).onReward(1, this.bob.address, 10000, 1)
    ).to.be.revertedWith("StakingPoolRewarder: only stakingPool can call");
  });

  it("Withdrawable amount is correct when time moving forward", async function () {
    await this.rewardToken
      .connect(this.minter)
      .transfer(this.rewardDispatcher.address, expandTo18Decimals(30000), {
        from: this.minter.address,
      });
    await this.rewardToken
      .connect(this.rewardDispatcher)
      .approve(this.rewarder.address, expandTo18Decimals(30000), {
        from: this.rewardDispatcher.address,
      });

    let entryTime = await latest();
    // Bob: First time stakingPools redeemReward:
    // amount: 100000
    // 25% claimable: 2500
    // 75% vesting: 7500
    // claimable per week: 7500/26 =~ 288 (6 months is 26 weeks)
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(10000), entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);

    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(2500)
    );

    // Charlie: First time stakingPools  redeemReward:
    // amount: 200000
    // 25% claimable: 5000
    // 75% vesting: 15000
    // claimable per week: 15000/26 =~ 576 (6 months is 26 weeks)
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.charlie.address, expandTo18Decimals(20000), entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.charlie.address);
    expect(await this.rewardToken.balanceOf(this.charlie.address)).to.equal(
      expandTo18Decimals(5000)
    );

    for (let i = 0; i <= 200; i++) {
      if (i >= 0 && i < 7) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("0");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("0");
      }
      if (i >= 7 && i < 14) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("288461538461538461538");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("576923076923076923076");
      }
      if (i >= 14 && i < 21) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("576923076923076923076");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("1153846153846153846152");
      }
      if (i >= 21 && i < 28) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("865384615384615384614");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("1730769230769230769228");
      }
      if (i >= 28 && i < 35) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("1153846153846153846152");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("2307692307692307692304");
      }
      if (i >= 35 && i < 42) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("1442307692307692307690");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("2884615384615384615380");
      }
      if (i >= 42 && i < 49) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("1730769230769230769228");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("3461538461538461538456");
      }
      if (i >= 49 && i < 56) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("2019230769230769230766");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("4038461538461538461532");
      }
      if (i >= 56 && i < 63) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("2307692307692307692304");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("4615384615384615384608");
      }
      if (i >= 63 && i < 70) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("2596153846153846153842");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("5192307692307692307684");
      }
      if (i >= 70 && i < 77) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("2884615384615384615380");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("5769230769230769230760");
      }
      if (i >= 77 && i < 84) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("3173076923076923076918");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("6346153846153846153836");
      }
      if (i >= 84 && i < 91) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("3461538461538461538456");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("6923076923076923076912");
      }
      if (i >= 91 && i < 98) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("3749999999999999999994");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("7499999999999999999988");
      }
      if (i >= 98 && i < 105) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("4038461538461538461532");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("8076923076923076923064");
      }
      if (i >= 105 && i < 112) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("4326923076923076923070");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("8653846153846153846140");
      }
      if (i >= 112 && i < 119) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("4615384615384615384608");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("9230769230769230769216");
      }
      if (i >= 119 && i < 126) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("4903846153846153846146");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("9807692307692307692292");
      }
      if (i >= 126 && i < 133) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("5192307692307692307684");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("10384615384615384615368");
      }
      if (i >= 133 && i < 140) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("5480769230769230769222");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("10961538461538461538444");
      }
      if (i >= 140 && i < 147) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("5769230769230769230760");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("11538461538461538461520");
      }
      if (i >= 147 && i < 154) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("6057692307692307692298");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("12115384615384615384596");
      }
      if (i >= 154 && i < 161) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("6346153846153846153836");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("12692307692307692307672");
      }
      if (i >= 161 && i < 168) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("6634615384615384615374");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("13269230769230769230748");
      }
      if (i >= 168 && i < 175) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("6923076923076923076912");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("13846153846153846153824");
      }
      if (i >= 175 && i < 182) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("7211538461538461538450");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("14423076923076923076900");
      }
      if (i >= 182) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal("7500000000000000000000");
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal("15000000000000000000000");
      }
      await increase(duration.days(1));
    }

    //claim it
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, 0, entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.charlie.address, 0, entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.charlie.address);

    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(10000)
    );
    expect(await this.rewardToken.balanceOf(this.charlie.address)).to.equal(
      expandTo18Decimals(20000)
    );

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, 0, entryTime);

    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.bob.address)
    ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.charlie.address, 0, entryTime);
    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.charlie.address)
    ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");
  });

  it("User can claim reward every week", async function () {
    await this.rewardToken
      .connect(this.minter)
      .transfer(this.rewardDispatcher.address, expandTo18Decimals(30000), {
        from: this.minter.address,
      });
    await this.rewardToken
      .connect(this.rewardDispatcher)
      .approve(this.rewarder.address, expandTo18Decimals(30000), {
        from: this.rewardDispatcher.address,
      });

    let entryTime = await latest();
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(10000), entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);

    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(2500)
    );

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.charlie.address, expandTo18Decimals(20000), entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.charlie.address);

    expect(await this.rewardToken.balanceOf(this.charlie.address)).to.equal(
      expandTo18Decimals(5000)
    );

    const bobRewardPerWeek = "288461538461538461538";
    const charlieRewardPerWeek = "576923076923076923076";

    // claim reward every week for 25 weeks
    for (let i = 0; i < 25; ++i) {
      await increase(duration.days(7));
      expect(
        await this.rewarder.calculateWithdrawableFromVesting(
          this.bob.address,
          1
        )
      ).to.equal(bobRewardPerWeek);
      expect(
        await this.rewarder.calculateWithdrawableFromVesting(
          this.charlie.address,
          1
        )
      ).to.equal(charlieRewardPerWeek);
      await this.rewarder
        .connect(this.stakingPools)
        .onReward(1, this.bob.address, 0, entryTime);
      await this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.bob.address);
      await this.rewarder
        .connect(this.stakingPools)
        .onReward(1, this.charlie.address, 0, entryTime);
      await this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.charlie.address);

      expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
        expandTo18Decimals(2500).add(
          BigNumber.from(bobRewardPerWeek).mul(i + 1)
        )
      );

      expect(await this.rewardToken.balanceOf(this.charlie.address)).to.equal(
        expandTo18Decimals(5000).add(
          BigNumber.from(charlieRewardPerWeek).mul(i + 1)
        )
      );

      await this.rewarder
        .connect(this.stakingPools)
        .onReward(1, this.bob.address, 0, entryTime);
      await expect(
        this.rewarder
          .connect(this.stakingPools)
          .claimVestedReward(1, this.bob.address)
      ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");

      await this.rewarder
        .connect(this.stakingPools)
        .onReward(1, this.charlie.address, 0, entryTime);
      await expect(
        this.rewarder
          .connect(this.stakingPools)
          .claimVestedReward(1, this.charlie.address)
      ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");
    }

    // final week
    await increase(duration.days(7));
    expect(
      await this.rewarder.calculateWithdrawableFromVesting(this.bob.address, 1)
    ).to.equal("288461538461538461550");
    expect(
      await this.rewarder.calculateWithdrawableFromVesting(
        this.charlie.address,
        1
      )
    ).to.equal("576923076923076923100");
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, 0, entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.charlie.address, 0, entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.charlie.address);

    await increase(duration.days(7));

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, 0, latest());
    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.bob.address)
    ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.charlie.address, 0, latest());
    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.charlie.address)
    ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");

    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(10000)
    );
    expect(await this.rewardToken.balanceOf(this.charlie.address)).to.equal(
      expandTo18Decimals(20000)
    );
  });

  it("User claim reward again when he still has vesting amount", async function () {
    await this.rewardToken
      .connect(this.minter)
      .transfer(this.rewardDispatcher.address, expandTo18Decimals(30000), {
        from: this.minter.address,
      });
    await this.rewardToken
      .connect(this.rewardDispatcher)
      .approve(this.rewarder.address, expandTo18Decimals(30000), {
        from: this.rewardDispatcher.address,
      });

    // 2500 claimed, 7500 vesting
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(10000), latest());
    expect(await this.rewarder.claimableAmounts(this.bob.address, 1)).to.equal(
      expandTo18Decimals(2500)
    );
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(2500)
    );

    // 5000 more claimed, 15000 more vesting
    await increase(duration.days(3));
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(20000), latest());
    expect(await this.rewarder.claimableAmounts(this.bob.address, 1)).to.equal(
      expandTo18Decimals(5000)
    );
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(7500)
    );

    // New vesting schedule:
    // amount = 7500 + 15000 = 22500
    // new start time = current time
    // new end time = current time + 26 weeks
    // per week =~ 22500/26 = 865

    const perWeek = BigNumber.from("865384615384615384615");

    for (let i = 0; i <= 181; i++) {
      let week = Math.floor(i / 7);
      expect(
        await this.rewarder.calculateWithdrawableFromVesting(
          this.bob.address,
          1
        )
      ).to.equal(perWeek.mul(week));
      await increase(duration.days(1));
    }

    //After last week = total
    expect(
      await this.rewarder.calculateWithdrawableFromVesting(this.bob.address, 1)
    ).to.equal(expandTo18Decimals(22500));

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(0), latest());
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(30000)
    );
  });

  it("User claim reward equal to last vested amount plus current claimable amount", async function () {
    await this.rewardToken
      .connect(this.minter)
      .transfer(this.rewardDispatcher.address, expandTo18Decimals(30000), {
        from: this.minter.address,
      });
    await this.rewardToken
      .connect(this.rewardDispatcher)
      .approve(this.rewarder.address, expandTo18Decimals(30000), {
        from: this.rewardDispatcher.address,
      });

    // 2500 claimed, 7500 vesting
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(10000), latest());
    expect(await this.rewarder.claimableAmounts(this.bob.address, 1)).to.equal(
      expandTo18Decimals(2500)
    );
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(2500)
    );

    // last vesting: ~288 claimable
    // this reward: 5000 more claimed, 15000 more vesting
    // Total claimed this time = 5288 more
    await increase(duration.days(7));
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(20000), latest());
    expect(await this.rewarder.claimableAmounts(this.bob.address, 1)).to.equal(
      "5288461538461538461538"
    );
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      "7788461538461538461538"
    ); // 5288 + 2500

    // New vesting schedule:
    // amount = 7500 - 288 + 15000 =~ 22212
    // per week =~ 22212 / 26 = 854
    // new start time = entry time
    // new end time = entry time + 26 weeks

    const perWeek = BigNumber.from("854289940828402366863");
    for (let i = 0; i <= 181; i++) {
      let week = Math.floor(i / 7);
      expect(
        await this.rewarder.calculateWithdrawableFromVesting(
          this.bob.address,
          1
        )
      ).to.equal(perWeek.mul(week));
      await increase(duration.days(1));
    }

    //After last week = total
    expect(
      await this.rewarder.calculateWithdrawableFromVesting(this.bob.address, 1)
    ).to.equal("22211538461538461538462");

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, "0", latest());
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(30000)
    );
  });

  it("User claim reward equal to last vested amount plus current claimable amount three times", async function () {
    await this.rewardToken
      .connect(this.minter)
      .transfer(this.rewardDispatcher.address, expandTo18Decimals(60000), {
        from: this.minter.address,
      });
    await this.rewardToken
      .connect(this.rewardDispatcher)
      .approve(this.rewarder.address, expandTo18Decimals(60000), {
        from: this.rewardDispatcher.address,
      });

    // 2500 claimed, 7500 vesting
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(10000), latest());
    expect(await this.rewarder.claimableAmounts(this.bob.address, 1)).to.equal(
      expandTo18Decimals(2500)
    );
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(2500)
    );

    // last vesting: ~288 claimable
    // this reward: 5000 more claimed, 15000 more vesting
    // Total claimed this time = 5288 more

    // New vesting schedule:
    // amount = 7500 - 288 + 15000 =~ 22212
    // per week =~ 22212 / 26 = 854
    // new start time = current time
    // new end time = current time + 26 weeks
    await increase(duration.days(7));
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(20000), latest());
    expect(await this.rewarder.claimableAmounts(this.bob.address, 1)).to.equal(
      "5288461538461538461538"
    );
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      "7788461538461538461538"
    ); // 5288 + 2500

    // last vesting: ~854 claimable
    // this reward: 7500 more claimed, 22500 more vesting
    // Total claimed this time = 7500 + 854 more
    await increase(duration.days(7));
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(30000), latest());
    expect(await this.rewarder.claimableAmounts(this.bob.address, 1)).to.equal(
      "8354289940828402366863"
    );
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      "16142751479289940828401"
    ); // 5288 + 2500 + 7500 + 854

    // New vesting schedule:
    // amount = (7500 - 288) + (15000 - 854) + 22500 =~ 43858
    // per week =~ 43858 / 26 = 1686
    // new start time = current time
    // new end time = current time + 26 weeks

    const perWeek = BigNumber.from("1686817250796540737369");

    //two weeks vested
    for (let i = 0; i <= 181; i++) {
      let week = Math.floor(i / 7);
      expect(
        await this.rewarder.calculateWithdrawableFromVesting(
          this.bob.address,
          1
        )
      ).to.equal(perWeek.mul(week));
      await increase(duration.days(1));
    }

    //After last week = total
    expect(
      await this.rewarder.calculateWithdrawableFromVesting(this.bob.address, 1)
    ).to.equal("43857248520710059171599");

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, "0", latest());
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(60000)
    );
  });

  it("Cannot distribute when reward amount is zero and there is no vesting", async function () {
    let entryTime = await latest();
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, "0", entryTime);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal("0");
  });

  it("Cannot distribute when reward amount is zero, and there is no vested amount", async function () {
    await this.rewardToken
      .connect(this.minter)
      .transfer(this.rewardDispatcher.address, expandTo18Decimals(10000), {
        from: this.minter.address,
      });
    await this.rewardToken
      .connect(this.rewardDispatcher)
      .approve(this.rewarder.address, expandTo18Decimals(10000), {
        from: this.rewardDispatcher.address,
      });

    // 2500 claimed, 7500 vesting
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(10000), latest());
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(2500)
    );

    await increase(duration.days(6)); // haven't reached 7 days yet
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, "0", latest());
    expect(await this.rewarder.claimableAmounts(this.bob.address, 1)).to.equal(
      "0"
    );
    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.bob.address)
    ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");

    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(2500)
    );
  });

  it("Cannot distribute when not enough amount is approved from token dispatcher for initial claim", async function () {
    await this.rewardToken
      .connect(this.minter)
      .transfer(this.rewardDispatcher.address, expandTo18Decimals(30000), {
        from: this.minter.address,
      });
    await this.rewardToken
      .connect(this.rewardDispatcher)
      .approve(this.rewarder.address, expandTo18Decimals(30000), {
        from: this.rewardDispatcher.address,
      });

    let entryTime = await latest();
    //try to claim 120001 * 0.25 = 30001 rounding up
    this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(120001), entryTime);
    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.bob.address)
    ).to.be.revertedWith("TransferHelper: TRANSFER_FROM_FAILED");
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal("0");
  });

  it("96% vesting: Withdrawable amount is correct when time moving forward", async function () {
    this.rewarder = await upgrades.deployProxy(
      this.StakingPoolRewarder,
      [
        this.stakingPools.address,
        this.rewardToken.address,
        this.rewardDispatcher.address,
        96,
        Duration.fromObject({ weeks: 26 }).as("seconds"),
        Duration.fromObject({ weeks: 1 }).as("seconds"),
      ],
      { initializer: "__StakingPoolRewarder_init" }
    );
    await this.rewarder.deployed();

    await this.rewardToken
      .connect(this.minter)
      .transfer(this.rewardDispatcher.address, expandTo18Decimals(30000), {
        from: this.minter.address,
      });
    await this.rewardToken
      .connect(this.rewardDispatcher)
      .approve(this.rewarder.address, expandTo18Decimals(30000), {
        from: this.rewardDispatcher.address,
      });

    let entryTime = await latest();
    // Bob: First time stakingPools redeemReward:
    // amount: 10000
    // 4% claimable: 400
    // 96% vesting: 9600
    // claimable per week: 9600/26 =~ 369 (6 months is 26 weeks)
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(10000), entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(400)
    );

    // Charlie: First time stakingPools  redeemReward:
    // amount: 20000
    // 25% claimable: 800
    // 75% vesting: 19200
    // claimable per week: 19200/26 =~ 738 (6 months is 26 weeks)
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.charlie.address, expandTo18Decimals(20000), entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.charlie.address);
    expect(await this.rewardToken.balanceOf(this.charlie.address)).to.equal(
      expandTo18Decimals(800)
    );

    const bobRewardPerWeek = "369230769230769230769";
    const charlieRewardPerWeek = "738461538461538461538";
    for (let i = 0; i <= 200; i++) {
      let week = Math.floor(i / 7);
      if (week < 26) {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal(BigNumber.from(bobRewardPerWeek).mul(week));
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal(BigNumber.from(charlieRewardPerWeek).mul(week));
      } else {
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.bob.address,
            1
          )
        ).to.equal(expandTo18Decimals(9600));
        expect(
          await this.rewarder.calculateWithdrawableFromVesting(
            this.charlie.address,
            1
          )
        ).to.equal(expandTo18Decimals(19200));
      }

      await increase(duration.days(1));
    }

    //claim it
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, 0, entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.charlie.address, 0, entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.charlie.address);

    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(10000)
    );
    expect(await this.rewardToken.balanceOf(this.charlie.address)).to.equal(
      expandTo18Decimals(20000)
    );

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, "0", entryTime);
    expect(await this.rewarder.claimableAmounts(this.bob.address, 1)).to.equal(
      "0"
    );
    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.bob.address)
    ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.charlie.address, "0", entryTime);
    expect(
      await this.rewarder.claimableAmounts(this.charlie.address, 1)
    ).to.equal("0");
    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.charlie.address)
    ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");
  });

  it("96%: User can claim reward every week", async function () {
    this.rewarder = await upgrades.deployProxy(
      this.StakingPoolRewarder,
      [
        this.stakingPools.address,
        this.rewardToken.address,
        this.rewardDispatcher.address,
        96,
        Duration.fromObject({ weeks: 26 }).as("seconds"),
        Duration.fromObject({ weeks: 1 }).as("seconds"),
      ],
      { initializer: "__StakingPoolRewarder_init" }
    );
    await this.rewarder.deployed();
    await this.rewardToken
      .connect(this.minter)
      .transfer(this.rewardDispatcher.address, expandTo18Decimals(30000), {
        from: this.minter.address,
      });
    await this.rewardToken
      .connect(this.rewardDispatcher)
      .approve(this.rewarder.address, expandTo18Decimals(30000), {
        from: this.rewardDispatcher.address,
      });

    let entryTime = await latest();
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(10000), entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(400)
    );

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.charlie.address, expandTo18Decimals(20000), entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.charlie.address);
    expect(await this.rewardToken.balanceOf(this.charlie.address)).to.equal(
      expandTo18Decimals(800)
    );

    const bobRewardPerWeek = "369230769230769230769";
    const charlieRewardPerWeek = "738461538461538461538";

    // claim reward every week for 25 weeks
    for (let i = 0; i < 25; ++i) {
      await increase(duration.days(7));
      expect(
        await this.rewarder.calculateWithdrawableFromVesting(
          this.bob.address,
          1
        )
      ).to.equal(bobRewardPerWeek);
      expect(
        await this.rewarder.calculateWithdrawableFromVesting(
          this.charlie.address,
          1
        )
      ).to.equal(charlieRewardPerWeek);
      await this.rewarder
        .connect(this.stakingPools)
        .onReward(1, this.bob.address, 0, entryTime);
      await this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.bob.address);

      await this.rewarder
        .connect(this.stakingPools)
        .onReward(1, this.charlie.address, 0, entryTime);
      await this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.charlie.address);

      expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
        expandTo18Decimals(400).add(BigNumber.from(bobRewardPerWeek).mul(i + 1))
      );

      expect(await this.rewardToken.balanceOf(this.charlie.address)).to.equal(
        expandTo18Decimals(800).add(
          BigNumber.from(charlieRewardPerWeek).mul(i + 1)
        )
      );

      await this.rewarder
        .connect(this.stakingPools)
        .onReward(1, this.bob.address, "0", entryTime);
      expect(
        await this.rewarder.claimableAmounts(this.bob.address, 1)
      ).to.equal("0");
      await expect(
        this.rewarder
          .connect(this.stakingPools)
          .claimVestedReward(1, this.bob.address)
      ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");

      await this.rewarder
        .connect(this.stakingPools)
        .onReward(1, this.charlie.address, "0", entryTime);
      expect(
        await this.rewarder.claimableAmounts(this.charlie.address, 1)
      ).to.equal("0");
      await expect(
        this.rewarder
          .connect(this.stakingPools)
          .claimVestedReward(1, this.charlie.address)
      ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");
    }

    // final week
    await increase(duration.days(7));
    expect(
      await this.rewarder.calculateWithdrawableFromVesting(this.bob.address, 1)
    ).to.equal("369230769230769230775");
    expect(
      await this.rewarder.calculateWithdrawableFromVesting(
        this.charlie.address,
        1
      )
    ).to.equal("738461538461538461550");
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, 0, entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.charlie.address, 0, entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.charlie.address);

    await increase(duration.days(7));
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, "0", entryTime);
    expect(await this.rewarder.claimableAmounts(this.bob.address, 1)).to.equal(
      "0"
    );
    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.bob.address)
    ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.charlie.address, "0", entryTime);
    expect(
      await this.rewarder.claimableAmounts(this.charlie.address, 1)
    ).to.equal("0");
    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.charlie.address)
    ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");

    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(10000)
    );
    expect(await this.rewardToken.balanceOf(this.charlie.address)).to.equal(
      expandTo18Decimals(20000)
    );
  });

  it("TokenVested event will emit whenever user claim vested part of reward", async function () {
    await this.rewardToken
      .connect(this.minter)
      .transfer(this.rewardDispatcher.address, expandTo18Decimals(30000), {
        from: this.minter.address,
      });
    await this.rewardToken
      .connect(this.rewardDispatcher)
      .approve(this.rewarder.address, expandTo18Decimals(30000), {
        from: this.rewardDispatcher.address,
      });

    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .onReward(1, this.bob.address, expandTo18Decimals(10000), latest())
    )
      .to.emit(this.rewarder, "TokenVested")
      .withArgs(
        this.bob.address, // user
        1, // pool ID
        expandTo18Decimals(2500) // vestAmount
      );
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(2500)
    );

    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .onReward(1, this.charlie.address, expandTo18Decimals(20000), latest())
    )
      .to.emit(this.rewarder, "TokenVested")
      .withArgs(
        this.charlie.address, // user
        1, // pool ID
        expandTo18Decimals(5000) // vestAmount
      );
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.charlie.address);
    expect(await this.rewardToken.balanceOf(this.charlie.address)).to.equal(
      expandTo18Decimals(5000)
    );

    const bobRewardPerWeek = "288461538461538461538";
    const charlieRewardPerWeek = "576923076923076923076";

    // claim reward every week for 25 weeks
    for (let i = 0; i < 25; ++i) {
      await increase(duration.days(7));
      await expect(
        this.rewarder
          .connect(this.stakingPools)
          .onReward(1, this.bob.address, 0, latest())
      )
        .to.emit(this.rewarder, "TokenVested")
        .withArgs(
          this.bob.address, // user
          1, // pool ID
          bobRewardPerWeek // vestAmount
        );

      await expect(
        this.rewarder
          .connect(this.stakingPools)
          .onReward(1, this.charlie.address, 0, latest())
      )
        .to.emit(this.rewarder, "TokenVested")
        .withArgs(
          this.charlie.address, // user
          1, // pool ID
          charlieRewardPerWeek // vestAmount
        );
    }

    // final week
    await increase(duration.days(7));
    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .onReward(1, this.bob.address, 0, latest())
    )
      .to.emit(this.rewarder, "TokenVested")
      .withArgs(
        this.bob.address, // user
        1, // pool ID
        "288461538461538461550" // vestAmount
      );

    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .onReward(1, this.charlie.address, 0, latest())
    )
      .to.emit(this.rewarder, "TokenVested")
      .withArgs(
        this.charlie.address, // user
        1, // pool ID
        "576923076923076923100" // vestAmount
      );
  });

  it("Change vesting settings", async function () {
    await this.rewardToken
      .connect(this.minter)
      .transfer(this.rewardDispatcher.address, expandTo18Decimals(30000), {
        from: this.minter.address,
      });
    await this.rewardToken
      .connect(this.rewardDispatcher)
      .approve(this.rewarder.address, expandTo18Decimals(30000), {
        from: this.rewardDispatcher.address,
      });

    await expect(
      this.rewarder.updateVestingSetting(
        50,
        Duration.fromObject({ minutes: 30 }).as("seconds"),
        Duration.fromObject({ minutes: 2 }).as("seconds")
      )
    )
      .to.emit(this.rewarder, "VestingSettingChanged")
      .withArgs(
        50,
        Duration.fromObject({ minutes: 30 }).as("seconds"),
        Duration.fromObject({ minutes: 2 }).as("seconds")
      );

    let entryTime = await latest();
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(10000), entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(5000)
    );

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.charlie.address, expandTo18Decimals(20000), entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.charlie.address);
    expect(await this.rewardToken.balanceOf(this.charlie.address)).to.equal(
      expandTo18Decimals(10000)
    );

    const bobRewardPerWeek = "333333333333333333333";
    const charlieRewardPerWeek = "666666666666666666666";

    // claim reward every 2 minute for 28 minutes
    for (let i = 0; i < 14; ++i) {
      await increase(duration.minutes(2));

      expect(
        await this.rewarder.calculateWithdrawableFromVesting(
          this.bob.address,
          1
        )
      ).to.equal(bobRewardPerWeek);
      expect(
        await this.rewarder.calculateWithdrawableFromVesting(
          this.charlie.address,
          1
        )
      ).to.equal(charlieRewardPerWeek);

      await this.rewarder
        .connect(this.stakingPools)
        .onReward(1, this.bob.address, 0, latest());
      await this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.bob.address);

      await this.rewarder
        .connect(this.stakingPools)
        .onReward(1, this.charlie.address, 0, latest());
      await this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.charlie.address);

      expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
        expandTo18Decimals(5000).add(
          BigNumber.from(bobRewardPerWeek).mul(i + 1)
        )
      );

      expect(await this.rewardToken.balanceOf(this.charlie.address)).to.equal(
        expandTo18Decimals(10000).add(
          BigNumber.from(charlieRewardPerWeek).mul(i + 1)
        )
      );

      await this.rewarder
        .connect(this.stakingPools)
        .onReward(1, this.bob.address, "0", latest());
      expect(
        await this.rewarder.claimableAmounts(this.bob.address, 1)
      ).to.equal("0");
      await expect(
        this.rewarder
          .connect(this.stakingPools)
          .claimVestedReward(1, this.bob.address)
      ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");

      await this.rewarder
        .connect(this.stakingPools)
        .onReward(1, this.charlie.address, "0", latest());
      expect(
        await this.rewarder.claimableAmounts(this.charlie.address, 1)
      ).to.equal("0");
      await expect(
        this.rewarder
          .connect(this.stakingPools)
          .claimVestedReward(1, this.charlie.address)
      ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");
    }

    // final minute
    await increase(duration.minutes(1));
    expect(
      await this.rewarder.calculateWithdrawableFromVesting(this.bob.address, 1)
    ).to.equal("333333333333333333338");
    expect(
      await this.rewarder.calculateWithdrawableFromVesting(
        this.charlie.address,
        1
      )
    ).to.equal("666666666666666666676");
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, 0, entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.charlie.address, 0, entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.charlie.address);

    await increase(duration.minutes(1));
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, "0", entryTime);
    expect(await this.rewarder.claimableAmounts(this.bob.address, 1)).to.equal(
      "0"
    );
    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.bob.address)
    ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.charlie.address, "0", entryTime);
    expect(
      await this.rewarder.claimableAmounts(this.charlie.address, 1)
    ).to.equal("0");
    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.charlie.address)
    ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");

    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(10000)
    );
    expect(await this.rewardToken.balanceOf(this.charlie.address)).to.equal(
      expandTo18Decimals(20000)
    );
  });

  it("Vesting Schedule are independent on each pool", async function () {
    await this.rewardToken
      .connect(this.minter)
      .transfer(this.rewardDispatcher.address, expandTo18Decimals(30000), {
        from: this.minter.address,
      });
    await this.rewardToken
      .connect(this.rewardDispatcher)
      .approve(this.rewarder.address, expandTo18Decimals(30000), {
        from: this.rewardDispatcher.address,
      });

    let entryTime = await latest();

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(10000), entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(2500)
    );

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(2, this.charlie.address, expandTo18Decimals(20000), entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(2, this.charlie.address);
    expect(await this.rewardToken.balanceOf(this.charlie.address)).to.equal(
      expandTo18Decimals(5000)
    );

    const bobRewardPerWeek = "288461538461538461538";
    const charlieRewardPerWeek = "576923076923076923076";

    // claim reward every week for 25 weeks
    for (let i = 0; i < 25; ++i) {
      await increase(duration.days(7));

      //make sure the other pool unclaimed do not have any reward
      expect(
        await this.rewarder.calculateWithdrawableFromVesting(
          this.bob.address,
          2
        )
      ).to.equal(0);
      expect(
        await this.rewarder.calculateWithdrawableFromVesting(
          this.charlie.address,
          1
        )
      ).to.equal(0);

      expect(
        await this.rewarder.calculateWithdrawableFromVesting(
          this.bob.address,
          1
        )
      ).to.equal(bobRewardPerWeek);
      expect(
        await this.rewarder.calculateWithdrawableFromVesting(
          this.charlie.address,
          2
        )
      ).to.equal(charlieRewardPerWeek);
      await this.rewarder
        .connect(this.stakingPools)
        .onReward(1, this.bob.address, 0, entryTime);
      await this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.bob.address);
      await this.rewarder
        .connect(this.stakingPools)
        .onReward(2, this.charlie.address, 0, entryTime);
      await this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(2, this.charlie.address);

      expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
        expandTo18Decimals(2500).add(
          BigNumber.from(bobRewardPerWeek).mul(i + 1)
        )
      );

      expect(await this.rewardToken.balanceOf(this.charlie.address)).to.equal(
        expandTo18Decimals(5000).add(
          BigNumber.from(charlieRewardPerWeek).mul(i + 1)
        )
      );

      await this.rewarder
        .connect(this.stakingPools)
        .onReward(1, this.bob.address, "0", entryTime);
      expect(
        await this.rewarder.claimableAmounts(this.bob.address, 1)
      ).to.equal("0");
      await expect(
        this.rewarder
          .connect(this.stakingPools)
          .claimVestedReward(1, this.bob.address)
      ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");

      await this.rewarder
        .connect(this.stakingPools)
        .onReward(1, this.charlie.address, "0", entryTime);
      expect(
        await this.rewarder.claimableAmounts(this.charlie.address, 2)
      ).to.equal("0");
      await expect(
        this.rewarder
          .connect(this.stakingPools)
          .claimVestedReward(1, this.charlie.address)
      ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");
    }

    // final week
    await increase(duration.days(7));
    expect(
      await this.rewarder.calculateWithdrawableFromVesting(this.bob.address, 1)
    ).to.equal("288461538461538461550");
    expect(
      await this.rewarder.calculateWithdrawableFromVesting(
        this.charlie.address,
        2
      )
    ).to.equal("576923076923076923100");
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, 0, entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(2, this.charlie.address, 0, entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(2, this.charlie.address);

    await increase(duration.days(7));
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, "0", entryTime);
    expect(await this.rewarder.claimableAmounts(this.bob.address, 1)).to.equal(
      "0"
    );
    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.bob.address)
    ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.charlie.address, "0", entryTime);
    expect(
      await this.rewarder.claimableAmounts(this.charlie.address, 2)
    ).to.equal("0");
    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.charlie.address)
    ).to.be.revertedWith("StakingPoolRewarder: claimable amount is 0");

    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(10000)
    );
    expect(await this.rewardToken.balanceOf(this.charlie.address)).to.equal(
      expandTo18Decimals(20000)
    );
  });

  it("pool ID cannot be equal to 0", async function () {
    await this.rewardToken
      .connect(this.minter)
      .transfer(this.rewardDispatcher.address, expandTo18Decimals(10000), {
        from: this.minter.address,
      });
    await this.rewardToken
      .connect(this.rewardDispatcher)
      .approve(this.rewarder.address, expandTo18Decimals(10000), {
        from: this.rewardDispatcher.address,
      });

    let entryTime = await latest();
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(10000), entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(2500)
    );

    await increase(duration.days(7));
    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(0, this.bob.address)
    ).to.be.revertedWith("StakingPoolRewarder: poolId is 0");
  });

  it("Only owner can change schedule", async function () {
    await this.rewardToken
      .connect(this.minter)
      .transfer(this.rewardDispatcher.address, expandTo18Decimals(30000), {
        from: this.minter.address,
      });
    await this.rewardToken
      .connect(this.rewardDispatcher)
      .approve(this.rewarder.address, expandTo18Decimals(30000), {
        from: this.rewardDispatcher.address,
      });

    await expect(
      this.rewarder
        .connect(this.bob)
        .updateVestingSetting(
          50,
          Duration.fromObject({ minutes: 15 }).as("seconds"),
          Duration.fromObject({ minutes: 1 }).as("seconds")
        )
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      this.rewarder
        .connect(this.charlie)
        .updateVestingSetting(
          50,
          Duration.fromObject({ minutes: 15 }).as("seconds"),
          Duration.fromObject({ minutes: 1 }).as("seconds")
        )
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      this.rewarder
        .connect(this.minter)
        .updateVestingSetting(
          50,
          Duration.fromObject({ minutes: 15 }).as("seconds"),
          Duration.fromObject({ minutes: 1 }).as("seconds")
        )
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .updateVestingSetting(
          50,
          Duration.fromObject({ minutes: 15 }).as("seconds"),
          Duration.fromObject({ minutes: 1 }).as("seconds")
        )
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      this.rewarder
        .connect(this.rewardDispatcher)
        .updateVestingSetting(
          50,
          Duration.fromObject({ minutes: 15 }).as("seconds"),
          Duration.fromObject({ minutes: 1 }).as("seconds")
        )
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("setRewardDispatcher", async function () {
    await this.rewardToken
      .connect(this.minter)
      .transfer(this.rewardDispatcher.address, expandTo18Decimals(30000), {
        from: this.minter.address,
      });
    await this.rewardToken
      .connect(this.rewardDispatcher)
      .approve(this.rewarder.address, expandTo18Decimals(30000), {
        from: this.rewardDispatcher.address,
      });

    let entryTime = await latest();
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(30000), entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(7500)
    );
    expect(
      await this.rewardToken.balanceOf(this.rewardDispatcher.address)
    ).to.equal(expandTo18Decimals(22500));

    await increase(duration.days(182));

    await this.rewarder.setRewardDispatcher(this.rewardDispatcher2.address);
    //dispatcher do not have enough allowance and balance
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, 0, entryTime);
    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .claimVestedReward(1, this.bob.address)
    ).to.be.revertedWith("TransferHelper: TRANSFER_FROM_FAILED");

    await this.rewardToken
      .connect(this.minter)
      .transfer(this.rewardDispatcher2.address, expandTo18Decimals(22500), {
        from: this.minter.address,
      });
    await this.rewardToken
      .connect(this.rewardDispatcher2)
      .approve(this.rewarder.address, expandTo18Decimals(22500), {
        from: this.rewardDispatcher2.address,
      });

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, 0, entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);

    expect(
      await this.rewardToken.balanceOf(this.rewardDispatcher.address)
    ).to.equal(expandTo18Decimals(22500));
    expect(
      await this.rewardToken.balanceOf(this.rewardDispatcher2.address)
    ).to.equal(expandTo18Decimals(0));
  });

  it("Only owner can set reward dispatcher", async function () {
    await expect(
      this.rewarder.connect(this.bob).setRewardDispatcher(this.bob.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      this.rewarder.connect(this.charlie).setRewardDispatcher(this.bob.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      this.rewarder.connect(this.minter).setRewardDispatcher(this.bob.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      this.rewarder
        .connect(this.stakingPools)
        .setRewardDispatcher(this.bob.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      this.rewarder
        .connect(this.rewardDispatcher)
        .setRewardDispatcher(this.bob.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("User can redeem reward to vesting while keeping the accumulating pending reward", async function () {
    await this.rewardToken
      .connect(this.minter)
      .transfer(this.rewardDispatcher.address, expandTo18Decimals(30000), {
        from: this.minter.address,
      });
    await this.rewardToken
      .connect(this.rewardDispatcher)
      .approve(this.rewarder.address, expandTo18Decimals(30000), {
        from: this.rewardDispatcher.address,
      });

    let entryTime = await latest();
    // 2500 claimed, 7500 vesting
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(10000), entryTime);
    expect(await this.rewarder.claimableAmounts(this.bob.address, 1)).to.equal(
      expandTo18Decimals(2500)
    );
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(2500)
    );

    await increase(duration.days(7));
    // last vesting: ~288 claimable
    // this reward: 5000 more claimed, 15000/26 vested, 15000*25/26= more vesting
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, expandTo18Decimals(20000), entryTime);
    expect(await this.rewarder.claimableAmounts(this.bob.address, 1)).to.equal(
      "5865384615384615384615"
    ); // 288+5000+577=5865
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      "8365384615384615384615"
    ); // 5865 + 2500 = 8365

    // New vesting schedule:
    // amount = 7500 - 288 + 15000 - 577 =~ 21635
    // per week =~ 21635 / 25 = 865
    const perWeek = BigNumber.from("865384615384615384615");
    for (let i = 0; i <= 181 - 7; i++) {
      let week = Math.floor(i / 7);
      expect(
        await this.rewarder.calculateWithdrawableFromVesting(
          this.bob.address,
          1
        )
      ).to.equal(perWeek.mul(week));
      await increase(duration.days(1));
    }

    //After last week = total
    expect(
      await this.rewarder.calculateWithdrawableFromVesting(this.bob.address, 1)
    ).to.equal("21634615384615384615385");

    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, "0", entryTime);
    await this.rewarder
      .connect(this.stakingPools)
      .claimVestedReward(1, this.bob.address);
    expect(await this.rewardToken.balanceOf(this.bob.address)).to.equal(
      expandTo18Decimals(30000)
    );

    await increase(duration.days(7));
    await this.rewarder
      .connect(this.stakingPools)
      .onReward(1, this.bob.address, 0, latest());
    expect(await this.rewarder.claimableAmounts(this.bob.address, 1)).to.equal(
      "0"
    );
  });
});
