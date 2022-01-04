import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers, upgrades } from "hardhat";
import { Duration } from "luxon";
import { duration, expandTo18Decimals, latest, uint256Max } from "./utilities";
import { ADDRESS_ZERO } from "./utilities/index";

describe("Create option", function () {
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
      expandTo18Decimals(100000)
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

  it("fund can create option", async function () {
    const now = await latest();
    const exerciseTime = BigNumber.from(now).add(duration.days(3));
    const txn = await this.optionFactory
      .connect(this.fund)
      .createOption(expandTo18Decimals(65000), exerciseTime, 0);

    const optionId = await this.optionFactory.getLastOptionId();
    expect(optionId).to.equal(1);
    const controllerAddress = await this.optionFactory.getOptionByID(optionId);
    this.controller = await this.Option.attach(controllerAddress);
    const bullet = await this.controller.bullet();
    const sniper = await this.controller.sniper();
    expect(await this.controller.fund()).equal(this.fund.address);
    expect(await this.controller.strikePrice()).equal(
      expandTo18Decimals(65000)
    );
    expect(await this.controller.exerciseTimestamp()).equal(exerciseTime);

    await expect(txn)
      .to.emit(this.optionFactory, "OptionCreated")
      .withArgs(
        controllerAddress,
        bullet,
        sniper,
        expandTo18Decimals(65000),
        exerciseTime,
        0
      );
  });
  it("set staking pools ownable test", async function () {
    await expect(
      this.optionFactory.connect(this.user).setStakingPools(this.user.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("set staking pools zero address not allow test", async function () {
    await expect(
      this.optionFactory.connect(this.deployer).setStakingPools(ADDRESS_ZERO)
    ).to.be.revertedWith("OptionFactory: zero address");
  });
  it("set staking pools change test", async function () {
    await this.optionFactory
      .connect(this.deployer)
      .setStakingPools(this.user.address);
    expect(await this.optionFactory.getStakingPools()).equal(this.user.address);
  });

  it("set dob staking pools ownable test", async function () {
    await expect(
      this.optionFactory.connect(this.user).setDOBStakingPool(this.user.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("set dob staking pools zero address not allow test", async function () {
    await expect(
      this.optionFactory.connect(this.deployer).setDOBStakingPool(ADDRESS_ZERO)
    ).to.be.revertedWith("OptionFactory: zero address");
  });
  it("set dob staking pools change test", async function () {
    await this.optionFactory
      .connect(this.deployer)
      .setDOBStakingPool(this.user.address);
    expect(await this.optionFactory.DOBStakingPool()).equal(this.user.address);
  });

  it("set distributions ownable test", async function () {
    await expect(
      this.optionFactory.connect(this.user).setDistributions(this.user.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("set distributions zero address not allow test", async function () {
    await expect(
      this.optionFactory.connect(this.deployer).setDistributions(ADDRESS_ZERO)
    ).to.be.revertedWith("OptionFactory: zero address");
  });
  it("set distributions change test", async function () {
    await this.optionFactory
      .connect(this.deployer)
      .setDistributions(this.user.address);
    expect(await this.optionFactory.distributions()).equal(this.user.address);
  });

  it("set distributions ownable test", async function () {
    await expect(
      this.optionFactory.connect(this.user).setDistributions(this.user.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("set distributions zero address not allow test", async function () {
    await expect(
      this.optionFactory.connect(this.deployer).setDistributions(ADDRESS_ZERO)
    ).to.be.revertedWith("OptionFactory: zero address");
  });
  it("set distributions change test", async function () {
    await this.optionFactory
      .connect(this.deployer)
      .setDistributions(this.user.address);
    expect(await this.optionFactory.distributions()).equal(this.user.address);
  });

  it("set staking reward per block  ownable test", async function () {
    await expect(
      this.optionFactory.connect(this.user).setStakingRewardPerBlock(7)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("staking reward per block change test", async function () {
    await this.optionFactory.connect(this.deployer).setStakingRewardPerBlock(8);
    expect(await this.optionFactory.stakingRewardPerBlock()).equal(8);
    await this.optionFactory.connect(this.deployer).setStakingRewardPerBlock(0);
    expect(await this.optionFactory.stakingRewardPerBlock()).equal(0);

    await this.optionFactory
      .connect(this.deployer)
      .setStakingRewardPerBlock(uint256Max);
    expect(await this.optionFactory.stakingRewardPerBlock()).equal(uint256Max);
  });

  it("fund create strike pirce zero value test", async function () {
    const now = await latest();
    const exerciseTime = BigNumber.from(now).add(duration.days(3));

    await expect(
      this.optionFactory
        .connect(this.fund)
        .createOption(expandTo18Decimals(0), exerciseTime, 1)
    ).to.be.revertedWith("OptionFactory: zero strike price");
  });

  it("fund create option strike price max value test", async function () {
    const now = await latest();
    const exerciseTime = BigNumber.from(now).add(duration.days(3));
    let price = uint256Max.div(2).sub(1);
    const txn = await this.optionFactory
      .connect(this.fund)
      .createOption(price, exerciseTime, 0);
    //Need to find out the option you created
    const optionId = await this.optionFactory.getLastOptionId();
    expect(optionId).to.equal(1);
    const controllerAddress = await this.optionFactory.getOptionByID(optionId);
    this.controller = await this.Option.attach(controllerAddress);
    expect(await this.controller.strikePrice()).equal(price);
  });

  it("fund create option exercise time test", async function () {
    const now = await latest();
    let exerciseTime = BigNumber.from(now).sub(duration.years(5));
    await expect(
      this.optionFactory
        .connect(this.fund)
        .createOption(expandTo18Decimals(65000), exerciseTime, 0)
    ).to.be.revertedWith("OptionFactory: Illegal exercise time");

    exerciseTime = BigNumber.from(now).sub(duration.days(5));
    await expect(
      this.optionFactory
        .connect(this.fund)
        .createOption(expandTo18Decimals(65000), exerciseTime, 0)
    ).to.be.revertedWith("OptionFactory: Illegal exercise time");

    exerciseTime = BigNumber.from(now).sub(duration.days(1));
    await expect(
      this.optionFactory
        .connect(this.fund)
        .createOption(expandTo18Decimals(65000), exerciseTime, 0)
    ).to.be.revertedWith("OptionFactory: Illegal exercise time");

    exerciseTime = BigNumber.from(now).add(duration.hours(24));
    await expect(
      this.optionFactory
        .connect(this.fund)
        .createOption(expandTo18Decimals(65000), exerciseTime, 0)
    ).to.be.revertedWith("OptionFactory: Illegal exercise time");
  });
  it("fund create option type test", async function () {
    const now = await latest();
    let exerciseTime = BigNumber.from(now).add(duration.days(5));
    await expect(
      this.optionFactory
        .connect(this.fund)
        .createOption(expandTo18Decimals(65000), exerciseTime, 2)
    ).to.be.revertedWith("OptionFactory: Illegal type");
    await expect(
      this.optionFactory
        .connect(this.fund)
        .createOption(expandTo18Decimals(65000), exerciseTime, 255)
    ).to.be.revertedWith("OptionFactory: Illegal type");
  });
});
