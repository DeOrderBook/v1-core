import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers, upgrades } from "hardhat";
import { Duration } from "luxon";
import {
  ADDRESS_ZERO,
  duration,
  expandTo18Decimals,
  increase,
  uint256Max,
} from "./utilities";

describe("DOBStakingPoolRewardIntegration", function () {
  let deployer: SignerWithAddress,
    bob: SignerWithAddress,
    charlie: SignerWithAddress,
    rewardDispatcher: SignerWithAddress,
    worker: SignerWithAddress,
    feeCollector: SignerWithAddress,
    bulletCollector: SignerWithAddress,
    factory: SignerWithAddress;

  let dobStakingPool: Contract,
    uHODLRewarder: Contract,
    bHODLRewarder: Contract,
    dob: Contract,
    uHODL: Contract,
    bHODL: Contract,
    bullet: Contract;

  beforeEach(async function () {
    [
      deployer,
      bob,
      charlie,
      rewardDispatcher,
      worker,
      feeCollector,
      bulletCollector,
      factory,
    ] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock", deployer);
    const StakingPoolRewarder = await ethers.getContractFactory(
      "StakingPoolRewarder"
    );
    const DOBStakingPool = await ethers.getContractFactory("DOBStakingPool");

    dob = await ERC20Mock.deploy(
      "DeOrderBook",
      "DOB",
      expandTo18Decimals(100000)
    );
    await dob.deployed();

    uHODL = await ERC20Mock.deploy("u HODL", "UH", expandTo18Decimals(100000));
    await uHODL.deployed();

    bHODL = await ERC20Mock.deploy("b HODL", "BH", expandTo18Decimals(100000));
    await bHODL.deployed();

    bullet = await ERC20Mock.deploy("Bullet", "B", expandTo18Decimals(100000));
    await bullet.deployed();

    dobStakingPool = await await upgrades.deployProxy(
      DOBStakingPool,
      [
        feeCollector.address, // _feeCollector,
        bulletCollector.address, //  _bulletCollector,
        rewardDispatcher.address, //  _rewardDispatcher,
        uHODL.address, //  _uHODl,
        bHODL.address, //  _bHODL,
        dob.address, // _DOB
      ],
      { initializer: "__DOBStakingPool_init" }
    );
    await dobStakingPool.deployed();

    uHODLRewarder = await upgrades.deployProxy(
      StakingPoolRewarder,
      [
        dobStakingPool.address,
        uHODL.address,
        rewardDispatcher.address,
        75,
        Duration.fromObject({ weeks: 26 }).as("seconds"),
        Duration.fromObject({ weeks: 1 }).as("seconds"),
      ],
      { initializer: "__StakingPoolRewarder_init" }
    );
    await uHODLRewarder.deployed();

    bHODLRewarder = await upgrades.deployProxy(
      StakingPoolRewarder,
      [
        dobStakingPool.address,
        bHODL.address,
        rewardDispatcher.address,
        75,
        Duration.fromObject({ weeks: 26 }).as("seconds"),
        Duration.fromObject({ weeks: 1 }).as("seconds"),
      ],
      { initializer: "__StakingPoolRewarder_init" }
    );
    await bHODLRewarder.deployed();

    await dobStakingPool
      .connect(deployer)
      .setuHODLRewarder(uHODLRewarder.address);

    await dobStakingPool
      .connect(deployer)
      .setbHODLRewarder(bHODLRewarder.address);

    await dobStakingPool.connect(deployer).setWorker(worker.address);
    await dobStakingPool.connect(deployer).setFactory(factory.address);

    await dobStakingPool.connect(factory).addBullet(bullet.address);

    // Everyone gets 10000 of dob token
    for (const user of [bob, charlie]) {
      await dob.connect(deployer).transfer(
        user.address, // recipient
        expandTo18Decimals(10_000) // amount
      );
      await dob.connect(user).approve(
        dobStakingPool.address, // spender
        uint256Max // amount
      );
    }
    //approve fee collector and bullet collector
    await uHODL.connect(feeCollector).approve(
      dobStakingPool.address, // spender
      uint256Max // amount
    );
    await bHODL.connect(feeCollector).approve(
      dobStakingPool.address, // spender
      uint256Max // amount
    );
    await bullet.connect(bulletCollector).approve(
      dobStakingPool.address, // spender
      uint256Max // amount
    );
    await uHODL.connect(rewardDispatcher).approve(
      uHODLRewarder.address, // spender
      uint256Max // amount
    );
    await bHODL.connect(rewardDispatcher).approve(
      bHODLRewarder.address, // spender
      uint256Max // amount
    );
  });
  it("Only owner can set worker address", async function () {
    await expect(
      dobStakingPool.connect(bob).setWorker(worker.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("Set dob staking worker zero address not allow test", async function () {
    await expect(
      dobStakingPool.connect(deployer).setWorker(ADDRESS_ZERO)
    ).to.be.revertedWith("DOBStakingPool: zero address");
  });
  it("Dob staking change worker address test", async function () {
    await dobStakingPool.connect(deployer).setWorker(bob.address);
    expect(await dobStakingPool.worker()).equals(bob.address);
  });
  it("Only owner can set factory address", async function () {
    await expect(
      dobStakingPool.connect(bob).setFactory(worker.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("Set dob staking factory zero address not allow test", async function () {
    await expect(
      dobStakingPool.connect(deployer).setFactory(ADDRESS_ZERO)
    ).to.be.revertedWith("DOBStakingPool: zero address");
  });
  it("Dob staking change factory address test", async function () {
    await dobStakingPool.connect(deployer).setFactory(bob.address);
    expect(await dobStakingPool.optionFactory()).equals(bob.address);
  });
  it("Only owner can set uHODLRewarder address", async function () {
    await expect(
      dobStakingPool.connect(bob).setuHODLRewarder(worker.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("Set dob staking uHODLRewarder zero address not allow test", async function () {
    await expect(
      dobStakingPool.connect(deployer).setuHODLRewarder(ADDRESS_ZERO)
    ).to.be.revertedWith("DOBStakingPool: zero address");
  });
  it("Dob staking change uHODLRewarder address test", async function () {
    await dobStakingPool.connect(deployer).setuHODLRewarder(bob.address);
    expect(await dobStakingPool.uHODLRewarder()).equals(bob.address);
  });
  it("Only owner can set bHODLRewarder address", async function () {
    await expect(
      dobStakingPool.connect(bob).setbHODLRewarder(worker.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("Set dob staking bHODLRewarder zero address not allow test", async function () {
    await expect(
      dobStakingPool.connect(deployer).setbHODLRewarder(ADDRESS_ZERO)
    ).to.be.revertedWith("DOBStakingPool: zero address");
  });
  it("Dob staking change bHODLRewarder address test", async function () {
    await dobStakingPool.connect(deployer).setbHODLRewarder(bob.address);
    expect(await dobStakingPool.bHODLRewarder()).equals(bob.address);
  });

  it("Only owner can set bullet reward threshold", async function () {
    await expect(
      dobStakingPool.connect(bob).setBulletRewardThreshold(worker.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("Set bullet reward threshold zero not allow test", async function () {
    await expect(
      dobStakingPool.connect(deployer).setBulletRewardThreshold(0)
    ).to.be.revertedWith("DOBStakingPool: zero threshold");
  });
  it("Set bullet reward threshold test", async function () {
    await dobStakingPool.connect(deployer).setBulletRewardThreshold(11);
    expect(await dobStakingPool.bulletRewardThreshold()).equals(11);

    await dobStakingPool.connect(deployer).setBulletRewardThreshold(10000000);
    expect(await dobStakingPool.bulletRewardThreshold()).equals(10000000);

    await dobStakingPool.connect(deployer).setBulletRewardThreshold(uint256Max);
    expect(await dobStakingPool.bulletRewardThreshold()).equals(uint256Max);
  });

  it("Only owner can set extend lock days", async function () {
    await expect(
      dobStakingPool.connect(bob).setExtendLockDays(worker.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
  it("Set extend lock days zero not allow test", async function () {
    await expect(
      dobStakingPool.connect(deployer).setExtendLockDays(0)
    ).to.be.revertedWith("DOBStakingPool: zero days");
  });
  it("Set extend lock days test", async function () {
    await dobStakingPool.connect(deployer).setExtendLockDays(11);
    expect(await dobStakingPool.extendLockDays()).equals(11);

    await dobStakingPool.connect(deployer).setExtendLockDays(10000000);
    expect(await dobStakingPool.extendLockDays()).equals(10000000);

    await dobStakingPool.connect(deployer).setExtendLockDays(uint256Max);
    expect(await dobStakingPool.extendLockDays()).equals(uint256Max);
  });

  it("Only factory can add bullet", async function () {
    await expect(
      dobStakingPool.connect(bob).addBullet(bullet.address)
    ).to.be.revertedWith("DOBStaking: caller is not the option factory");
  });
  it("Add bullet zero address not allow test", async function () {
    await expect(
      dobStakingPool.connect(factory).addBullet(ADDRESS_ZERO)
    ).to.be.revertedWith("DOBStakingPool: zero address");
  });
  it("Add bullet test", async function () {
    await dobStakingPool.connect(factory).addBullet(bullet.address);
    expect(await dobStakingPool.bullets(1)).equals(bullet.address);
  });

  it("Only factory can remove bullet", async function () {
    await expect(
      dobStakingPool.connect(bob).removeBullet(bullet.address)
    ).to.be.revertedWith("DOBStaking: caller is not the option factory");
  });
  it("Remove bullet zero address not allow test", async function () {
    await expect(
      dobStakingPool.connect(factory).removeBullet(ADDRESS_ZERO)
    ).to.be.revertedWith("DOBStakingPool: zero address");
  });
  it("Remove bullet test", async function () {
    expect(await dobStakingPool.bullesLength()).equals(1);
    await dobStakingPool.connect(factory).addBullet(bullet.address);
    await dobStakingPool.connect(factory).addBullet(bullet.address);
    expect(await dobStakingPool.bullesLength()).equals(3);
    await dobStakingPool.connect(factory).removeBullet(bullet.address);
    expect(await dobStakingPool.bullesLength()).equals(0);

    await dobStakingPool.connect(factory).addBullet(charlie.address);
    await dobStakingPool.connect(factory).addBullet(bob.address);
    await dobStakingPool.connect(factory).addBullet(bullet.address);

    expect(await dobStakingPool.bullesLength()).equals(3);
    await dobStakingPool.connect(factory).removeBullet(bob.address);
    expect(await dobStakingPool.bullesLength()).equals(2);
    expect(await dobStakingPool.bullets(0)).equals(charlie.address);
    expect(await dobStakingPool.bullets(1)).equals(bullet.address);
  });

  it("User stake DOB can earn fee reward, and can claim vesting reward(stake -> draw -> claim)", async function () {
    //bob stake 100 DOB he staking amount should be 100, pool staking amount should be 100
    await expect(dobStakingPool.connect(bob).stake(expandTo18Decimals(100)))
      .to.emit(dobStakingPool, "Staked")
      .withArgs(bob.address, expandTo18Decimals(100));
    expect(
      (await dobStakingPool.userDatas(bob.address)).totalStakingAmount
    ).to.equal(expandTo18Decimals(100));
    expect((await dobStakingPool.poolData()).stakingAmount).to.equal(
      expandTo18Decimals(100)
    );

    //Before draw reward should be no accu reward
    let rewardInfo = await dobStakingPool.getReward(bob.address);
    expect(rewardInfo[0]).to.equal(BigNumber.from(0));
    expect(rewardInfo[1]).to.equal(BigNumber.from(0));
    expect(await bullet.balanceOf(bob.address)).to.equal(BigNumber.from(0));

    //Distribute to fee collector and bullet collector(Mock collect fee and bullet)
    await uHODL.connect(deployer).transfer(
      feeCollector.address, // recipient
      expandTo18Decimals(10) // amount
    );
    await bHODL.connect(deployer).transfer(
      feeCollector.address, // recipient
      expandTo18Decimals(5) // amount
    );
    await bullet.connect(deployer).transfer(
      bulletCollector.address, // recipient
      expandTo18Decimals(2) // amount
    );

    //After worker run drewReward() should be has accu reward
    await dobStakingPool.connect(worker).drawReward();

    rewardInfo = await dobStakingPool.getReward(bob.address);
    await increase(duration.days(1));
    expect(rewardInfo[0]).to.equal(expandTo18Decimals(10)); //uHODL
    expect(rewardInfo[1]).to.equal(expandTo18Decimals(5)); //bHODL
    expect(await bullet.balanceOf(bob.address)).to.equal(expandTo18Decimals(2));

    //claim reward,25% withdrawable,75% vested

    await dobStakingPool.connect(bob).redeemReward();

    expect(await uHODL.balanceOf(bob.address)).to.equal(
      expandTo18Decimals(2.5)
    );
    expect(await bHODL.balanceOf(bob.address)).to.equal(
      expandTo18Decimals(1.25)
    );
  });
  it("User stake DOB can earn fee reward, and can claim vesting reward (stake -> draw -> draw -> unstake -> draw -> claim)", async function () {
    //bob stake 100 DOB he staking amount should be 100, pool staking amount should be 100
    await expect(dobStakingPool.connect(bob).stake(expandTo18Decimals(100)))
      .to.emit(dobStakingPool, "Staked")
      .withArgs(bob.address, expandTo18Decimals(100));
    expect(
      (await dobStakingPool.userDatas(bob.address)).totalStakingAmount
    ).to.equal(expandTo18Decimals(100));
    expect((await dobStakingPool.poolData()).stakingAmount).to.equal(
      expandTo18Decimals(100)
    );
    //Before draw reward should be no accu reward
    let rewardInfo = await dobStakingPool.getReward(bob.address);
    expect(rewardInfo[0]).to.equal(BigNumber.from(0));
    expect(rewardInfo[1]).to.equal(BigNumber.from(0));
    expect(await bullet.balanceOf(bob.address)).to.equal(BigNumber.from(0));

    // First draw
    //Distribute to fee collector and bullet collector(Mock collect fee and bullet)
    await uHODL.connect(deployer).transfer(
      feeCollector.address, // recipient
      expandTo18Decimals(10) // amount
    );
    await bHODL.connect(deployer).transfer(
      feeCollector.address, // recipient
      expandTo18Decimals(5) // amount
    );
    await bullet.connect(deployer).transfer(
      bulletCollector.address, // recipient
      expandTo18Decimals(2) // amount
    );

    //After worker run drewReward() should be has accu reward
    await dobStakingPool.connect(worker).drawReward();

    rewardInfo = await dobStakingPool.getReward(bob.address);
    await increase(duration.days(1));
    expect(rewardInfo[0]).to.equal(expandTo18Decimals(10)); //uHODL
    expect(rewardInfo[1]).to.equal(expandTo18Decimals(5)); //bHODL
    expect(await bullet.balanceOf(bob.address)).to.equal(expandTo18Decimals(2));

    //Draw again
    //Distribute to fee collector and bullet collector(Mock collect fee and bullet)
    await uHODL.connect(deployer).transfer(
      feeCollector.address, // recipient
      expandTo18Decimals(20) // amount
    );
    await bHODL.connect(deployer).transfer(
      feeCollector.address, // recipient
      expandTo18Decimals(20) // amount
    );
    await bullet.connect(deployer).transfer(
      bulletCollector.address, // recipient
      expandTo18Decimals(10) // amount
    );

    //After worker run drewReward() should be has accu reward
    await dobStakingPool.connect(worker).drawReward();

    rewardInfo = await dobStakingPool.getReward(bob.address);
    await increase(duration.days(1));
    expect(rewardInfo[0]).to.equal(expandTo18Decimals(30)); //uHODL
    expect(rewardInfo[1]).to.equal(expandTo18Decimals(25)); //bHODL
    expect(await bullet.balanceOf(bob.address)).to.equal(expandTo18Decimals(2)); //Still the first time reward amount,because no daily stake

    //unstake
    await increase(duration.days(30));
    await expect(dobStakingPool.connect(bob).unstake(expandTo18Decimals(100)))
      .to.emit(dobStakingPool, "Unstaked")
      .withArgs(bob.address, expandTo18Decimals(100));

    //claim reward,25% withdrawable,75% vested
    //first reward
    //10 * 25% = 2.5
    //10 * 75% / 26 * 4 ~= 1.15384615 (vesting)
    //5 * 25% = 1.25
    //5 * 75% /26 *4 ~= 0.576923076923077 (vesting)
    //second reward
    //20 * 25% = 5
    //20 * 75% / 26 * 4 ~= 2.307692307692308 (vesting)
    //20 * 25% = 5
    //20 * 75% /26 *4 ~= 2.307692307692308 (vesting)

    await dobStakingPool.connect(bob).redeemReward();

    expect(await uHODL.balanceOf(bob.address)).to.equal("10961538461538461536");
    expect(await bHODL.balanceOf(bob.address)).to.equal("9134615384615384612");
  });
  it("User stake DOB can earn fee reward, and can claim vesting reward (stake -> draw -> unstake -> claim)", async function () {
    //bob stake 100 DOB he staking amount should be 100, pool staking amount should be 100
    await expect(dobStakingPool.connect(bob).stake(expandTo18Decimals(100)))
      .to.emit(dobStakingPool, "Staked")
      .withArgs(bob.address, expandTo18Decimals(100));
    expect(
      (await dobStakingPool.userDatas(bob.address)).totalStakingAmount
    ).to.equal(expandTo18Decimals(100));
    expect((await dobStakingPool.poolData()).stakingAmount).to.equal(
      expandTo18Decimals(100)
    );
    //Before draw reward should be no accu reward
    let rewardInfo = await dobStakingPool.getReward(bob.address);
    expect(rewardInfo[0]).to.equal(BigNumber.from(0));
    expect(rewardInfo[1]).to.equal(BigNumber.from(0));
    expect(await bullet.balanceOf(bob.address)).to.equal(BigNumber.from(0));

    //Distribute to fee collector and bullet collector(Mock collect fee and bullet)
    await uHODL.connect(deployer).transfer(
      feeCollector.address, // recipient
      expandTo18Decimals(10) // amount
    );
    await bHODL.connect(deployer).transfer(
      feeCollector.address, // recipient
      expandTo18Decimals(5) // amount
    );
    await bullet.connect(deployer).transfer(
      bulletCollector.address, // recipient
      expandTo18Decimals(2) // amount
    );

    //After worker run drewReward() should be has accu reward
    await dobStakingPool.connect(worker).drawReward();

    rewardInfo = await dobStakingPool.getReward(bob.address);
    await increase(duration.days(1));
    expect(rewardInfo[0]).to.equal(expandTo18Decimals(10)); //uHODL
    expect(rewardInfo[1]).to.equal(expandTo18Decimals(5)); //bHODL
    expect(await bullet.balanceOf(bob.address)).to.equal(expandTo18Decimals(2));

    //unstake
    await increase(duration.days(30));
    await expect(dobStakingPool.connect(bob).unstake(expandTo18Decimals(100)))
      .to.emit(dobStakingPool, "Unstaked")
      .withArgs(bob.address, expandTo18Decimals(100));

    //claim reward,25% withdrawable,75% vested
    //10 * 25% = 2.5
    //10 * 75% / 26 * 4 ~= 1.15384615 (vesting)
    //5 * 25% = 1.25
    //5 * 75% /26 *4 ~= 0.576923076923077 (vesting)

    await dobStakingPool.connect(bob).redeemReward();

    expect(await uHODL.balanceOf(bob.address)).to.equal("3653846153846153844");
    expect(await bHODL.balanceOf(bob.address)).to.equal("1826923076923076920");
  });

  it("Multi user stake DOB can earn fee reward, and can claim vesting reward(stake -> draw -> claim)", async function () {
    //bob stake 100 DOB he staking amount should be 100, pool staking amount should be 100
    await expect(dobStakingPool.connect(bob).stake(expandTo18Decimals(100)))
      .to.emit(dobStakingPool, "Staked")
      .withArgs(bob.address, expandTo18Decimals(100));

    expect(
      (await dobStakingPool.userDatas(bob.address)).totalStakingAmount
    ).to.equal(expandTo18Decimals(100));
    expect((await dobStakingPool.poolData()).stakingAmount).to.equal(
      expandTo18Decimals(100)
    );

    //charlie stake 200 DOB he staking amount should be 200, pool staking amount should be 300
    await expect(dobStakingPool.connect(charlie).stake(expandTo18Decimals(200)))
      .to.emit(dobStakingPool, "Staked")
      .withArgs(charlie.address, expandTo18Decimals(200));

    expect(
      (await dobStakingPool.userDatas(charlie.address)).totalStakingAmount
    ).to.equal(expandTo18Decimals(200));
    expect((await dobStakingPool.poolData()).stakingAmount).to.equal(
      expandTo18Decimals(300)
    );
    //Before draw reward should be no accu reward
    let rewardInfo = await dobStakingPool.getReward(bob.address);
    expect(rewardInfo[0]).to.equal(BigNumber.from(0));
    expect(rewardInfo[1]).to.equal(BigNumber.from(0));
    expect(await bullet.balanceOf(bob.address)).to.equal(BigNumber.from(0));

    rewardInfo = await dobStakingPool.getReward(charlie.address);
    expect(rewardInfo[0]).to.equal(BigNumber.from(0));
    expect(rewardInfo[1]).to.equal(BigNumber.from(0));
    expect(await bullet.balanceOf(charlie.address)).to.equal(BigNumber.from(0));
    //Distribute to fee collector and bullet collector(Mock collect fee and bullet)
    await uHODL.connect(deployer).transfer(
      feeCollector.address, // recipient
      expandTo18Decimals(10) // amount
    );
    await bHODL.connect(deployer).transfer(
      feeCollector.address, // recipient
      expandTo18Decimals(5) // amount
    );
    await bullet.connect(deployer).transfer(
      bulletCollector.address, // recipient
      expandTo18Decimals(2) // amount
    );

    //After worker run drewReward() should be has accu reward
    await dobStakingPool.connect(worker).drawReward();

    //bob earn 1/3 reward
    rewardInfo = await dobStakingPool.getReward(bob.address);
    await increase(duration.days(1));
    expect(rewardInfo[0]).to.equal("3333333333333333333"); //uHODL
    expect(rewardInfo[1]).to.equal("1666666666666666666"); //bHODL
    expect(await bullet.balanceOf(bob.address)).to.equal("666666666666666666");

    //bob earn 2/3 reward
    rewardInfo = await dobStakingPool.getReward(charlie.address);
    await increase(duration.days(1));
    expect(rewardInfo[0]).to.equal("6666666666666666666"); //uHODL
    expect(rewardInfo[1]).to.equal("3333333333333333332"); //bHODL
    expect(await bullet.balanceOf(charlie.address)).to.equal(
      "1333333333333333333"
    );

    //claim reward,25% withdrawable,75% vested

    await dobStakingPool.connect(bob).redeemReward();

    expect(await uHODL.balanceOf(bob.address)).to.equal("833333333333333358");
    expect(await bHODL.balanceOf(bob.address)).to.equal("416666666666666716");

    await dobStakingPool.connect(charlie).redeemReward();

    expect(await uHODL.balanceOf(charlie.address)).to.equal(
      "1666666666666666716"
    );
    expect(await bHODL.balanceOf(charlie.address)).to.equal(
      "833333333333333357"
    );
  });
  it("Only owner can call  pause", async function () {
    await expect(dobStakingPool.connect(bob).pause()).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });
  it("Pause test", async function () {
    await dobStakingPool.connect(deployer).pause();
    await expect(
      dobStakingPool.connect(bob).stake(expandTo18Decimals(100))
    ).to.be.revertedWith("Pausable: paused");
  });
  it("Only paused can calll emergency unstake", async function () {
    await expect(
      dobStakingPool.connect(bob).emergencyUnstake()
    ).to.be.revertedWith("Pausable: not paused");
  });
  it("Emergency unstake test", async function () {
    expect(await dob.balanceOf(bob.address)).to.equal(
      expandTo18Decimals(10_000)
    );
    await dobStakingPool.connect(bob).stake(expandTo18Decimals(100));

    expect(await dob.balanceOf(bob.address)).to.equal(
      expandTo18Decimals(10_000).sub(expandTo18Decimals(100))
    );
    expect(
      (await dobStakingPool.userDatas(bob.address)).totalStakingAmount
    ).to.equal(expandTo18Decimals(100));

    expect((await dobStakingPool.poolData()).stakingAmount).to.equal(
      expandTo18Decimals(100)
    );
    await dobStakingPool.connect(deployer).pause();
    await dobStakingPool.connect(bob).emergencyUnstake();

    expect((await dobStakingPool.poolData()).stakingAmount).to.equal(
      expandTo18Decimals(0)
    );
    expect(await dob.balanceOf(bob.address)).to.equal(
      expandTo18Decimals(10_000)
    );
  });
});
