import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers, upgrades } from "hardhat";
import { Duration } from "luxon";
import { duration, expandTo18Decimals, increase, latest } from "./utilities";

describe("option test", function () {
  beforeEach(async function () {
    this.signers = await ethers.getSigners();
    this.deployer = this.signers[0];
    this.fund = this.signers[1];
    this.user = this.signers[2];
    this.feeCollector = this.signers[3];
    this.bulletCollector = this.signers[4];
    this.rewardDispatcher = this.signers[5];

    this.OptionFactory = await ethers.getContractFactory("OptionFactory");
    this.Option = await ethers.getContractFactory("Option");
    this.StakingPools = await ethers.getContractFactory("StakingPools");
    this.DOBStakingPool = await ethers.getContractFactory("DOBStakingPool");
    this.Distributions = await ethers.getContractFactory("Distributions");
    this.StakingPoolRewarder = await ethers.getContractFactory(
      "StakingPoolRewarder"
    );
    this.ERC20Mock = await ethers.getContractFactory(
      "ERC20Mock",
      this.deployer
    );

    this.DOB = await this.ERC20Mock.deploy(
      "DOB",
      "DOB",
      expandTo18Decimals(100000)
    );
    await this.DOB.deployed();

    this.uHODL = await this.ERC20Mock.deploy(
      "uHODL",
      "uHODL",
      expandTo18Decimals(10000000)
    );
    await this.uHODL.deployed();

    this.bHODL = await this.ERC20Mock.deploy(
      "bHODL",
      "bHODL",
      expandTo18Decimals(100000)
    );
    await this.bHODL.deployed();

    this.distributions = await upgrades.deployProxy(this.Distributions, [], {
      initializer: "__Distributions_init",
    });
    await this.distributions.deployed();
    await expect(this.distributions.connect(this.deployer).setExerciseFee(30))
      .to.emit(this.distributions, "ExerciseFeeRatioChanged")
      .withArgs(0, 30);

    await expect(this.distributions.connect(this.deployer).setWithdrawFee(30))
      .to.emit(this.distributions, "WithdrawFeeRatioChanged")
      .withArgs(0, 30);

    await expect(
      this.distributions.connect(this.deployer).setBulletToRewardRatio(50)
    )
      .to.emit(this.distributions, "BulletToRewardRatioChanged")
      .withArgs(80, 50);

    await expect(
      this.distributions
        .connect(this.deployer)
        .setFeeDistribution([100], [this.feeCollector.address])
    )
      .to.emit(this.distributions, "FeeDistributionSetted")
      .withArgs([100], [this.feeCollector.address]);

    await expect(
      this.distributions
        .connect(this.deployer)
        .setBulletDistribution([100], [this.bulletCollector.address])
    )
      .to.emit(this.distributions, "BulletDistributionSetted")
      .withArgs([100], [this.bulletCollector.address]);

    this.stakingPools = await upgrades.deployProxy(this.StakingPools, [], {
      initializer: "__StakingPools_init",
    });
    await this.stakingPools.deployed();

    this.rewarder = await upgrades.deployProxy(
      this.StakingPoolRewarder,
      [
        this.stakingPools.address,
        this.DOB.address,
        this.rewardDispatcher.address,
        75,
        Duration.fromObject({ weeks: 26 }).as("seconds"),
        Duration.fromObject({ weeks: 1 }).as("seconds"),
      ],
      { initializer: "__StakingPoolRewarder_init" }
    );
    await this.rewarder.deployed();

    await this.stakingPools
      .connect(this.deployer)
      .setRewarder(this.rewarder.address);

    this.optionFactory = await this.OptionFactory.deploy(
      this.bHODL.address,
      this.uHODL.address
    );
    await this.optionFactory.deployed();

    this.dobStakingPool = await await upgrades.deployProxy(
      this.DOBStakingPool,
      [
        this.feeCollector.address, // _feeCollector,
        this.bulletCollector.address, //  _bulletCollector,
        this.rewardDispatcher.address, //  _rewardDispatcher,
        this.uHODL.address, //  _uHODl,
        this.bHODL.address, //  _bHODL,
        this.DOB.address, // _DOB
      ],
      { initializer: "__DOBStakingPool_init" }
    );
    await this.dobStakingPool.deployed();
    await this.dobStakingPool
      .connect(this.deployer)
      .setFactory(this.optionFactory.address);

    await this.optionFactory
      .connect(this.deployer)
      .setStakingPools(this.stakingPools.address);

    await this.optionFactory
      .connect(this.deployer)
      .setDOBStakingPool(this.dobStakingPool.address);

    await this.optionFactory
      .connect(this.deployer)
      .setDistributions(this.distributions.address);

    await this.optionFactory
      .connect(this.deployer)
      .setStakingRewardPerBlock(expandTo18Decimals(100));

    await this.stakingPools
      .connect(this.deployer)
      .setFactory(this.optionFactory.address);
  });

  it("User can not enter option with zero amount", async function () {
    const now = await latest();
    let exerciseTime = BigNumber.from(now).add(duration.days(5));
    await this.optionFactory
      .connect(this.fund)
      .createOption(expandTo18Decimals(65000), exerciseTime, 0);
    const optionId = await this.optionFactory.getLastOptionId();
    expect(optionId).to.equal(1);
    const optionAddress = await this.optionFactory.getOptionByID(optionId);
    this.option = await this.Option.attach(optionAddress);
    await expect(this.option.connect(this.user).enter(0)).to.be.revertedWith(
      "Option: zero amount"
    );
  });

  it("User can not enter option when he/she not enough target token", async function () {
    const now = await latest();
    let exerciseTime = BigNumber.from(now).add(duration.days(5));
    await this.optionFactory
      .connect(this.fund)
      .createOption(expandTo18Decimals(65000), exerciseTime, 0);
    const optionId = await this.optionFactory.getLastOptionId();
    expect(optionId).to.equal(1);
    const optionAddress = await this.optionFactory.getOptionByID(optionId);
    this.option = await this.Option.attach(optionAddress);
    await expect(
      this.option.connect(this.user).enter(expandTo18Decimals(1))
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance"); //SafeERC20 safeTransferFrom exception
  });

  it("User can enter option before exercise time", async function () {
    const now = await latest();
    let exerciseTime = BigNumber.from(now).add(duration.days(5));
    await this.optionFactory
      .connect(this.fund)
      .createOption(expandTo18Decimals(65000), exerciseTime, 0);

    const optionId = await this.optionFactory.getLastOptionId();
    expect(optionId).to.equal(1);

    const optionAddress = await this.optionFactory.getOptionByID(optionId);
    this.option = await this.Option.attach(optionAddress);

    const bulletAddress = await this.option.bullet();
    const sniperAddress = await this.option.sniper();
    const bullet = await this.ERC20Mock.attach(bulletAddress);
    const sniper = await this.ERC20Mock.attach(sniperAddress);
    //call option target token is bHODL
    await this.bHODL
      .connect(this.deployer)
      .transfer(this.user.address, expandTo18Decimals(10));
    await this.bHODL
      .connect(this.user)
      .approve(optionAddress, expandTo18Decimals(6), {
        from: this.user.address,
      });

    expect(await this.option.connect(this.user).enter(expandTo18Decimals(2)))
      .to.emit(this.option, "EnteredOption")
      .withArgs(optionId, this.user.address, expandTo18Decimals(2));

    //check token transfer
    expect(await this.bHODL.balanceOf(this.user.address)).to.equal(
      expandTo18Decimals(8)
    );
    expect(await this.bHODL.balanceOf(optionAddress)).to.equal(
      expandTo18Decimals(2)
    );
    // check auto stake sniper
    expect(await sniper.balanceOf(this.stakingPools.address)).to.equal(
      expandTo18Decimals(2)
    );
    const stakeInfo = await this.stakingPools.userData(
      optionId,
      this.user.address
    );
    expect(await stakeInfo.stakeAmount).to.equal(expandTo18Decimals(2));
    // check bullet distribution 50% to bullet collector for reward 50% to fund
    expect(await bullet.balanceOf(this.fund.address)).to.equal(
      expandTo18Decimals(1)
    );
    expect(await bullet.balanceOf(this.bulletCollector.address)).to.equal(
      expandTo18Decimals(1)
    );
  });

  it("User can not enter option after exercise time", async function () {
    const now = await latest();
    let exerciseTime = BigNumber.from(now).add(duration.days(5));
    await this.optionFactory
      .connect(this.fund)
      .createOption(expandTo18Decimals(65000), exerciseTime, 0);

    const optionId = await this.optionFactory.getLastOptionId();
    expect(optionId).to.equal(1);

    const optionAddress = await this.optionFactory.getOptionByID(optionId);
    this.option = await this.Option.attach(optionAddress);

    const bulletAddress = await this.option.bullet();
    const sniperAddress = await this.option.sniper();
    const bullet = await this.ERC20Mock.attach(bulletAddress);
    const sniper = await this.ERC20Mock.attach(sniperAddress);
    //call option target token is bHODL
    await this.bHODL
      .connect(this.deployer)
      .transfer(this.user.address, expandTo18Decimals(10));
    await this.bHODL
      .connect(this.user)
      .approve(optionAddress, expandTo18Decimals(6), {
        from: this.user.address,
      });

    await increase(duration.days(5));
    await expect(
      this.option.connect(this.user).enter(expandTo18Decimals(1))
    ).to.be.revertedWith("Option: only before exercise time");
  });

  it("User can not exercise option out exercise time", async function () {
    const now = await latest();
    let exerciseTime = BigNumber.from(now).add(duration.days(5));
    await this.optionFactory
      .connect(this.fund)
      .createOption(expandTo18Decimals(65000), exerciseTime, 0);
    const optionId = await this.optionFactory.getLastOptionId();

    const optionAddress = await this.optionFactory.getOptionByID(optionId);
    this.option = await this.Option.attach(optionAddress);

    await expect(
      this.option.connect(this.user).exercise(expandTo18Decimals(1))
    ).to.be.revertedWith("Option: only in exercise time");

    await increase(duration.days(6));
    await expect(
      this.option.connect(this.user).exercise(expandTo18Decimals(1))
    ).to.be.revertedWith("Option: only in exercise time");
  });

  it("User can not exercise option with zero amount", async function () {
    const now = await latest();
    let exerciseTime = BigNumber.from(now).add(duration.days(5));
    await this.optionFactory
      .connect(this.fund)
      .createOption(expandTo18Decimals(65000), exerciseTime, 0);
    const optionId = await this.optionFactory.getLastOptionId();
    expect(optionId).to.equal(1);
    const optionAddress = await this.optionFactory.getOptionByID(optionId);
    this.option = await this.Option.attach(optionAddress);

    await increase(duration.days(5));

    await expect(this.option.connect(this.user).exercise(0)).to.be.revertedWith(
      "Option: zero target amount"
    );
  });
  it("User can not exercise option when he/she not enough bullet token", async function () {
    const now = await latest();
    let exerciseTime = BigNumber.from(now).add(duration.days(5));
    await this.optionFactory
      .connect(this.fund)
      .createOption(expandTo18Decimals(65000), exerciseTime, 0);
    const optionId = await this.optionFactory.getLastOptionId();
    expect(optionId).to.equal(1);
    const optionAddress = await this.optionFactory.getOptionByID(optionId);
    this.option = await this.Option.attach(optionAddress);

    const bulletAddress = await this.option.bullet();
    const sniperAddress = await this.option.sniper();
    const bullet = await this.ERC20Mock.attach(bulletAddress);
    const sniper = await this.ERC20Mock.attach(sniperAddress);

    await this.bHODL
      .connect(this.deployer)
      .transfer(this.user.address, expandTo18Decimals(10));
    await this.bHODL
      .connect(this.user)
      .approve(optionAddress, expandTo18Decimals(6), {
        from: this.user.address,
      });

    await this.option.connect(this.user).enter(expandTo18Decimals(6));

    expect(await bullet.balanceOf(this.bulletCollector.address)).to.equal(
      expandTo18Decimals(3)
    );
    await increase(duration.days(5));

    await expect(this.option.connect(this.user).exercise(1)).to.be.revertedWith(
      "Option: not enough bullet"
    );
    await bullet
      .connect(this.bulletCollector)
      .transfer(this.user.address, expandTo18Decimals(3));

    expect(await bullet.balanceOf(this.user.address)).to.equal(
      expandTo18Decimals(3)
    );
    await expect(
      this.option.connect(this.user).exercise(expandTo18Decimals(4))
    ).to.be.revertedWith("Option: not enough bullet");
  });
  it("User exercise option test", async function () {
    const now = await latest();
    let exerciseTime = BigNumber.from(now).add(duration.days(5));
    await this.optionFactory
      .connect(this.fund)
      .createOption(expandTo18Decimals(65000), exerciseTime, 0);

    const optionId = await this.optionFactory.getLastOptionId();
    expect(optionId).to.equal(1);

    const optionAddress = await this.optionFactory.getOptionByID(optionId);
    this.option = await this.Option.attach(optionAddress);

    const bulletAddress = await this.option.bullet();
    const sniperAddress = await this.option.sniper();
    const bullet = await this.ERC20Mock.attach(bulletAddress);
    const sniper = await this.ERC20Mock.attach(sniperAddress);
    //call option target token is bHODL
    await this.bHODL
      .connect(this.deployer)
      .transfer(this.user.address, expandTo18Decimals(10));
    await this.bHODL
      .connect(this.user)
      .approve(optionAddress, expandTo18Decimals(6), {
        from: this.user.address,
      });

    await this.option.connect(this.user).enter(expandTo18Decimals(6));

    expect(await bullet.balanceOf(this.bulletCollector.address)).to.equal(
      expandTo18Decimals(3)
    );
    await increase(duration.days(5));
    // need base token
    await this.uHODL
      .connect(this.deployer)
      .transfer(this.user.address, expandTo18Decimals(195000)); //need 65000 * 3
    await this.uHODL
      .connect(this.user)
      .approve(optionAddress, expandTo18Decimals(195000), {
        from: this.user.address,
      });

    await bullet
      .connect(this.bulletCollector)
      .transfer(this.user.address, expandTo18Decimals(3));
    await bullet
      .connect(this.user)
      .approve(optionAddress, expandTo18Decimals(3), {
        from: this.user.address,
      });

    await this.option.connect(this.user).exercise(expandTo18Decimals(3));
    expect(await this.uHODL.balanceOf(optionAddress)).to.equal(
      expandTo18Decimals(195000)
    );
    expect(await this.bHODL.balanceOf(this.user.address)).to.equal(
      expandTo18Decimals(6.1)
    );
    expect(await bullet.balanceOf(this.user.address)).to.equal(
      BigNumber.from(0)
    );
  });

  it("User can not exit option after exercise time", async function () {
    const now = await latest();
    let exerciseTime = BigNumber.from(now).add(duration.days(5));
    await this.optionFactory
      .connect(this.fund)
      .createOption(expandTo18Decimals(65000), exerciseTime, 0);
    const optionId = await this.optionFactory.getLastOptionId();

    const optionAddress = await this.optionFactory.getOptionByID(optionId);
    this.option = await this.Option.attach(optionAddress);

    await expect(
      this.option.connect(this.user).exit(expandTo18Decimals(1))
    ).to.be.revertedWith("Option: only in exit time");

    await increase(duration.days(6));
    await expect(
      this.option.connect(this.user).exit(expandTo18Decimals(1))
    ).to.be.revertedWith("Option: only in exit time");
    await increase(duration.hours(23));
    await expect(
      this.option.connect(this.user).exit(expandTo18Decimals(1))
    ).to.be.revertedWith("Option: only in exit time");
    await increase(duration.minutes(59));
    await expect(
      this.option.connect(this.user).exit(expandTo18Decimals(1))
    ).to.be.revertedWith("Option: only in exit time");
  });

  it("User can not exit option with zero amount", async function () {
    const now = await latest();
    let exerciseTime = BigNumber.from(now).add(duration.days(5));
    await this.optionFactory
      .connect(this.fund)
      .createOption(expandTo18Decimals(65000), exerciseTime, 0);
    const optionId = await this.optionFactory.getLastOptionId();
    expect(optionId).to.equal(1);
    const optionAddress = await this.optionFactory.getOptionByID(optionId);
    this.option = await this.Option.attach(optionAddress);
    await increase(duration.days(7));

    await expect(
      this.option.connect(this.user).exit(expandTo18Decimals(0))
    ).to.be.revertedWith("Option: zero amount");
  });

  it("User can not exit option ,if user not have enough token", async function () {
    const now = await latest();
    let exerciseTime = BigNumber.from(now).add(duration.days(5));
    await this.optionFactory
      .connect(this.fund)
      .createOption(expandTo18Decimals(65000), exerciseTime, 0);
    const optionId = await this.optionFactory.getLastOptionId();
    expect(optionId).to.equal(1);
    const optionAddress = await this.optionFactory.getOptionByID(optionId);
    this.option = await this.Option.attach(optionAddress);

    const bulletAddress = await this.option.bullet();
    const sniperAddress = await this.option.sniper();
    const bullet = await this.ERC20Mock.attach(bulletAddress);
    const sniper = await this.ERC20Mock.attach(sniperAddress);
    await this.bHODL
      .connect(this.deployer)
      .transfer(this.user.address, expandTo18Decimals(10));
    await this.bHODL
      .connect(this.user)
      .approve(optionAddress, expandTo18Decimals(6), {
        from: this.user.address,
      });

    await this.option.connect(this.user).enter(expandTo18Decimals(6));

    await increase(duration.days(7));

    expect(await sniper.balanceOf(this.stakingPools.address)).to.equal(
      expandTo18Decimals(6)
    );
    const stakeInfo = await this.stakingPools.userData(
      optionId,
      this.user.address
    );
    expect(await stakeInfo.stakeAmount).to.equal(expandTo18Decimals(6));

    await expect(
      this.option.connect(this.user).exit(expandTo18Decimals(7))
    ).to.be.revertedWith("Option: not enough staking amount");
  });

  it("User exit option test", async function () {
    const now = await latest();
    let exerciseTime = BigNumber.from(now).add(duration.days(5));
    await this.optionFactory
      .connect(this.fund)
      .createOption(expandTo18Decimals(65000), exerciseTime, 0);
    const optionId = await this.optionFactory.getLastOptionId();
    expect(optionId).to.equal(1);
    const optionAddress = await this.optionFactory.getOptionByID(optionId);
    this.option = await this.Option.attach(optionAddress);

    const bulletAddress = await this.option.bullet();
    const sniperAddress = await this.option.sniper();
    const bullet = await this.ERC20Mock.attach(bulletAddress);
    const sniper = await this.ERC20Mock.attach(sniperAddress);
    await this.bHODL
      .connect(this.deployer)
      .transfer(this.user.address, expandTo18Decimals(10));

    await this.bHODL
      .connect(this.user)
      .approve(optionAddress, expandTo18Decimals(6), {
        from: this.user.address,
      });
    await this.option.connect(this.user).enter(expandTo18Decimals(6));

    await increase(duration.days(7));

    expect(await sniper.balanceOf(this.stakingPools.address)).to.equal(
      expandTo18Decimals(6)
    );
    const stakeInfo = await this.stakingPools.userData(
      optionId,
      this.user.address
    );
    expect(await stakeInfo.stakeAmount).to.equal(expandTo18Decimals(6));
    let poolInfo = await this.stakingPools.poolInfos(optionId);
    let poolToken = await this.ERC20Mock.attach(poolInfo.poolToken);
    // which token should approve ?
    await poolToken
      .connect(this.user)
      .approve(optionAddress, expandTo18Decimals(6), {
        from: this.user.address,
      });

    await this.option.connect(this.user).exit(expandTo18Decimals(6));
    // TODO check user token balance
  });

  it("User can not withdraw option after exercise time", async function () {
    const now = await latest();
    let exerciseTime = BigNumber.from(now).add(duration.days(5));
    await this.optionFactory
      .connect(this.fund)
      .createOption(expandTo18Decimals(65000), exerciseTime, 0);
    const optionId = await this.optionFactory.getLastOptionId();

    const optionAddress = await this.optionFactory.getOptionByID(optionId);
    this.option = await this.Option.attach(optionAddress);

    await increase(duration.days(5));
    await increase(duration.hours(5));
    await expect(
      this.option.connect(this.user).withdrawTarget(expandTo18Decimals(1))
    ).to.be.revertedWith("Option: only before exercise time");

    await increase(duration.days(6));
    await expect(
      this.option.connect(this.user).withdrawTarget(expandTo18Decimals(1))
    ).to.be.revertedWith("Option: only before exercise time");
  });

  it("User withdraw option amount", async function () {
    const now = await latest();
    let exerciseTime = BigNumber.from(now).add(duration.days(5));
    await this.optionFactory
      .connect(this.fund)
      .createOption(expandTo18Decimals(65000), exerciseTime, 0);

    const optionId = await this.optionFactory.getLastOptionId();
    expect(optionId).to.equal(1);

    const optionAddress = await this.optionFactory.getOptionByID(optionId);
    this.option = await this.Option.attach(optionAddress);

    const bulletAddress = await this.option.bullet();
    const sniperAddress = await this.option.sniper();
    const bullet = await this.ERC20Mock.attach(bulletAddress);
    const sniper = await this.ERC20Mock.attach(sniperAddress);
    //call option target token is bHODL
    await this.bHODL
      .connect(this.deployer)
      .transfer(this.user.address, expandTo18Decimals(10));
    await this.bHODL
      .connect(this.user)
      .approve(optionAddress, expandTo18Decimals(6), {
        from: this.user.address,
      });

    expect(await this.option.connect(this.user).enter(expandTo18Decimals(2)))
      .to.emit(this.option, "EnteredOption")
      .withArgs(optionId, this.user.address, expandTo18Decimals(2));

    //check token transfer
    expect(await this.bHODL.balanceOf(this.user.address)).to.equal(
      expandTo18Decimals(8)
    );
    await expect(
      this.option.connect(this.user).withdrawTarget(expandTo18Decimals(1))
    ).to.be.revertedWith("Option: not enough sniper");
  });
});
