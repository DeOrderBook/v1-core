import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Duration } from "luxon";
import { expandTo18Decimals } from "./utilities";

describe("Distributions", function () {
  beforeEach(async function () {
    this.signers = await ethers.getSigners();
    this.deployer = this.signers[0];
    this.fund = this.signers[1];
    this.user = this.signers[2];
    this.feeCollector = this.signers[3];
    this.bulletCollector = this.signers[4];
    this.rewardDispatcher = this.signers[5];
    this.testAddress1 = this.signers[6];
    this.testAddress2 = this.signers[7];
    this.testAddress3 = this.signers[8];

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
  it("Only owner can set exercise fee ", async function () {
    await expect(
      this.distributions.connect(this.user).setExerciseFee(1)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("set exercise fee illegal value range test", async function () {
    await expect(
      this.distributions.connect(this.deployer).setExerciseFee(100)
    ).to.be.revertedWith("OptionFactory: Illegal value range");
    await expect(
      this.distributions.connect(this.deployer).setExerciseFee(101)
    ).to.be.revertedWith("OptionFactory: Illegal value range");
    await expect(
      this.distributions.connect(this.deployer).setExerciseFee(255)
    ).to.be.revertedWith("OptionFactory: Illegal value range");
  });
  it("set exercise fee test", async function () {
    await this.distributions.connect(this.deployer).setExerciseFee(0);
    expect(await this.distributions.exerciseFeeRatio()).equal(0);
    await this.distributions.connect(this.deployer).setExerciseFee(10);
    expect(await this.distributions.exerciseFeeRatio()).equal(10);
    await this.distributions.connect(this.deployer).setExerciseFee(99);
    expect(await this.distributions.exerciseFeeRatio()).equal(99);
  });

  it("Only owner can set set withdraw fee", async function () {
    await expect(
      this.distributions.connect(this.user).setWithdrawFee(1)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("set withdraw fee illegal value range test", async function () {
    await expect(
      this.distributions.connect(this.deployer).setWithdrawFee(100)
    ).to.be.revertedWith("OptionFactory: Illegal value range");
    await expect(
      this.distributions.connect(this.deployer).setWithdrawFee(101)
    ).to.be.revertedWith("OptionFactory: Illegal value range");
    await expect(
      this.distributions.connect(this.deployer).setWithdrawFee(255)
    ).to.be.revertedWith("OptionFactory: Illegal value range");
  });
  it("set withdraw fee test", async function () {
    await this.distributions.connect(this.deployer).setWithdrawFee(0);
    expect(await this.distributions.withdrawFeeRatio()).equal(0);
    await this.distributions.connect(this.deployer).setWithdrawFee(10);
    expect(await this.distributions.withdrawFeeRatio()).equal(10);
    await this.distributions.connect(this.deployer).setWithdrawFee(99);
    expect(await this.distributions.withdrawFeeRatio()).equal(99);
  });

  it("Only owner can set set bullet to reward ratio ", async function () {
    await expect(
      this.distributions.connect(this.user).setBulletToRewardRatio(1)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("set bullet to reward ratio illegal value range test", async function () {
    await expect(
      this.distributions.connect(this.deployer).setBulletToRewardRatio(81)
    ).to.be.revertedWith("OptionFactory: Illegal value range");
    await expect(
      this.distributions.connect(this.deployer).setBulletToRewardRatio(101)
    ).to.be.revertedWith("OptionFactory: Illegal value range");
    await expect(
      this.distributions.connect(this.deployer).setBulletToRewardRatio(255)
    ).to.be.revertedWith("OptionFactory: Illegal value range");
  });
  it("set bullet to reward ratio test", async function () {
    await this.distributions.connect(this.deployer).setBulletToRewardRatio(0);
    expect(await this.distributions.bulletToRewardRatio()).equal(0);
    await this.distributions.connect(this.deployer).setBulletToRewardRatio(80);
    expect(await this.distributions.bulletToRewardRatio()).equal(80);
    await this.distributions.connect(this.deployer).setBulletToRewardRatio(1);
    expect(await this.distributions.bulletToRewardRatio()).equal(1);
  });

  it("Only owner can set fee distribution", async function () {
    await expect(
      this.distributions
        .connect(this.user)
        .setFeeDistribution([100], [this.feeCollector.address])
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("set fee distribution array length test", async function () {
    await expect(
      this.distributions
        .connect(this.deployer)
        .setFeeDistribution([100, 20], [])
    ).to.be.revertedWith("Distributions: array length not match");
    await expect(
      this.distributions
        .connect(this.deployer)
        .setFeeDistribution(
          [],
          [
            this.testAddress1.address,
            this.testAddress2.address,
            this.testAddress3.address,
          ]
        )
    ).to.be.revertedWith("Distributions: array length not match");
    await expect(
      this.distributions
        .connect(this.deployer)
        .setFeeDistribution(
          [100, 20],
          [
            this.testAddress1.address,
            this.testAddress2.address,
            this.testAddress3.address,
          ]
        )
    ).to.be.revertedWith("Distributions: array length not match");
    await expect(
      this.distributions
        .connect(this.deployer)
        .setFeeDistribution([100, 20, 30], [this.testAddress1.address])
    ).to.be.revertedWith("Distributions: array length not match");
  });
  it("set fee distribution perentage 100 test", async function () {
    await expect(
      this.distributions
        .connect(this.deployer)
        .setFeeDistribution([90], [this.testAddress1.address])
    ).to.be.revertedWith("Distributions: sum of percentage not 100");
    await expect(
      this.distributions
        .connect(this.deployer)
        .setFeeDistribution([101], [this.testAddress1.address])
    ).to.be.revertedWith("Distributions: sum of percentage not 100");
    await expect(
      this.distributions
        .connect(this.deployer)
        .setFeeDistribution(
          [30, 20, 0],
          [
            this.testAddress1.address,
            this.testAddress2.address,
            this.testAddress3.address,
          ]
        )
    ).to.be.revertedWith("Distributions: sum of percentage not 100");
    await expect(
      this.distributions
        .connect(this.deployer)
        .setFeeDistribution(
          [100, 20, 30],
          [
            this.testAddress1.address,
            this.testAddress2.address,
            this.testAddress3.address,
          ]
        )
    ).to.be.revertedWith("Distributions: sum of percentage not 100");
  });
  it("set fee distribution test", async function () {
    await this.distributions
      .connect(this.deployer)
      .setFeeDistribution(
        [28, 40, 32],
        [
          this.testAddress1.address,
          this.testAddress2.address,
          this.testAddress3.address,
        ]
      );
    expect(await this.distributions.feeDistributionLength()).equal(3);
    let one = await this.distributions.feeDistribution(0);
    expect(one.percentage).equal(28);
    expect(one.to).equal(this.testAddress1.address);

    one = await this.distributions.feeDistribution(1);
    expect(one.percentage).equal(40);
    expect(one.to).equal(this.testAddress2.address);

    one = await this.distributions.feeDistribution(2);
    expect(one.percentage).equal(32);
    expect(one.to).equal(this.testAddress3.address);

    await this.distributions
      .connect(this.deployer)
      .setFeeDistribution(
        [0, 51, 49],
        [
          this.testAddress1.address,
          this.testAddress2.address,
          this.testAddress3.address,
        ]
      );
    expect(await this.distributions.feeDistributionLength()).equal(3);
    one = await this.distributions.feeDistribution(0);
    expect(one.percentage).equal(0);
    expect(one.to).equal(this.testAddress1.address);

    one = await this.distributions.feeDistribution(1);
    expect(one.percentage).equal(51);
    expect(one.to).equal(this.testAddress2.address);

    one = await this.distributions.feeDistribution(2);
    expect(one.percentage).equal(49);
    expect(one.to).equal(this.testAddress3.address);
  });

  it("Only owner can set bullet distribution", async function () {
    await expect(
      this.distributions
        .connect(this.user)
        .setBulletDistribution([100], [this.testAddress1.address])
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("set bullet distribution array length test", async function () {
    await expect(
      this.distributions
        .connect(this.deployer)
        .setBulletDistribution([100, 20, 30], [])
    ).to.be.revertedWith("Distributions: array length not match");
    await expect(
      this.distributions
        .connect(this.deployer)
        .setBulletDistribution(
          [],
          [
            this.testAddress1.address,
            this.testAddress2.address,
            this.testAddress3.address,
          ]
        )
    ).to.be.revertedWith("Distributions: array length not match");
    await expect(
      this.distributions
        .connect(this.deployer)
        .setBulletDistribution(
          [200, 20],
          [
            this.testAddress1.address,
            this.testAddress2.address,
            this.testAddress3.address,
          ]
        )
    ).to.be.revertedWith("Distributions: array length not match");
    await expect(
      this.distributions
        .connect(this.deployer)
        .setBulletDistribution([100, 20, 30], [this.testAddress1.address])
    ).to.be.revertedWith("Distributions: array length not match");
  });
  it("set fee distribution perentage 100 test", async function () {
    await expect(
      this.distributions
        .connect(this.deployer)
        .setBulletDistribution([0], [this.testAddress1.address])
    ).to.be.revertedWith("Distributions: sum of percentage not 100");
    await expect(
      this.distributions
        .connect(this.deployer)
        .setBulletDistribution([99], [this.testAddress1.address])
    ).to.be.revertedWith("Distributions: sum of percentage not 100");
    await expect(
      this.distributions
        .connect(this.deployer)
        .setBulletDistribution([102], [this.testAddress1.address])
    ).to.be.revertedWith("Distributions: sum of percentage not 100");

    await expect(
      this.distributions
        .connect(this.deployer)
        .setBulletDistribution(
          [30, 20, 0],
          [
            this.testAddress1.address,
            this.testAddress2.address,
            this.testAddress3.address,
          ]
        )
    ).to.be.revertedWith("Distributions: sum of percentage not 100");
    await expect(
      this.distributions
        .connect(this.deployer)
        .setBulletDistribution(
          [100, 20, 30],
          [
            this.testAddress1.address,
            this.testAddress2.address,
            this.testAddress3.address,
          ]
        )
    ).to.be.revertedWith("Distributions: sum of percentage not 100");
  });
  it("set fee distribution test", async function () {
    await this.distributions
      .connect(this.deployer)
      .setBulletDistribution(
        [10, 30, 60],
        [
          this.testAddress1.address,
          this.testAddress2.address,
          this.testAddress3.address,
        ]
      );
    expect(await this.distributions.bulletDistributionLength()).equal(3);
    let one = await this.distributions.bulletDistribution(0);
    expect(one.percentage).equal(10);
    expect(one.to).equal(this.testAddress1.address);

    one = await this.distributions.bulletDistribution(1);
    expect(one.percentage).equal(30);
    expect(one.to).equal(this.testAddress2.address);

    one = await this.distributions.bulletDistribution(2);
    expect(one.percentage).equal(60);
    expect(one.to).equal(this.testAddress3.address);

    await this.distributions
      .connect(this.deployer)
      .setBulletDistribution(
        [0, 0, 100],
        [
          this.testAddress1.address,
          this.testAddress2.address,
          this.testAddress3.address,
        ]
      );
    expect(await this.distributions.bulletDistributionLength()).equal(3);
    one = await this.distributions.bulletDistribution(0);
    expect(one.percentage).equal(0);
    expect(one.to).equal(this.testAddress1.address);

    one = await this.distributions.bulletDistribution(1);
    expect(one.percentage).equal(0);
    expect(one.to).equal(this.testAddress2.address);

    one = await this.distributions.bulletDistribution(2);
    expect(one.percentage).equal(100);
    expect(one.to).equal(this.testAddress3.address);
  });
});
